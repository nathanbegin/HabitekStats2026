const DEFAULT_BASE_URL = "https://us-openapi.milesight.com";
const TOKEN_SAFETY_MARGIN_MS = 60 * 1000;

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

function getConfig() {
  const baseUrl = String(process.env.MILESIGHT_API_BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  const clientId = String(process.env.MILESIGHT_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.MILESIGHT_CLIENT_SECRET || "").trim();
  const gatewayDeviceId = String(process.env.MILESIGHT_GATEWAY_DEVICE_ID || "").trim();
  const gatewayDevEUI = String(process.env.MILESIGHT_GATEWAY_DEVEUI || "").trim();

  return {
    baseUrl,
    clientId,
    clientSecret,
    gatewayDeviceId,
    gatewayDevEUI,
  };
}

export function isMilesightOpenApiConfigured() {
  const { clientId, clientSecret } = getConfig();
  return Boolean(clientId && clientSecret);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Milesight Open API returned invalid JSON (HTTP ${response.status})`);
  }
}

async function getAccessToken(forceRefresh = false) {
  const config = getConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "Milesight Open API is not configured. Add MILESIGHT_CLIENT_ID and MILESIGHT_CLIENT_SECRET."
    );
  }

  if (
    !forceRefresh &&
    tokenCache.accessToken &&
    Date.now() < tokenCache.expiresAt - TOKEN_SAFETY_MARGIN_MS
  ) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = await parseJsonResponse(response);
  const accessToken = payload?.data?.access_token;

  if (!response.ok || payload?.status === "Failed" || !accessToken) {
    throw new Error(
      payload?.message ||
        payload?.error_description ||
        payload?.error ||
        `Unable to authenticate with Milesight Open API (HTTP ${response.status})`
    );
  }

  const expiresInSeconds = Number(payload?.data?.expires_in || 3600);
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + Math.max(expiresInSeconds, 60) * 1000,
  };

  return accessToken;
}

async function milesightRequest(path, options = {}, retryAuth = true) {
  const config = getConfig();
  const accessToken = await getAccessToken();

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    ...(options.headers || {}),
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retryAuth) {
    tokenCache = { accessToken: null, expiresAt: 0 };
    await getAccessToken(true);
    return milesightRequest(path, options, false);
  }

  const payload = await parseJsonResponse(response);

  if (!response.ok || payload?.status === "Failed") {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `Milesight Open API request failed (HTTP ${response.status})`
    );
  }

  return payload;
}

async function searchGateways() {
  const payload = await milesightRequest("/device/openapi/v1/devices/search", {
    method: "POST",
    body: JSON.stringify({
      pageSize: 50,
      pageNumber: 1,
      deviceType: ["GATEWAY"],
    }),
  });

  return Array.isArray(payload?.data?.content) ? payload.data.content : [];
}

async function getDeviceDetails(deviceId) {
  const payload = await milesightRequest(
    `/device/openapi/v1/devices/${encodeURIComponent(deviceId)}`,
    { method: "GET" }
  );

  return payload?.data || null;
}

function normalizeDevEUI(value) {
  return String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

async function resolveSg50Gateway() {
  const config = getConfig();

  if (config.gatewayDeviceId) {
    return getDeviceDetails(config.gatewayDeviceId);
  }

  const gateways = await searchGateways();
  if (!gateways.length) {
    throw new Error("No gateway associated with this Milesight Application.");
  }

  const configuredDevEUI = normalizeDevEUI(config.gatewayDevEUI);
  let match = null;

  if (configuredDevEUI) {
    match = gateways.find(
      (gateway) => normalizeDevEUI(gateway?.devEUI) === configuredDevEUI
    );
  }

  if (!match) {
    match =
      gateways.find(
        (gateway) => String(gateway?.model || "").trim().toUpperCase() === "SG50"
      ) ||
      gateways.find((gateway) =>
        String(gateway?.name || "").toLowerCase().includes("sg50")
      ) ||
      gateways[0];
  }

  if (!match?.deviceId) {
    throw new Error("Milesight gateway found, but deviceId is missing.");
  }

  return getDeviceDetails(match.deviceId);
}

function objectFromValue(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function batteryStatusLabel(value) {
  const numeric = Number(value);
  const labels = {
    0: "Inconnu",
    1: "En charge",
    2: "En décharge",
    3: "Complètement chargée",
    4: "Charge anormale",
  };

  if (Number.isFinite(numeric) && Object.prototype.hasOwnProperty.call(labels, numeric)) {
    return labels[numeric];
  }

  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function solarStatus(value) {
  if (value === undefined || value === null || value === "") {
    return { raw: null, active: null, label: null };
  }

  const normalized = String(value).trim().toLowerCase();
  const active =
    value === true ||
    Number(value) === 1 ||
    normalized === "active" ||
    normalized === "on";

  const inactive =
    value === false ||
    Number(value) === 0 ||
    normalized === "inactive" ||
    normalized === "off";

  return {
    raw: value,
    active: active ? true : inactive ? false : null,
    label: active ? "Actif" : inactive ? "Inactif" : String(value),
  };
}

async function getRecentProperties(deviceId) {
  const now = Date.now();
  const startTime = now - 7 * 24 * 60 * 60 * 1000;

  const query = new URLSearchParams({
    startTime: String(startTime),
    endTime: String(now),
    pageSize: "50",
    order: "desc",
  });

  const payload = await milesightRequest(
    `/device/openapi/v1/devices/${encodeURIComponent(
      deviceId
    )}/properties/history?${query.toString()}`,
    { method: "GET" }
  );

  const records = Array.isArray(payload?.data?.list) ? payload.data.list : [];

  // Reports can contain only a subset of properties. Merge newest-to-oldest
  // and keep the newest value found for each relevant key.
  const merged = {};
  let newestRelevantTimestamp = null;

  for (const record of records) {
    const properties = objectFromValue(record?.properties);
    const batteryInfo = objectFromValue(properties?.battery_info);
    const candidates = {
      battery_level: firstDefined(properties?.battery_level, batteryInfo?.battery_level),
      battery_status: firstDefined(properties?.battery_status, batteryInfo?.battery_status),
      battery_temperature: firstDefined(
        properties?.battery_temperature,
        batteryInfo?.battery_temperature
      ),
      solar_status: firstDefined(properties?.solar_status, batteryInfo?.solar_status),
    };

    let foundRelevant = false;

    for (const [key, value] of Object.entries(candidates)) {
      if (merged[key] === undefined && value !== undefined && value !== null) {
        merged[key] = value;
        foundRelevant = true;
      }
    }

    if (foundRelevant && newestRelevantTimestamp === null) {
      const ts = Number(record?.ts);
      newestRelevantTimestamp = Number.isFinite(ts) ? ts : null;
    }

    if (
      merged.battery_level !== undefined &&
      merged.battery_status !== undefined &&
      merged.battery_temperature !== undefined &&
      merged.solar_status !== undefined
    ) {
      break;
    }
  }

  return {
    properties: merged,
    reportedAt: newestRelevantTimestamp,
  };
}

export async function getSg50Status() {
  const gateway = await resolveSg50Gateway();
  if (!gateway?.deviceId) {
    throw new Error("Unable to resolve SG50 deviceId from Milesight.");
  }

  let recent = { properties: {}, reportedAt: null };
  let propertyError = null;

  try {
    recent = await getRecentProperties(gateway.deviceId);
  } catch (error) {
    // Basic device details still provide connectivity and the general battery
    // percentage. Do not fail the whole card if property history is unavailable.
    propertyError = error?.message || "Unable to load SG50 property history.";
  }

  const batteryLevel = numberOrNull(
    firstDefined(recent.properties.battery_level, gateway.electricity)
  );
  const batteryStatusRaw = recent.properties.battery_status;
  const batteryTemperature = numberOrNull(recent.properties.battery_temperature);
  const solar = solarStatus(recent.properties.solar_status);

  return {
    gateway: {
      deviceId: String(gateway.deviceId),
      devEUI: gateway.devEUI || null,
      sn: gateway.sn || null,
      name: gateway.name || null,
      model: gateway.model || "SG50",
      firmwareVersion: gateway.firmwareVersion || null,
      hardwareVersion: gateway.hardwareVersion || null,
    },
    connectStatus: gateway.connectStatus || null,
    apiOnline: gateway.connectStatus === "ONLINE",
    lastUpdateTime: numberOrNull(gateway.lastUpdateTime),
    battery: {
      level: batteryLevel,
      status: batteryStatusLabel(batteryStatusRaw),
      statusRaw: batteryStatusRaw ?? null,
      temperature: batteryTemperature,
    },
    solar: {
      active: solar.active,
      label: solar.label,
      raw: solar.raw,
    },
    propertiesReportedAt: recent.reportedAt,
    propertyError,
  };
}
