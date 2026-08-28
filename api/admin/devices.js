import { isAdminRequest } from "../../lib/adminAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin.js";

const VALID_ASSIGNMENTS = new Set([
  "code_indoor",
  "passivehouse_indoor",
  "outdoor_shared",
  "unassigned",
]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("milesight_devices")
      .select("device_uuid,nickname,first_seen_at,last_seen_at,record_type,latest_data,assignment,updated_at")
      .order("last_seen_at", { ascending: false });

    if (error) {
      console.error("[api/admin/devices GET]", error);
      return res.status(500).json({ error: "Impossible de charger les capteurs" });
    }

    return res.status(200).json(data || []);
  }

  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const deviceUuid = String(body?.device_uuid || "").trim();
      const hasAssignment = Object.prototype.hasOwnProperty.call(body || {}, "assignment");
      const hasNickname = Object.prototype.hasOwnProperty.call(body || {}, "nickname");

      if (!deviceUuid || (!hasAssignment && !hasNickname)) {
        return res.status(400).json({ error: "Modification invalide" });
      }

      const updates = { updated_at: new Date().toISOString() };

      if (hasAssignment) {
        const assignment = String(body?.assignment || "unassigned");
        if (!VALID_ASSIGNMENTS.has(assignment)) {
          return res.status(400).json({ error: "Assignation invalide" });
        }
        updates.assignment = assignment === "unassigned" ? null : assignment;
      }

      if (hasNickname) {
        const nickname = String(body?.nickname || "").trim();
        if (nickname.length > 80) {
          return res.status(400).json({ error: "Le surnom doit contenir au maximum 80 caractères" });
        }
        updates.nickname = nickname || null;
      }

      const { data, error } = await supabase
        .from("milesight_devices")
        .update(updates)
        .eq("device_uuid", deviceUuid)
        .select("device_uuid,nickname,assignment,last_seen_at,record_type,latest_data")
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Capteur introuvable" });

      return res.status(200).json(data);
    } catch (error) {
      console.error("[api/admin/devices POST]", error);
      return res.status(500).json({ error: "Impossible de modifier le capteur" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
