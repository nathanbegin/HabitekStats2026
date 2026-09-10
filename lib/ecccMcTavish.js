const ECCC_PAST_URL = "https://weather.gc.ca/past_conditions/index_e.html?station=wta";
const ECCC_SWOB_URL = "https://api.weather.gc.ca/collections/swob-realtime/items";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&deg;/gi, "°")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function firstNumber(value) {
  const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? finiteNumber(match[0]) : null;
}

function attribute(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] || null;
}

function normalizeHeader(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function relativeHumidityFromDewPoint(tempC, dewPointC) {
  if (!Number.isFinite(tempC) || !Number.isFinite(dewPointC)) return null;
  const a = 17.625;
  const b = 243.04;
  const rh = 100 * Math.exp((a * dewPointC) / (b + dewPointC) - (a * tempC) / (b + tempC));
  return Number.isFinite(rh) ? Math.max(0, Math.min(100, Math.round(rh))) : null;
}

function parseHeaderMap(html) {
  const byId = new Map();
  for (const match of String(html || "").matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)) {
    const id = attribute(match[1], "id");
    if (!id) continue;
    const text = normalizeHeader(decodeHtml(match[2]));
    let key = null;
    if (text.includes("date") && text.includes("time")) key = "time";
    else if (text.includes("relative") && text.includes("humidity")) key = "humidity";
    else if (text.includes("dew") && text.includes("point")) key = "dewPoint";
    else if (text.includes("temperature")) key = "temperature";
    else if (text.includes("pressure")) key = "pressure";
    if (key) byId.set(id, key);
  }
  return byId;
}

function parseCells(rowHtml, headerMap) {
  const cells = [];
  for (const match of String(rowHtml || "").matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
    const attrs = match[2] || "";
    const text = decodeHtml(match[3]);
    const headers = (attribute(attrs, "headers") || "").split(/\s+/).filter(Boolean);
    const keys = headers.map((id) => headerMap.get(id)).filter(Boolean);
    cells.push({ text, attrs, keys });
  }
  return cells;
}

function cellByKey(cells, key) {
  return cells.find((cell) => cell.keys.includes(key)) || null;
}

function inferByLayout(cells) {
  // Fallback for any ECCC markup variant that omits header associations.
  // Locate pressure first because its range is distinctive, then use the
  // documented order RH -> dew point -> pressure.
  let pressureIndex = -1;
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const value = firstNumber(cells[i]?.text);
    if (Number.isFinite(value) && value >= 80 && value <= 110) {
      pressureIndex = i;
      break;
    }
  }

  const temperature = firstNumber(cells[2]?.text);
  const humidity = pressureIndex >= 2 ? firstNumber(cells[pressureIndex - 2]?.text) : null;
  const dewPoint = pressureIndex >= 1 ? firstNumber(cells[pressureIndex - 1]?.text) : null;

  return { temperature, humidity, dewPoint };
}

export function parsePublicMcTavishPage(html) {
  const source = String(html || "");
  const headerMap = parseHeaderMap(source);
  const pageText = decodeHtml(source);
  const zoneMatch = pageText.match(/Date\s*\/\s*Time\s*\((?:[^)]*\b)?(EDT|EST)\b/i);
  const zone = zoneMatch?.[1]?.toUpperCase() || "EDT";
  const offset = zone === "EST" ? "-05:00" : "-04:00";

  const rows = [...source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  let currentDate = null;

  for (const row of rows) {
    const cells = parseCells(row[1], headerMap);
    if (!cells.length) continue;

    const joined = cells.map((cell) => cell.text).join(" ");
    const dateMatch = joined.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
    if (dateMatch && !/^\d{1,2}:\d{2}$/.test(cells[0]?.text || "")) {
      currentDate = {
        day: Number(dateMatch[1]),
        month: MONTHS[dateMatch[2].toLowerCase()],
        year: Number(dateMatch[3]),
      };
      continue;
    }

    const timeCell = cellByKey(cells, "time") || cells[0];
    const timeMatch = timeCell?.text?.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch || !currentDate) continue;

    const inferred = inferByLayout(cells);
    const temperature = firstNumber(cellByKey(cells, "temperature")?.text) ?? inferred.temperature;
    const reportedHumidity = firstNumber(cellByKey(cells, "humidity")?.text) ?? inferred.humidity;
    const dewPoint = firstNumber(cellByKey(cells, "dewPoint")?.text) ?? inferred.dewPoint;

    const humidity = Number.isFinite(reportedHumidity) && reportedHumidity >= 0 && reportedHumidity <= 100
      ? reportedHumidity
      : relativeHumidityFromDewPoint(temperature, dewPoint);

    if (temperature == null && humidity == null) continue;

    const y = String(currentDate.year).padStart(4, "0");
    const m = String(currentDate.month).padStart(2, "0");
    const d = String(currentDate.day).padStart(2, "0");
    const hh = String(Number(timeMatch[1])).padStart(2, "0");
    const mm = timeMatch[2];

    return {
      source: "ECCC",
      source_detail: "weather.gc.ca past conditions",
      station: "McTavish",
      station_id: "WTA",
      temperature,
      humidity,
      humidity_source: Number.isFinite(reportedHumidity) ? "reported" : "derived_from_dew_point",
      observed_at: `${y}-${m}-${d}T${hh}:${mm}:00${offset}`,
      observed_timezone: zone,
      latitude: 45.5,
      longitude: -73.58,
    };
  }

  return null;
}

function normalizeEcccDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  let candidate = raw.replace(" ", "T");

  if (/^\d{8}T?\d{6}Z?$/.test(candidate)) {
    const compact = candidate.replace(/T|Z/g, "");
    candidate = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:${compact.slice(12, 14)}Z`;
  } else if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(candidate)) {
    candidate += "Z";
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

async function fetchSwobFallback(signal) {
  const url = `${ECCC_SWOB_URL}?stn_id-value=WTA&limit=12&sortby=-date_tm-value&f=json`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json, application/json",
      "User-Agent": "HabiTEK-Stats/2026 (stats.habitek.ca)",
    },
    signal,
  });
  if (!response.ok) throw new Error(`ECCC SWOB responded ${response.status}`);

  const payload = await response.json();
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const selected = features.find((feature) => {
    const p = feature?.properties || {};
    return finiteNumber(p.air_temp) != null || finiteNumber(p.rel_hum) != null;
  });
  if (!selected) return null;

  const p = selected.properties || {};
  return {
    source: "ECCC",
    source_detail: "SWOB fallback",
    station: p["stn_nam-value"] || "McTavish",
    station_id: p["stn_id-value"] || "WTA",
    temperature: finiteNumber(p.air_temp),
    humidity: finiteNumber(p.rel_hum),
    humidity_source: "reported",
    observed_at: normalizeEcccDate(p["date_tm-value"] || p.obs_date_tm || p.processed_date_tm),
    latitude: 45.5,
    longitude: -73.58,
  };
}

export async function fetchMcTavishWeather(signal) {
  try {
    const response = await fetch(ECCC_PAST_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "HabiTEK-Stats/2026 (stats.habitek.ca)",
      },
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(`ECCC public page responded ${response.status}`);
    const observation = parsePublicMcTavishPage(await response.text());
    if (!observation) throw new Error("Unable to parse latest McTavish hourly observation");
    return observation;
  } catch (pageError) {
    console.warn("[ECCC] public McTavish page unavailable", pageError?.message || pageError);
    return fetchSwobFallback(signal);
  }
}
