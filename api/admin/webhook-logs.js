import { isAdminRequest } from "../../lib/adminAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("webhook_events")
      .select("id,received_at,status,http_status,authorized,event_count,inserted_count,device_uuids,record_types,message")
      .order("received_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    console.error("[api/admin/webhook-logs]", error);
    return res.status(500).json({ error: "Impossible de charger les logs webhook" });
  }
}
