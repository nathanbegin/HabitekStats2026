import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

const ECCC_PAST_URL = "https://weather.gc.ca/past_conditions/index_e.html?station=wta";
const ECCC_SWOB_URL = "https://api.weather.gc.ca/collections/swob-realtime/items";
const ECCC_CACHE_MS = 5 * 60 * 1000;
let ecccCache = null;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function htmlText(value) {
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

function parsePublicMcTavishPage(html) {
  // This is the same official hourly table the user sees on weather.gc.ca.
  // Prefer it over SWOB so the dashboard reference matches the public ECCC page.
  const rows = [...String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const pageText = htmlText(html);
  const zoneMatch = pageText.match(/Date\s*\/\s*Time\s*\((EDT|EST)/i);
  const zone = zoneMatch?.[1]?.toUpperCase() || "EDT";
  const offset = zone === "EST" ? "-05:00" : "-04:00";

  let currentDate = null;

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => htmlText(match[1]));

    if (!cells.length) continue;

    const dateText = cells.join(" ");
    const dateMatch = dateText.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
    if (dateMatch && !/^\d{1,2}:\d{2}$/.test(cells[0])) {
      currentDate = {
        day: Number(dateMatch[1]),
        month: MONTHS[dateMatch[2].toLowerCase()],
        year: Number(dateMatch[3]),
      };
      continue;
    }

    const timeMatch = cells[0].match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch || !currentDate || cells.length < 6) continue;

    const temperature = firstNumber(cells[2]);
    const humidity = firstNumber(cells[5]);
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
      observed_at: `${y}-${m}-${d}T${hh}:${mm}:00${offset}`,
      observed_timezone: zone,
      latitude: 45.5,
      longitude: -73.58,
    };
  }

  return null;
}

async function fetchPublicMcTavish(signal) {
  const response = await fetch(ECCC_PAST_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "HabiTEK-Stats/2026 (stats.habitek.ca)",
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) throw new Error(`ECCC public page responded ${response.status}`);
  const html = await response.text();
  const observation = parsePublicMcTavishPage(html);
  if (!observation) throw new Error("Unable to parse latest McTavish hourly observation");
  return observation;
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
  const stationUrl = `${ECCC_SWOB_URL}?stn_id-value=WTA&limit=12&sortby=-date_tm-value&f=json`;
  const response = await fetch(stationUrl, {
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
    observed_at: normalizeEcccDate(p["date_tm-value"] || p.obs_date_tm || p.processed_date_tm),
    latitude: 45.5,
    longitude: -73.58,
  };
}

async function loadExternalWeather() {
  const now = Date.now();
  if (ecccCache && now - ecccCache.cachedAt < ECCC_CACHE_MS) return ecccCache.value;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);

  try {
    let value;
    try {
      value = await fetchPublicMcTavish(controller.signal);
    } catch (pageError) {
      console.warn("[api/latest] ECCC public McTavish page unavailable", pageError?.message || pageError);
      value = await fetchSwobFallback(controller.signal);
    }

    if (!value) throw new Error("ECCC McTavish observation not found");
    ecccCache = { cachedAt: now, value };
    return value;
  } catch (error) {
    console.warn("[api/latest] ECCC McTavish unavailable", error?.message || error);
    return ecccCache?.value || null;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const supabase = getSupabaseAdmin();

    const [{ data, error }, externalWeather] = await Promise.all([
      supabase
        .from("device_data")
        .select("device_uuid,timestamp,record_type,data")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadExternalWeather(),
    ]);

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No data", external_weather: externalWeather });

    return res.status(200).json({
      ...data,
      external_weather: externalWeather,
    });
  } catch (error) {
    console.error("[api/latest]", error);
    return res.status(500).json({ error: "Unable to load latest data" });
  }
}
