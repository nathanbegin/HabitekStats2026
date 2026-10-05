import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";


const CHALLENGE_PAIR_TOLERANCE_MS = 15 * 60 * 1000;

const asFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const average = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

async function getChallengeSummary(supabase) {
  const { data: devices, error: devicesError } = await supabase
    .from("milesight_devices")
    .select("device_uuid,assignment,updated_at")
    .in("assignment", ["code_indoor", "passivehouse_indoor"])
    .order("updated_at", { ascending: false });

  if (devicesError) throw devicesError;

  const codeDevice = (devices || []).find((device) => device.assignment === "code_indoor");
  const passiveDevice = (devices || []).find((device) => device.assignment === "passivehouse_indoor");

  if (!codeDevice || !passiveDevice) {
    return {
      available: false,
      reason: "Indoor cabin assignments are incomplete",
    };
  }

  const loadBoundary = async (deviceUuid, ascending) => {
    const { data, error } = await supabase
      .from("device_data")
      .select("timestamp")
      .eq("device_uuid", deviceUuid)
      .eq("record_type", "sensor")
      .order("timestamp", { ascending })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.timestamp ? new Date(data.timestamp) : null;
  };

  const [codeFirst, codeLast, passiveFirst, passiveLast] = await Promise.all([
    loadBoundary(codeDevice.device_uuid, true),
    loadBoundary(codeDevice.device_uuid, false),
    loadBoundary(passiveDevice.device_uuid, true),
    loadBoundary(passiveDevice.device_uuid, false),
  ]);

  if (![codeFirst, codeLast, passiveFirst, passiveLast].every((date) => date && !Number.isNaN(date.getTime()))) {
    return {
      available: false,
      reason: "Not enough historical cabin data",
    };
  }

  // Analyze only the period where both indoor sensors were simultaneously active.
  const overlapStart = new Date(Math.max(codeFirst.getTime(), passiveFirst.getTime()));
  const overlapEnd = new Date(Math.min(codeLast.getTime(), passiveLast.getTime()));

  if (overlapStart >= overlapEnd) {
    return {
      available: false,
      reason: "No common measurement period",
    };
  }

  const rows = [];
  const pageSize = 1000;
  const maxRows = 100000;

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("device_data")
      .select("device_uuid,timestamp,data")
      .in("device_uuid", [codeDevice.device_uuid, passiveDevice.device_uuid])
      .eq("record_type", "sensor")
      .gte("timestamp", overlapStart.toISOString())
      .lte("timestamp", overlapEnd.toISOString())
      .order("timestamp", { ascending: true })
      .range(from, to);

    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const toPoint = (row) => {
    const temperature = asFiniteNumber(row?.data?.temperature);
    const timestamp = new Date(row?.timestamp);
    if (temperature == null || Number.isNaN(timestamp.getTime())) return null;
    return { time: timestamp.getTime(), temperature };
  };

  const codePoints = rows
    .filter((row) => row.device_uuid === codeDevice.device_uuid)
    .map(toPoint)
    .filter(Boolean);

  const passivePoints = rows
    .filter((row) => row.device_uuid === passiveDevice.device_uuid)
    .map(toPoint)
    .filter(Boolean);

  const pairs = [];
  let codeIndex = 0;
  let passiveIndex = 0;

  while (codeIndex < codePoints.length && passiveIndex < passivePoints.length) {
    const code = codePoints[codeIndex];
    const passive = passivePoints[passiveIndex];
    const timeDelta = code.time - passive.time;

    if (Math.abs(timeDelta) <= CHALLENGE_PAIR_TOLERANCE_MS) {
      pairs.push({
        time: Math.max(code.time, passive.time),
        code: code.temperature,
        passive: passive.temperature,
        delta: code.temperature - passive.temperature,
      });
      codeIndex += 1;
      passiveIndex += 1;
    } else if (timeDelta < 0) {
      codeIndex += 1;
    } else {
      passiveIndex += 1;
    }
  }

  if (!pairs.length) {
    return {
      available: false,
      reason: "No comparable temperature samples",
    };
  }

  const codeAverage = average(pairs.map((pair) => pair.code));
  const passiveAverage = average(pairs.map((pair) => pair.passive));
  const averageDelta = average(pairs.map((pair) => pair.delta));
  const maxAbsolutePair = pairs.reduce((best, pair) =>
    Math.abs(pair.delta) > Math.abs(best.delta) ? pair : best
  , pairs[0]);

  const passiveColderCount = pairs.filter((pair) => pair.delta > 0.05).length;
  const codeColderCount = pairs.filter((pair) => pair.delta < -0.05).length;
  const equalCount = pairs.length - passiveColderCount - codeColderCount;

  return {
    available: true,
    challenge_start: new Date(pairs[0].time).toISOString(),
    challenge_end: new Date(pairs[pairs.length - 1].time).toISOString(),
    paired_samples: pairs.length,
    code_average_c: Number(codeAverage.toFixed(2)),
    passive_average_c: Number(passiveAverage.toFixed(2)),
    average_delta_c: Number(averageDelta.toFixed(2)),
    max_absolute_delta_c: Number(Math.abs(maxAbsolutePair.delta).toFixed(2)),
    max_delta_code_minus_passive_c: Number(maxAbsolutePair.delta.toFixed(2)),
    max_delta_at: new Date(maxAbsolutePair.time).toISOString(),
    passive_colder_percent: Number(((passiveColderCount / pairs.length) * 100).toFixed(1)),
    code_colder_percent: Number(((codeColderCount / pairs.length) * 100).toFixed(1)),
    equal_percent: Number(((equalCount / pairs.length) * 100).toFixed(1)),
  };
}

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

    if (req.query.challenge_summary === "1") {
      res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
      const summary = await getChallengeSummary(supabase);
      return res.status(200).json(summary);
    }

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
