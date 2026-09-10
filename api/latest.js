import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

const ECCC_BASE_URL = "https://api.weather.gc.ca/collections/swob-realtime/items";
const ECCC_CACHE_MS = 5 * 60 * 1000;
let ecccCache = null;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEcccDate(value) {
  if (!value) return null;
  const raw = String(value).trim();

  // GeoMet normally returns an ISO timestamp. Keep an explicit timezone when
  // present; otherwise treat SWOB timestamps as UTC so the browser does not
  // reinterpret them as local Montreal time.
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

async function fetchEccc(url, signal) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json, application/json",
      "User-Agent": "HabiTEK-Stats/2026 (stats.habitek.ca)",
    },
    signal,
  });

  if (!response.ok) throw new Error(`ECCC responded ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.features) ? payload.features : [];
}

async function loadExternalWeather() {
  const now = Date.now();
  if (ecccCache && now - ecccCache.cachedAt < ECCC_CACHE_MS) {
    return ecccCache.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    // GeoMet's own SWOB documentation uses date_tm-value for chronological
    // sorting. Request a few WTA records so we can still select the newest
    // usable observation if one row has a missing field.
    const stationUrl =
      `${ECCC_BASE_URL}?stn_id-value=WTA&limit=6&sortby=-date_tm-value&f=json`;

    let features = await fetchEccc(stationUrl, controller.signal);

    // Fallback to a tight box around McTavish if the station identifier query
    // unexpectedly returns no rows.
    if (!features.length) {
      const fallbackUrl =
        `${ECCC_BASE_URL}?bbox=-73.59,45.49,-73.57,45.51&limit=20&sortby=-date_tm-value&f=json`;
      features = await fetchEccc(fallbackUrl, controller.signal);
    }

    const candidates = features
      .map((feature) => ({ feature, properties: feature?.properties || {} }))
      .filter(({ properties }) => {
        const id = String(properties["stn_id-value"] || "").toUpperCase();
        const name = String(properties["stn_nam-value"] || "").toLowerCase();
        return id === "WTA" || name.includes("mctavish") || name.includes("mc tavish");
      });

    const pool = candidates.length ? candidates : features.map((feature) => ({
      feature,
      properties: feature?.properties || {},
    }));

    const selected = pool.find(({ properties }) =>
      finiteNumber(properties.air_temp) != null || finiteNumber(properties.rel_hum) != null
    );

    if (!selected) throw new Error("ECCC McTavish observation not found");

    const properties = selected.properties;
    const temperature = finiteNumber(properties.air_temp);
    const humidity = finiteNumber(properties.rel_hum);

    // date_tm-value is the official SWOB timestamp used by GeoMet for sorting.
    // It is preferred over obs_date_tm to avoid displaying a processing or
    // alternate timestamp as if it were the public observation time.
    const observedAt = normalizeEcccDate(
      properties["date_tm-value"] ||
      properties.obs_date_tm ||
      properties.processed_date_tm ||
      null
    );

    const value = {
      source: "ECCC",
      station: properties["stn_nam-value"] || "McTavish",
      station_id: properties["stn_id-value"] || "WTA",
      temperature,
      humidity,
      observed_at: observedAt,
      latitude: 45.5,
      longitude: -73.58,
    };

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
