import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const supabase = getSupabaseAdmin();

    const requestedLimit = Number.parseInt(req.query.limit ?? "100", 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 50000);

    const end = req.query.end_timestamp
      ? new Date(req.query.end_timestamp)
      : new Date();

    const start = req.query.start_timestamp
      ? new Date(req.query.start_timestamp)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid start_timestamp or end_timestamp" });
    }

    if (start > end) {
      return res.status(400).json({ error: "start_timestamp must be before end_timestamp" });
    }

    const rows = [];
    const pageSize = 1000;

    for (let from = 0; from < limit; from += pageSize) {
      const to = Math.min(from + pageSize - 1, limit - 1);

      const { data, error } = await supabase
        .from("device_data")
        .select("device_uuid,timestamp,record_type,data")
        .gte("timestamp", start.toISOString())
        .lte("timestamp", end.toISOString())
        .order("timestamp", { ascending: false })
        .range(from, to);

      if (error) throw error;

      rows.push(...(data || []));

      if (!data || data.length < pageSize) break;
    }

    return res.status(200).json(rows.slice(0, limit));
  } catch (error) {
    console.error("[api/history]", error);
    return res.status(500).json({ error: "Unable to load history" });
  }
}
