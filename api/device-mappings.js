import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

function toMapping(row) {
  if (row.assignment === "code_indoor") {
    return [row.device_uuid, { appliesTo: ["Code"], type: "indoor" }];
  }
  if (row.assignment === "passivehouse_indoor") {
    return [row.device_uuid, { appliesTo: ["PassiveHouse"], type: "indoor" }];
  }
  if (row.assignment === "outdoor_shared") {
    return [row.device_uuid, { appliesTo: ["Code", "PassiveHouse"], type: "outdoor" }];
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("milesight_devices")
      .select("device_uuid,assignment")
      .not("assignment", "is", null);

    if (error) throw error;

    const entries = (data || []).map(toMapping).filter(Boolean);
    return res.status(200).json(Object.fromEntries(entries));
  } catch (error) {
    console.error("[api/device-mappings]", error);
    return res.status(500).json({ error: "Unable to load device mappings" });
  }
}
