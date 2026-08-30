import { isAdminRequest } from "../../lib/adminAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin.js";

const DEFAULT_DAILY_LIMIT = 1000;
const PAGE_SIZE = 1000;
const MAX_ROWS = 10000;

function averageIntervalSeconds(timestamps) {
  if (!Array.isArray(timestamps) || timestamps.length < 2) return null;

  const sorted = [...timestamps].sort((a, b) => a - b);
  let total = 0;
  let intervals = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const delta = sorted[index] - sorted[index - 1];
    if (Number.isFinite(delta) && delta >= 0) {
      total += delta;
      intervals += 1;
    }
  }

  if (!intervals) return null;
  return Math.round(total / intervals / 1000);
}

async function getWebhookStats(supabase) {
  const now = new Date();
  const cutoffDate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
  const cutoff = cutoffDate.toISOString();
  const rows = [];

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("webhook_events")
      .select("id,received_at,status,event_count,device_uuids")
      .gte("received_at", cutoff)
      .order("received_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  const byDevice = new Map();
  let totalEvents = 0;
  let unattributedRequests = 0;

  for (const row of rows) {
    totalEvents += Number(row.event_count || 0);

    const timestamp = new Date(row.received_at).getTime();
    const uuids = Array.isArray(row.device_uuids)
      ? [...new Set(row.device_uuids.filter(Boolean).map(String))]
      : [];

    if (!uuids.length) {
      unattributedRequests += 1;
      continue;
    }

    for (const deviceUuid of uuids) {
      const current = byDevice.get(deviceUuid) || {
        device_uuid: deviceUuid,
        count: 0,
        timestamps: [],
        first_received_at: null,
        last_received_at: null,
      };

      current.count += 1;

      if (Number.isFinite(timestamp)) {
        current.timestamps.push(timestamp);
        if (!current.first_received_at) current.first_received_at = row.received_at;
        current.last_received_at = row.received_at;
      }

      byDevice.set(deviceUuid, current);
    }
  }

  const devices = Array.from(byDevice.values())
    .map((device) => ({
      device_uuid: device.device_uuid,
      webhook_count: device.count,
      average_interval_seconds: averageIntervalSeconds(device.timestamps),
      first_received_at: device.first_received_at,
      last_received_at: device.last_received_at,
    }))
    .sort((a, b) => b.webhook_count - a.webhook_count);

  const configuredLimit = Number(process.env.MILESIGHT_WEBHOOK_DAILY_LIMIT);
  const quotaLimit =
    Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.round(configuredLimit)
      : DEFAULT_DAILY_LIMIT;

  const totalRequests = rows.length;
  const usedPercent = quotaLimit
    ? Math.min(100, Math.round((totalRequests / quotaLimit) * 1000) / 10)
    : null;

  return {
    reset_basis: "00:00:00 UTC",
    from: cutoff,
    to: now.toISOString(),
    webhook_requests: totalRequests,
    event_count: totalEvents,
    unattributed_requests: unattributedRequests,
    quota_limit: quotaLimit,
    quota_remaining: Math.max(0, quotaLimit - totalRequests),
    quota_used_percent: usedPercent,
    truncated: rows.length >= MAX_ROWS,
    devices,
  };
}

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

    if (req.query?.view === "stats") {
      const stats = await getWebhookStats(supabase);
      return res.status(200).json(stats);
    }

    const { data, error } = await supabase
      .from("webhook_events")
      .select("id,received_at,status,http_status,authorized,event_count,inserted_count,device_uuids,record_types,message")
      .order("received_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    console.error("[api/admin/webhook-logs]", error);
    return res.status(500).json({
      error:
        req.query?.view === "stats"
          ? "Impossible de calculer les statistiques webhook depuis 00:00 UTC."
          : "Impossible de charger les logs webhook",
    });
  }
}
