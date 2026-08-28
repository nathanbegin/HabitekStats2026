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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const events = Array.isArray(body) ? body : [body];

    const rows = events.map(normalizeEvent).filter(Boolean);

    if (rows.length === 0) {
      return res.status(200).json({ status: "OK", inserted: 0 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("device_data").insert(rows);

    if (error) throw error;

    return res.status(200).json({ status: "OK", inserted: rows.length });
  } catch (error) {
    console.error("[api/milesight-webhook]", error);
    return res.status(400).json({ error: "Invalid webhook payload" });
  }
}
