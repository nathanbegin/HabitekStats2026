import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

const ECCC_URL =
  "https://api.weather.gc.ca/collections/swob-realtime/items?f=json&url=WTA&sortby=-date_tm-value&limit=1&properties=date_tm-value,obs_date_tm,processed_date_tm,stn_nam-value,stn_id-value,air_temp,rel_hum";
const ECCC_FALLBACK_URL =
  "https://api.weather.gc.ca/collections/swob-realtime/items?f=json&bbox=-73.61,45.47,-73.54,45.53&sortby=-date_tm-value&limit=50";
const ECCC_CACHE_MS = 5 * 60 * 1000;
let ecccCache = null;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json, application/json",
      "User-Agent": "HabiTEK-Stats/2026 (stats.habitek.ca)",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`ECCC responded ${response.status}`);
  }

  return response.json();
}

function chooseMcTavishFeature(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  if (!features.length) return null;

  return (
    features.find((feature) => {
      const properties = feature?.properties || {};
      const stationId = String(properties["stn_id-value"] || "").toUpperCase();
      const stationName = String(properties["stn_nam-value"] || "").toLowerCase();
      const urlCode = String(properties.url || "").toUpperCase();
      return stationId === "WTA" || urlCode === "WTA" || stationName.includes("mctavish");
    }) || features[0]
  );
}

async function loadExternalWeather() {
  const now = Date.now();
  if (ecccCache && now - ecccCache.cachedAt < ECCC_CACHE_MS) {
    return ecccCache.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    let payload = await fetchJson(ECCC_URL, controller.signal);
    let feature = chooseMcTavishFeature(payload);

    if (!feature) {
      payload = await fetchJson(ECCC_FALLBACK_URL, controller.signal);
      feature = chooseMcTavishFeature(payload);
    }

    const properties = feature?.properties || {};
    const temperature = finiteNumber(properties.air_temp);
    const humidity = finiteNumber(properties.rel_hum);
    const observedAt =
      properties.obs_date_tm ||
      properties["date_tm-value"] ||
      properties.processed_date_tm ||
      null;

    if (temperature == null && humidity == null) {
      throw new Error("ECCC observation has no temperature or humidity");
    }

    const value = {
      source: "ECCC",
      station: properties["stn_nam-value"] || "McTavish",
      station_id: properties["stn_id-value"] || "WTA",
      temperature,
      humidity,
      observed_at: observedAt,
      latitude: feature?.geometry?.coordinates?.[1] ?? 45.5,
      longitude: feature?.geometry?.coordinates?.[0] ?? -73.58,
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
