import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

const ECCC_URL =
  "https://api.weather.gc.ca/collections/swob-realtime/items?bbox=-73.585,45.495,-73.575,45.505&limit=1&f=json";
const ECCC_CACHE_MS = 5 * 60 * 1000;
let ecccCache = null;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadExternalWeather() {
  const now = Date.now();
  if (ecccCache && now - ecccCache.cachedAt < ECCC_CACHE_MS) {
    return ecccCache.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(ECCC_URL, {
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": "HabiTEK-Stats/2026 (stats.habitek.ca)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ECCC responded ${response.status}`);
    }

    const payload = await response.json();
    const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
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
