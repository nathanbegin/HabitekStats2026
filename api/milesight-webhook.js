import crypto from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ""));
  const bBuf = Buffer.from(String(b || ""));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function isAuthorized(req) {
  const configuredSecret = process.env.MILESIGHT_WEBHOOK_SECRET;
  if (!configuredSecret) return true;

  const headerSecret =
    req.headers["x-webhook-secret"] ||
    (typeof req.headers.authorization === "string" &&
    req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "");

  const querySecret = typeof req.query?.secret === "string" ? req.query.secret : "";
  return safeEqual(headerSecret || querySecret, configuredSecret);
}

function classify(values) {
  if (values && ("image" in values || "snapType" in values)) return "camera";
  if (values && ("temperature" in values || "humidity" in values)) return "sensor";
  return "unknown";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(left, right) {
  if (!isPlainObject(left)) return isPlainObject(right) ? { ...right } : right;
  if (!isPlainObject(right)) return { ...left };

  const merged = { ...left };

  for (const [key, value] of Object.entries(right)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function normalizeEvent(evt) {
  const data = evt?.data || {};
  const profile = data.deviceProfile || {};
  const deviceUuid = profile.devEUI || profile.sn;

  if (!deviceUuid) return null;

  const rawTs =
    data.ts ??
    (evt?.eventCreatedTime ? Number(evt.eventCreatedTime) * 1000 : Date.now());

  const tsNumber = Number(rawTs);
  const timestamp = new Date(Number.isFinite(tsNumber) ? tsNumber : Date.now());

  const payload = data.payload || {};
  const values = payload.values || payload;

  return {
    device_uuid: String(deviceUuid),
    timestamp: timestamp.toISOString(),
    record_type: classify(values),
    data: values || {},
  };
}

function requestMeta(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();

  return {
    source_ip: forwarded || req.headers["x-real-ip"] || null,
    user_agent: req.headers["user-agent"] || null,
    request_id: req.headers["x-vercel-id"] || req.headers["x-request-id"] || null,
  };
}

async function writeWebhookLog(supabase, fields) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("webhook_events").insert({
      ...requestMeta(fields.req),
      status: fields.status,
      http_status: fields.http_status,
      authorized: fields.authorized,
      event_count: fields.event_count ?? 0,
      inserted_count: fields.inserted_count ?? 0,
      device_uuids: fields.device_uuids ?? [],
      record_types: fields.record_types ?? [],
      message: fields.message ?? null,
    });

    if (error) {
      console.error("[webhook log insert]", error);
    }
  } catch (error) {
    console.error("[webhook log insert]", error);
  }
}

export default async function handler(req, res) {
  let supabase;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[api/milesight-webhook] Supabase config error", error);
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    await writeWebhookLog(supabase, {
      req,
      status: "rejected",
      http_status: 405,
      authorized: null,
      message: `Méthode ${req.method} rejetée`,
    });
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authorized = isAuthorized(req);

  if (!authorized) {
    await writeWebhookLog(supabase, {
      req,
      status: "rejected",
      http_status: 401,
      authorized: false,
      message: "Webhook reçu, mais secret invalide",
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  let events;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    events = Array.isArray(body) ? body : [body];
  } catch (error) {
    console.error("[api/milesight-webhook] JSON parse error", error);
    await writeWebhookLog(supabase, {
      req,
      status: "error",
      http_status: 400,
      authorized: true,
      message: "Webhook reçu, mais JSON invalide",
    });
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const rows = events.map(normalizeEvent).filter(Boolean);
  const deviceUuids = [...new Set(rows.map((row) => row.device_uuid))];
  const recordTypes = [...new Set(rows.map((row) => row.record_type))];

  if (rows.length === 0) {
    await writeWebhookLog(supabase, {
      req,
      status: "ignored",
      http_status: 200,
      authorized: true,
      event_count: events.length,
      inserted_count: 0,
      message: "Webhook reçu, mais aucun DevEUI/numéro de série exploitable",
    });
    return res.status(200).json({ status: "OK", inserted: 0 });
  }

  try {
    const { error: insertError } = await supabase.from("device_data").insert(rows);
    if (insertError) throw insertError;

    const devicesByUuid = new Map();
    rows.forEach((row) => {
      const current = devicesByUuid.get(row.device_uuid);
      const rowTime = new Date(row.timestamp).getTime();
      const currentTime = current
        ? new Date(current.last_seen_at).getTime()
        : Number.NEGATIVE_INFINITY;

      if (!current || rowTime > currentTime) {
        devicesByUuid.set(row.device_uuid, {
          device_uuid: row.device_uuid,
          last_seen_at: row.timestamp,
          record_type: row.record_type,
          latest_data: row.data || {},
          updated_at: new Date().toISOString(),
        });
        return;
      }

      // The SG50 can send multiple PROPERTY events for the same timestamp:
      // one with general gateway data and another with battery_info/device_info.
      // Merge them so the registry keeps the complete snapshot.
      if (rowTime === currentTime) {
        current.latest_data = deepMerge(current.latest_data || {}, row.data || {});
        if (current.record_type === "unknown" && row.record_type !== "unknown") {
          current.record_type = row.record_type;
        }
        current.updated_at = new Date().toISOString();
      }
    });

    const deviceRows = Array.from(devicesByUuid.values());
    const { error: registryError } = await supabase
      .from("milesight_devices")
      .upsert(deviceRows, { onConflict: "device_uuid" });

    if (registryError) throw registryError;

    await writeWebhookLog(supabase, {
      req,
      status: "processed",
      http_status: 200,
      authorized: true,
      event_count: events.length,
      inserted_count: rows.length,
      device_uuids: deviceUuids,
      record_types: recordTypes,
      message: `${rows.length} événement(s) enregistré(s)`,
    });

    return res.status(200).json({
      status: "OK",
      inserted: rows.length,
      devices_seen: deviceRows.length,
    });
  } catch (error) {
    console.error("[api/milesight-webhook]", error);

    await writeWebhookLog(supabase, {
      req,
      status: "error",
      http_status: 500,
      authorized: true,
      event_count: events.length,
      inserted_count: 0,
      device_uuids: deviceUuids,
      record_types: recordTypes,
      message: error?.message
        ? `Erreur traitement: ${String(error.message).slice(0, 300)}`
        : "Erreur inconnue pendant le traitement",
    });

    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
