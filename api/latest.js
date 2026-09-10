import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";
import { fetchMcTavishWeather } from "../lib/ecccMcTavish.js";

const ECCC_CACHE_MS = 5 * 60 * 1000;
let ecccCache = null;

async function loadExternalWeather() {
  const now = Date.now();
  if (ecccCache && now - ecccCache.cachedAt < ECCC_CACHE_MS) {
    return ecccCache.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);

  try {
    const value = await fetchMcTavishWeather(controller.signal);
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
    if (!data) {
      return res.status(404).json({ error: "No data", external_weather: externalWeather });
    }

    return res.status(200).json({
      ...data,
      external_weather: externalWeather,
    });
  } catch (error) {
    console.error("[api/latest]", error);
    return res.status(500).json({ error: "Unable to load latest data" });
  }
}
