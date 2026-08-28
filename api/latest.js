import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("device_data")
      .select("device_uuid,timestamp,record_type,data")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No data" });

    return res.status(200).json(data);
  } catch (error) {
    console.error("[api/latest]", error);
    return res.status(500).json({ error: "Unable to load latest data" });
  }
}
