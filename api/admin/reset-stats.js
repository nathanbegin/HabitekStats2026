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
    const action = String(body?.action || "reset_all");

    if (!verifyAdminPassword(password)) {
      return res.status(401).json({ error: "Mot de passe administrateur invalide" });
    }

    const supabase = getSupabaseAdmin();

    if (action === "keep_recent_hours") {
      if (confirmation !== "KEEP_RECENT_HOURS") {
        return res.status(400).json({ error: "Confirmation invalide" });
      }

      const keepHours = Number(body?.keep_hours);
      if (!Number.isFinite(keepHours) || keepHours < 1 || keepHours > 8760) {
        return res.status(400).json({
          error: "Le nombre d'heures doit être compris entre 1 et 8760.",
        });
      }

      const normalizedHours = Math.round(keepHours * 100) / 100;
      const cutoff = new Date(
        Date.now() - normalizedHours * 60 * 60 * 1000
      ).toISOString();

      const { count, error: countError } = await supabase
        .from("device_data")
        .select("id", { count: "exact", head: true })
        .lt("timestamp", cutoff);

      if (countError) throw countError;

      const { error: deleteError } = await supabase
        .from("device_data")
        .delete()
        .lt("timestamp", cutoff);

      if (deleteError) throw deleteError;

      return res.status(200).json({
        ok: true,
        action,
        keep_hours: normalizedHours,
        cutoff,
        deleted_measurements: count || 0,
        preserved: [
          "recent_measurements",
          "devices",
          "nicknames",
          "assignments",
          "webhook_logs",
          "latest_device_state",
        ],
      });
    }

    if (confirmation !== "RESET_STATS") {
      return res.status(400).json({ error: "Confirmation invalide" });
    }

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
      action: "reset_all",
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
