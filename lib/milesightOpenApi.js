const DEFAULT_BASE_URL = "https://us-openapi.milesight.com";
const TOKEN_SAFETY_MARGIN_MS = 60 * 1000;
const PROPERTY_HISTORY_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const PROPERTY_HISTORY_PAGE_SIZE = 50;
const PROPERTY_HISTORY_MAX_PAGES = 4;
const GATEWAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let gatewayIdCache = {
  deviceId: null,
  expiresAt: 0,
};

let gatewayTslCache = {
  deviceId: null,
  data: null,
  expiresAt: 0,
};

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

export async function getMilesightDeviceLatest(deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();

  if (!normalizedDeviceId) {
    throw new Error("deviceId is required.");
  }

  const device = await getDeviceDetails(normalizedDeviceId);

  if (!device) {
    throw new Error("Milesight device not found.");
  }

  const batteryLevel = numberOrNull(
    firstDefined(
      device.electricity,
      findPropertyDeep(device, "battery_level"),
      findPropertyDeep(device, "battery")
    )
  );

  const batteryStatusRaw = firstDefined(
    findPropertyDeep(device, "battery_status"),
    findPropertyDeep(device, "batteryStatus")
  );

  const batteryTemperature = numberOrNull(
    firstDefined(
      findPropertyDeep(device, "battery_temperature"),
      findPropertyDeep(device, "battery_tempeture"),
      findPropertyDeep(device, "batteryTemperature")
    )
  );

  const solarRaw = firstDefined(
    findPropertyDeep(device, "solar_status"),
    findPropertyDeep(device, "solarStatus")
  );
  const solar = solarStatus(solarRaw);

  return {
    deviceId: String(device.deviceId || normalizedDeviceId),
    devEUI: device.devEUI || null,
    sn: device.sn || null,
    name: device.name || null,
    model: device.model || null,
    deviceType: device.deviceType || null,
    connectStatus: device.connectStatus || null,
    electricity: batteryLevel,
    lastUpdateTime: numberOrNull(device.lastUpdateTime),
    firmwareVersion: device.firmwareVersion || null,
    hardwareVersion: device.hardwareVersion || null,
    battery: {
      level: batteryLevel,
      statusRaw: batteryStatusRaw ?? null,
      status: batteryStatusLabel(batteryStatusRaw),
      temperature: batteryTemperature,
    },
    solar: {
      raw: solar.raw,
      active: solar.active,
      label: solar.label,
    },
  };
}

function normalizeDevEUI(value) {
  return String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

async function resolveSg50Gateway() {
  const config = getConfig();

  if (config.gatewayDeviceId) {
    return getDeviceDetails(config.gatewayDeviceId);
  }

  if (
    gatewayIdCache.deviceId &&
    Date.now() < gatewayIdCache.expiresAt
  ) {
    try {
      return await getDeviceDetails(gatewayIdCache.deviceId);
    } catch {
      gatewayIdCache = { deviceId: null, expiresAt: 0 };
    }
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

  gatewayIdCache = {
    deviceId: String(match.deviceId),
    expiresAt: Date.now() + GATEWAY_CACHE_TTL_MS,
  };

  return getDeviceDetails(match.deviceId);
}

async function getThingSpecification(deviceId, forceRefresh = false) {
  const normalizedDeviceId = String(deviceId);

  if (
    !forceRefresh &&
    gatewayTslCache.deviceId === normalizedDeviceId &&
    gatewayTslCache.data &&
    Date.now() < gatewayTslCache.expiresAt
  ) {
    return gatewayTslCache.data;
  }

  const payload = await milesightRequest(
    `/device/openapi/v1/devices/${encodeURIComponent(
      normalizedDeviceId
    )}/thing-specification`,
    { method: "GET" }
  );

  const tsl = payload?.data || {};
  gatewayTslCache = {
    deviceId: normalizedDeviceId,
    data: tsl,
    expiresAt: Date.now() + GATEWAY_CACHE_TTL_MS,
  };

  return tsl;
}

function normalizeService(service) {
  const id = String(service?.id || service?.serviceId || "").trim();
  const inputs = Array.isArray(service?.inputs) ? service.inputs : [];

  return {
    id,
    name: service?.name || null,
    description: service?.description || null,
    callType: service?.callType || null,
    inputs: inputs.map((input) => ({
      id: input?.id || input?.propertyKey || null,
      propertyKey: input?.propertyKey || null,
      name: input?.name || null,
      description: input?.description || null,
      dataSpec: input?.dataSpec || null,
    })),
  };
}

function scoreStatusQueryService(service) {
  const id = String(service?.id || "").toLowerCase();
  const name = String(service?.name || "").toLowerCase();
  const description = String(service?.description || "").toLowerCase();
  const text = `${id} ${name} ${description}`;

  if (!id || (service?.inputs?.length || 0) > 0) return 0;

  if (id === "query_device_status") return 100;
  if (id === "query_status") return 95;
  if (id === "request_device_status") return 90;
  if (id === "get_device_status") return 85;

  const hasQueryVerb = /(query|request|get|report|retrieve)/.test(text);
  const hasStatusNoun = /(device status|status|state|device info|device information)/.test(text);

  return hasQueryVerb && hasStatusNoun ? 70 : 0;
}

export async function getSg50Capabilities(deviceId = null, forceRefresh = false) {
  let gateway = null;
  let resolvedDeviceId = deviceId ? String(deviceId) : null;

  if (!resolvedDeviceId) {
    gateway = await resolveSg50Gateway();
    resolvedDeviceId = String(gateway?.deviceId || "");
  }

  if (!resolvedDeviceId) {
    throw new Error("Unable to resolve SG50 deviceId for TSL lookup.");
  }

  const tsl = await getThingSpecification(resolvedDeviceId, forceRefresh);
  const services = Array.isArray(tsl?.services)
    ? tsl.services.map(normalizeService).filter((service) => service.id)
    : [];

  const statusQueryService =
    [...services]
      .map((service) => ({
        service,
        score: scoreStatusQueryService(service),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.service || null;

  return {
    deviceId: resolvedDeviceId,
    tslVersion: tsl?.version || null,
    serviceCount: services.length,
    services,
    statusQuerySupported: Boolean(statusQueryService),
    statusQueryService,
  };
}

export async function invokeSg50StatusQuery() {
  const gateway = await resolveSg50Gateway();
  const deviceId = String(gateway?.deviceId || "");

  if (!deviceId) {
    throw new Error("Unable to resolve SG50 deviceId.");
  }

  let capabilities = null;
  try {
    capabilities = await getSg50Capabilities(deviceId);
  } catch {
    // The direct test can still be attempted with the known read-only
    // query_device_status service ID if the TSL lookup itself is unavailable.
  }

  const advertisedService = capabilities?.statusQueryService || null;
  const serviceId = advertisedService?.id || "query_device_status";

  // Never accept a service ID from the browser. If the TSL advertises a safe
  // zero-input status query we use it; otherwise we deliberately try the
  // documented query_device_status identifier as an experimental fallback.
  const payload = await milesightRequest(
    `/device/openapi/v1/devices/${encodeURIComponent(
      deviceId
    )}/services/call`,
    {
      method: "POST",
      body: JSON.stringify({
        serviceId,
        inputs: {},
      }),
    }
  );

  return {
    supported: true,
    advertisedByTsl: Boolean(advertisedService?.id),
    experimentalFallback: !advertisedService?.id,
    deviceId,
    serviceId,
    serviceName: advertisedService?.name || null,
    requestId:
      payload?.requestId ||
      payload?.data?.requestId ||
      payload?.data?.request_id ||
      null,
    status: payload?.status || payload?.data?.status || null,
  };
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

function parseNestedJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function findPropertyDeep(value, targetKey, visited = new Set()) {
  const parsed = parseNestedJson(value);

  if (!parsed || typeof parsed !== "object") return undefined;
  if (visited.has(parsed)) return undefined;
  visited.add(parsed);

  if (
    !Array.isArray(parsed) &&
    Object.prototype.hasOwnProperty.call(parsed, targetKey)
  ) {
    return parsed[targetKey];
  }

  const children = Array.isArray(parsed) ? parsed : Object.values(parsed);
  for (const child of children) {
    const found = findPropertyDeep(child, targetKey, visited);
    if (found !== undefined && found !== null) return found;
  }

  return undefined;
}

function timestampOrNull(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
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
  const startTime = now - PROPERTY_HISTORY_LOOKBACK_MS;
  const propertyKeys = [
    "battery_level",
    "battery_status",
    "battery_temperature",
    "solar_status",
  ];

  const merged = {};
  const reportedAtByProperty = {};
  let newestRelevantTimestamp = null;
  let pageKey = null;
  let pagesScanned = 0;
  let recordsScanned = 0;

  for (let page = 0; page < PROPERTY_HISTORY_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      startTime: String(startTime),
      endTime: String(now),
      pageSize: String(PROPERTY_HISTORY_PAGE_SIZE),
      order: "desc",
    });

    if (pageKey) query.set("pageKey", pageKey);

    const payload = await milesightRequest(
      `/device/openapi/v1/devices/${encodeURIComponent(
        deviceId
      )}/properties/history?${query.toString()}`,
      { method: "GET" }
    );

    pagesScanned += 1;

    const records = Array.isArray(payload?.data?.list) ? payload.data.list : [];
    recordsScanned += records.length;

    for (const record of records) {
      const properties = objectFromValue(record?.properties);
      const recordTimestamp = timestampOrNull(record?.ts);

      let foundRelevant = false;

      for (const key of propertyKeys) {
        if (merged[key] !== undefined) continue;

        const aliases =
          key === "battery_temperature"
            ? ["battery_temperature", "battery_tempeture"]
            : key === "battery_level"
            ? ["battery_level", "battery"]
            : [key];

        let value;
        for (const alias of aliases) {
          value = findPropertyDeep(properties, alias);
          if (value !== undefined && value !== null && value !== "") break;
        }

        if (value !== undefined && value !== null && value !== "") {
          merged[key] = value;
          reportedAtByProperty[key] = recordTimestamp;
          foundRelevant = true;
        }
      }

      if (foundRelevant && newestRelevantTimestamp === null) {
        newestRelevantTimestamp = recordTimestamp;
      }

      if (propertyKeys.every((key) => merged[key] !== undefined)) {
        break;
      }
    }

    if (propertyKeys.every((key) => merged[key] !== undefined)) {
      break;
    }

    const nextPageKey = payload?.data?.nextPageKey;
    if (!nextPageKey || records.length === 0) {
      break;
    }

    pageKey = String(nextPageKey);
  }

  return {
    properties: merged,
    reportedAt: newestRelevantTimestamp,
    reportedAtByProperty,
    scan: {
      pagesScanned,
      recordsScanned,
      complete: propertyKeys.every((key) => merged[key] !== undefined),
      missing: propertyKeys.filter((key) => merged[key] === undefined),
    },
  };
}

export async function getSg50Status() {
  const gateway = await resolveSg50Gateway();
  if (!gateway?.deviceId) {
    throw new Error("Unable to resolve SG50 deviceId from Milesight.");
  }

  let recent = {
    properties: {},
    reportedAt: null,
    reportedAtByProperty: {},
    scan: { pagesScanned: 0, recordsScanned: 0, complete: false, missing: [] },
  };
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
      levelReportedAt: recent.reportedAtByProperty?.battery_level ?? null,
      status: batteryStatusLabel(batteryStatusRaw),
      statusRaw: batteryStatusRaw ?? null,
      statusReportedAt: recent.reportedAtByProperty?.battery_status ?? null,
      temperature: batteryTemperature,
      temperatureReportedAt:
        recent.reportedAtByProperty?.battery_temperature ?? null,
    },
    solar: {
      active: solar.active,
      label: solar.label,
      raw: solar.raw,
      reportedAt: recent.reportedAtByProperty?.solar_status ?? null,
    },
    propertiesReportedAt: recent.reportedAt,
    propertyScan: recent.scan,
    propertyError,
  };
}
