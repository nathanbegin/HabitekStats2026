import {
  isAdminRequest,
  verifyAdminPassword,
} from "../../lib/adminAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const password = String(body?.password || "");
    const confirmation = String(body?.confirmation || "");

    if (!verifyAdminPassword(password)) {
      return res.status(401).json({ error: "Mot de passe administrateur invalide" });
    }

    if (confirmation !== "RESET_STATS") {
      return res.status(400).json({ error: "Confirmation invalide" });
    }

    const supabase = getSupabaseAdmin();

    const { count, error: countError } = await supabase
      .from("device_data")
      .select("id", { count: "exact", head: true });

    if (countError) throw countError;

    const { error: deleteError } = await supabase
      .from("device_data")
      .delete()
      .not("id", "is", null);

    if (deleteError) throw deleteError;

    // Preserve the device registry, nicknames and assignments, but remove the
    // last test measurement shown in the admin interface.
    const { error: registryError } = await supabase
      .from("milesight_devices")
      .update({
        latest_data: {},
        record_type: null,
        updated_at: new Date().toISOString(),
      })
      .not("device_uuid", "is", null);

    if (registryError) throw registryError;

    return res.status(200).json({
      ok: true,
      deleted_measurements: count || 0,
      preserved: ["devices", "nicknames", "assignments", "webhook_logs"],
    });
  } catch (error) {
    console.error("[api/admin/reset-stats]", error);
    return res.status(500).json({
      error: "Impossible de remettre les statistiques à zéro",
    });
  }
}
