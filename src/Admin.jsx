import React, { useEffect, useMemo, useState } from "react";

const ASSIGNMENTS = [
  { value: "unassigned", label: "Non assigné" },
  { value: "code_indoor", label: "Code — intérieur" },
  { value: "passivehouse_indoor", label: "PassiveHouse — intérieur" },
  { value: "outdoor_shared", label: "Extérieur — partagé" },
];

const STATUS_META = {
  processed: { label: "Traité", classes: "bg-green-100 text-green-800 border-green-200" },
  received: { label: "Reçu", classes: "bg-blue-100 text-blue-800 border-blue-200" },
  rejected: { label: "Rejeté", classes: "bg-red-100 text-red-800 border-red-200" },
  ignored: { label: "Ignoré", classes: "bg-amber-100 text-amber-800 border-amber-200" },
  error: { label: "Erreur", classes: "bg-red-100 text-red-800 border-red-200" },
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "medium" });
}

const GATEWAY_ONLINE_WINDOW_MS = 30 * 60 * 1000;

function normalizeDevEUI(value) {
  return String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function isGatewayDevice(device, gatewayStatus) {
  if (!device) return false;

  const apiDevEUI = normalizeDevEUI(gatewayStatus?.gateway?.devEUI);
  const deviceDevEUI = normalizeDevEUI(device.device_uuid);
  if (apiDevEUI && deviceDevEUI === apiDevEUI) return true;

  const nickname = String(device.nickname || "").toLowerCase();
  return (
    nickname.includes("gateway") ||
    nickname.includes("sg50") ||
    (!apiDevEUI && device.record_type === "unknown")
  );
}

function gatewayActivityTimestamp(device, latestDeviceWebhook) {
  const deviceLastSeen = new Date(device?.last_seen_at || "").getTime();
  const webhookLastSeen = new Date(latestDeviceWebhook?.received_at || "").getTime();

  const timestamps = [deviceLastSeen, webhookLastSeen].filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function gatewayIsOnline(device, latestDeviceWebhook) {
  const lastActivity = gatewayActivityTimestamp(device, latestDeviceWebhook);
  if (!Number.isFinite(lastActivity)) return false;
  return Date.now() - lastActivity <= GATEWAY_ONLINE_WINDOW_MS;
}

function parseMeasurementNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function batteryStatusFromRaw(value) {
  if (value === undefined || value === null || value === "") return null;

  const labels = {
    0: "Inconnu",
    1: "En charge",
    2: "En décharge",
    3: "Complètement chargée",
    4: "Charge anormale",
  };

  const numeric = Number(value);
  if (Number.isFinite(numeric) && Object.prototype.hasOwnProperty.call(labels, numeric)) {
    return labels[numeric];
  }

  return String(value);
}

function solarStatusFromRaw(value) {
  if (value === undefined || value === null || value === "") {
    return { active: null, label: null };
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
    active: active ? true : inactive ? false : null,
    label: active ? "Actif" : inactive ? "Inactif" : String(value),
  };
}

function gatewayEnergyFromWebhook(values) {
  const data = values && typeof values === "object" ? values : {};
  const batteryInfo =
    data.battery_info && typeof data.battery_info === "object"
      ? data.battery_info
      : {};

  const batteryLevel = parseMeasurementNumber(
    data.battery ?? data.battery_level ?? batteryInfo.battery_level
  );
  const batteryTemperature = parseMeasurementNumber(
    batteryInfo.battery_tempeture ??
      batteryInfo.battery_temperature ??
      data.battery_tempeture ??
      data.battery_temperature
  );
  const batteryStatusRaw =
    batteryInfo.battery_status ?? data.battery_status ?? null;
  const solarRaw = batteryInfo.solar_status ?? data.solar_status ?? null;
  const solar = solarStatusFromRaw(solarRaw);

  return {
    batteryLevel,
    batteryTemperature,
    batteryStatus: batteryStatusFromRaw(batteryStatusRaw),
    solarActive: solar.active,
    solarLabel: solar.label,
  };
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: status || "Inconnu",
    classes: "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.classes}`}>
      {meta.label}
    </span>
  );
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [authenticated, setAuthenticated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [logsError, setLogsError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [activeSection, setActiveSection] = useState("devices");
  const [gatewayStatus, setGatewayStatus] = useState(null);
  const [gatewayStatusLoading, setGatewayStatusLoading] = useState(false);
  const [gatewayStatusError, setGatewayStatusError] = useState("");
  const [gatewayManualSyncing, setGatewayManualSyncing] = useState(false);
  const [gatewayLastManualSync, setGatewayLastManualSync] = useState(null);
  const [gatewayQuerying, setGatewayQuerying] = useState(false);
  const [gatewayQueryMessage, setGatewayQueryMessage] = useState("");

  const mappedCount = useMemo(
    () => devices.filter((device) => device.assignment).length,
    [devices]
  );

  const latestWebhook = logs[0] || null;
  const latestDeviceWebhook =
    logs.find(
      (log) =>
        log.status === "processed" &&
        Array.isArray(log.device_uuids) &&
        log.device_uuids.length > 0
    ) || null;

  const loadDevices = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/devices", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (response.status === 401) {
        setAuthenticated(false);
        setDevices([]);
        return;
      }

      if (!response.ok) throw new Error("Impossible de charger les capteurs");

      setDevices(await response.json());
      setAuthenticated(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    setLogsError("");

    try {
      const response = await fetch("/api/admin/webhook-logs", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (response.status === 401) {
        setAuthenticated(false);
        setLogs([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Impossible de charger les logs webhook");
      }

      setLogs(await response.json());
    } catch (error) {
      setLogsError(
        `${error.message}. Vérifie que la dernière version de supabase/schema.sql a été exécutée.`
      );
    } finally {
      setLogsLoading(false);
    }
  };

  const loadGatewayStatus = async () => {
    setGatewayStatusLoading(true);
    setGatewayStatusError("");

    try {
      const response = await fetch("/api/admin/gateway-status", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (response.status === 401) {
        setAuthenticated(false);
        setGatewayStatus(null);
        return;
      }

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Impossible de charger l'état du SG50");
      }

      setGatewayStatus(payload);
      if (payload?.configured === false && payload?.error) {
        setGatewayStatusError(payload.error);
      } else if (payload?.propertyError) {
        setGatewayStatusError(
          `État général disponible, mais détails énergie incomplets : ${payload.propertyError}`
        );
      } else if (payload?.capabilitiesError) {
        setGatewayStatusError(
          `État disponible, mais services TSL non récupérés : ${payload.capabilitiesError}`
        );
      }
    } catch (error) {
      setGatewayStatusError(error.message || "Impossible de charger l'état du SG50");
    } finally {
      setGatewayStatusLoading(false);
    }
  };

  const refreshAll = () => {
    loadDevices();
    loadLogs();
    loadGatewayStatus();
  };

  const syncGatewayEnergy = async () => {
    if (gatewayManualSyncing) return;

    setGatewayManualSyncing(true);
    setGatewayStatusError("");

    try {
      const [devicesResponse, gatewayResponse] = await Promise.all([
        fetch("/api/admin/devices", {
          credentials: "same-origin",
          cache: "no-store",
        }),
        fetch("/api/admin/gateway-status", {
          credentials: "same-origin",
          cache: "no-store",
        }),
      ]);

      if (devicesResponse.status === 401 || gatewayResponse.status === 401) {
        setAuthenticated(false);
        return;
      }

      const [devicesPayload, gatewayPayload] = await Promise.all([
        devicesResponse.json().catch(() => []),
        gatewayResponse.json().catch(() => ({})),
      ]);

      if (!devicesResponse.ok) {
        throw new Error("Impossible de récupérer le dernier webhook du gateway.");
      }

      if (!gatewayResponse.ok) {
        throw new Error(
          gatewayPayload.error || "Impossible de récupérer les informations Milesight du SG50."
        );
      }

      setDevices(Array.isArray(devicesPayload) ? devicesPayload : []);
      setGatewayStatus(gatewayPayload);

      if (gatewayPayload?.configured === false && gatewayPayload?.error) {
        setGatewayStatusError(gatewayPayload.error);
      } else if (gatewayPayload?.propertyError) {
        setGatewayStatusError(
          `État général disponible, mais détails énergie incomplets : ${gatewayPayload.propertyError}`
        );
      }

      setGatewayLastManualSync(new Date().toISOString());
    } catch (error) {
      setGatewayStatusError(
        error.message || "Impossible de synchroniser les informations du gateway."
      );
    } finally {
      setGatewayManualSyncing(false);
    }
  };

  const queryGatewayNow = async () => {
    if (gatewayQuerying) return;

    setGatewayQuerying(true);
    setGatewayQueryMessage("");
    setGatewayStatusError("");

    try {
      const response = await fetch("/api/admin/gateway-query", {
        method: "POST",
        credentials: "same-origin",
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }

      if (response.status === 409) {
        setGatewayQueryMessage(
          payload.error ||
            "Le SG50 ne publie pas de commande permettant de demander un nouveau rapport."
        );
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || "Impossible d'interroger le SG50.");
      }

      setGatewayQueryMessage(
        `Commande envoyée (${payload.serviceId || "service TSL"}). Attente du nouveau rapport…`
      );

      // The Milesight service invocation is asynchronous. Poll Supabase/logs
      // first to catch the fresh webhook, then refresh Open API once.
      window.setTimeout(() => {
        loadDevices();
        loadLogs();
      }, 3000);

      window.setTimeout(() => {
        loadDevices();
        loadLogs();
        loadGatewayStatus();
      }, 8000);

      window.setTimeout(() => {
        loadDevices();
        loadLogs();
      }, 15000);
    } catch (error) {
      setGatewayStatusError(
        error.message || "Impossible d'interroger directement le SG50."
      );
    } finally {
      setGatewayQuerying(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (!authenticated) return undefined;

    loadLogs();
    const id = setInterval(loadLogs, 10 * 1000);
    return () => clearInterval(id);
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return undefined;

    loadGatewayStatus();
    const id = setInterval(loadGatewayStatus, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [authenticated]);

  const login = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setAuthenticated(false);
        setMessage("Mot de passe invalide.");
        return;
      }

      setPassword("");
      await loadDevices();
    } catch {
      setMessage("Impossible de se connecter.");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setAuthenticated(false);
    setDevices([]);
    setLogs([]);
    setGatewayStatus(null);
    setGatewayStatusError("");
  };

  const updateNicknameDraft = (deviceUuid, nickname) => {
    setDevices((current) =>
      current.map((device) =>
        device.device_uuid === deviceUuid ? { ...device, nickname } : device
      )
    );
  };

  const saveNickname = async (deviceUuid, nickname) => {
    setMessage("");

    const response = await fetch("/api/admin/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        device_uuid: deviceUuid,
        nickname,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.error || "Le surnom n'a pas pu être enregistré.");
      await loadDevices();
      return;
    }

    const savedDevice = await response.json();
    setDevices((current) =>
      current.map((device) =>
        device.device_uuid === deviceUuid
          ? { ...device, nickname: savedDevice.nickname || "" }
          : device
      )
    );
    setMessage("Surnom enregistré.");
  };

  const assign = async (deviceUuid, assignment) => {
    setMessage("");

    setDevices((current) =>
      current.map((device) =>
        device.device_uuid === deviceUuid
          ? {
              ...device,
              assignment: assignment === "unassigned" ? null : assignment,
            }
          : device
      )
    );

    const response = await fetch("/api/admin/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        device_uuid: deviceUuid,
        assignment,
      }),
    });

    if (!response.ok) {
      setMessage("L'assignation n'a pas pu être enregistrée.");
      await loadDevices();
      return;
    }

    setMessage("Assignation enregistrée.");
  };

  const openResetDialog = () => {
    setResetPassword("");
    setResetError("");
    setResetOpen(true);
  };

  const closeResetDialog = () => {
    if (resetLoading) return;
    setResetOpen(false);
    setResetPassword("");
    setResetError("");
  };

  const resetStatistics = async (event) => {
    event.preventDefault();
    setResetLoading(true);
    setResetError("");

    try {
      const response = await fetch("/api/admin/reset-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          password: resetPassword,
          confirmation: "RESET_STATS",
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setResetError("Mot de passe administrateur invalide.");
        return;
      }

      if (!response.ok) {
        setResetError(payload.error || "La remise à zéro a échoué.");
        return;
      }

      setResetOpen(false);
      setResetPassword("");
      setMessage(
        `Statistiques remises à zéro : ${payload.deleted_measurements || 0} mesure(s) supprimée(s). Les DevEUI, surnoms et assignations ont été conservés.`
      );
      await loadDevices();
    } catch {
      setResetError("Impossible de communiquer avec le serveur.");
    } finally {
      setResetLoading(false);
    }
  };

  if (authenticated === null || (loading && authenticated !== false)) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 text-gray-700">Chargement…</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <form onSubmit={login} className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7">
          <div className="text-sm font-semibold text-blue-600 mb-1">HabiTEK 2026</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Administration des capteurs</h1>
          <p className="text-sm text-gray-600 mb-6">
            Utilise le mot de passe administrateur configuré dans Vercel.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mot de passe
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border rounded-xl px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          {message && <p className="text-sm text-red-600 mb-3">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-semibold rounded-xl px-4 py-2 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
          <a href="/" className="block text-center text-sm text-gray-500 mt-5 hover:underline">
            Retour aux statistiques
          </a>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow p-5 mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-blue-600">HabiTEK 2026</div>
            <h1 className="text-2xl font-bold text-gray-900">Administration Milesight</h1>
            <p className="text-sm text-gray-600 mt-1">
              Réception des webhooks, DevEUI détectés, surnoms et assignation des capteurs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/" className="px-3 py-2 border rounded-xl text-sm hover:bg-gray-50">
              Voir le dashboard
            </a>
            <button onClick={refreshAll} className="px-3 py-2 border rounded-xl text-sm hover:bg-gray-50">
              Actualiser
            </button>
            <button onClick={logout} className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm">
              Déconnexion
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">{devices.length}</div>
            <div className="text-sm text-gray-500">DevEUI détectés</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">{mappedCount}</div>
            <div className="text-sm text-gray-500">Capteurs assignés</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center gap-2 min-h-8">
              {latestWebhook ? <StatusBadge status={latestWebhook.status} /> : <span className="text-gray-400">Aucun</span>}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {latestWebhook ? `Dernier webhook : ${formatDate(latestWebhook.received_at)}` : "Aucun webhook journalisé"}
            </div>
          </div>
        </div>

        {message && (
          <div className="bg-blue-50 border border-blue-100 text-blue-800 rounded-xl px-4 py-3 mb-4 text-sm">
            {message}
          </div>
        )}

        <nav
          className="bg-white rounded-2xl shadow p-2 mb-5 sticky top-3 z-20"
          aria-label="Sections d'administration"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("devices")}
              className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition ${
                activeSection === "devices"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span>
                <span className="block text-sm font-bold">Capteurs détectés</span>
                <span className={`block text-xs mt-0.5 ${activeSection === "devices" ? "text-blue-100" : "text-gray-500"}`}>
                  Surnoms et assignations
                </span>
              </span>
              <span className={`min-w-8 h-8 px-2 rounded-full flex items-center justify-center text-sm font-bold ${
                activeSection === "devices" ? "bg-white/20 text-white" : "bg-white text-gray-700"
              }`}>
                {devices.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("webhooks")}
              className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition ${
                activeSection === "webhooks"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span>
                <span className="block text-sm font-bold">Réception webhook</span>
                <span className={`block text-xs mt-0.5 ${activeSection === "webhooks" ? "text-blue-100" : "text-gray-500"}`}>
                  Connexions Milesight
                </span>
              </span>
              <span className="shrink-0">
                {latestWebhook ? <StatusBadge status={latestWebhook.status} /> : <span className="text-xs">Aucun</span>}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("maintenance")}
              className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition ${
                activeSection === "maintenance"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span>
                <span className="block text-sm font-bold">Maintenance</span>
                <span className={`block text-xs mt-0.5 ${activeSection === "maintenance" ? "text-red-100" : "text-gray-500"}`}>
                  Remise à zéro
                </span>
              </span>
              <span className="text-lg" aria-hidden="true">⚙</span>
            </button>
          </div>
        </nav>

        {activeSection === "webhooks" && (
          <section className="bg-white rounded-2xl shadow p-4 sm:p-5 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Réception webhook Milesight</h2>
              <p className="text-sm text-gray-600 mt-1">
                Journal des 50 dernières requêtes reçues par <span className="font-mono">/api/milesight-webhook</span>.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {logsLoading ? "Actualisation…" : "Actualisation automatique : 10 s"}
            </div>
          </div>

          {logsError && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
              {logsError}
            </div>
          )}

          {logs.length === 0 && !logsLoading ? (
            <div className="border border-dashed rounded-xl p-6 text-center text-sm text-gray-500">
              Aucun webhook journalisé pour le moment. Utilise le bouton Test dans Milesight ou attends la prochaine mesure.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const uuids = Array.isArray(log.device_uuids) ? log.device_uuids : [];
                const types = Array.isArray(log.record_types) ? log.record_types : [];

                return (
                  <div key={log.id} className="border rounded-xl p-3">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={log.status} />
                        <span className="text-xs font-mono text-gray-500">HTTP {log.http_status ?? "—"}</span>
                        <span className="text-xs text-gray-500">{formatDate(log.received_at)}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {log.event_count || 0} reçu(s) · {log.inserted_count || 0} enregistré(s)
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">DevEUI :</span>{" "}
                        {uuids.length ? (
                          uuids.map((uuid) => {
                            const matchingDevice = devices.find((device) => device.device_uuid === uuid);
                            return (
                              <span key={uuid} className="inline-flex flex-col mr-3 align-middle">
                                {matchingDevice?.nickname && (
                                  <span className="font-semibold text-gray-800">{matchingDevice.nickname}</span>
                                )}
                                <span className="font-mono text-xs break-all text-gray-500">{uuid}</span>
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-gray-400">aucun détecté</span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Type :</span>{" "}
                        <span className="text-gray-600">{types.length ? types.join(", ") : "—"}</span>
                      </div>
                    </div>

                    {log.message && (
                      <div className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                        {log.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}

        {activeSection === "maintenance" && (
          <section className="bg-white rounded-2xl shadow p-4 sm:p-5 mb-5 border border-red-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-red-600 mb-1">
                Maintenance
              </div>
              <h2 className="text-lg font-bold text-gray-900">Remise à zéro des statistiques</h2>
              <p className="text-sm text-gray-600 mt-1 max-w-3xl">
                À utiliser à la fin de la phase de test. Cette action supprime tout l'historique de température et d'humidité
                ainsi que les dernières mesures affichées. Les DevEUI, surnoms, assignations et logs webhook sont conservés,
                afin de réutiliser exactement la même configuration pour le déploiement réel.
              </p>
            </div>
            <button
              type="button"
              onClick={openResetDialog}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
            >
              Remettre les statistiques à zéro
            </button>
          </div>
        </section>
        )}

        {activeSection === "devices" && (
          <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Capteurs détectés</h2>
              <p className="text-sm text-gray-600">
                Les DevEUI apparaissent automatiquement dès qu'un webhook valide est traité. Le gateway est identifié séparément. Son état combine Milesight Open API et les webhooks reçus. Les informations batterie et solaire utilisent en priorité le webhook du SG50, puis l’Open API Milesight en secours.
              </p>
            </div>
          </div>

          {devices.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-600">
              Aucun DevEUI reçu pour le moment.
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const values = device.latest_data || {};
                const isGateway = isGatewayDevice(device, gatewayStatus);
                const webhookOnline = isGateway
                  ? gatewayIsOnline(device, latestDeviceWebhook)
                  : false;
                const apiOnline =
                  isGateway && gatewayStatus?.configured !== false
                    ? gatewayStatus?.apiOnline === true
                    : false;
                const gatewayOnline = isGateway ? (webhookOnline || apiOnline) : false;
                const localGatewayActivity = isGateway
                  ? gatewayActivityTimestamp(device, latestDeviceWebhook)
                  : null;
                const apiLastUpdate = Number(gatewayStatus?.lastUpdateTime);
                const gatewayActivity =
                  isGateway && Number.isFinite(apiLastUpdate)
                    ? Math.max(localGatewayActivity || 0, apiLastUpdate)
                    : localGatewayActivity;
                const webhookEnergy = isGateway
                  ? gatewayEnergyFromWebhook(values)
                  : null;
                const gatewayBatteryLevel =
                  webhookEnergy?.batteryLevel ??
                  gatewayStatus?.battery?.level ??
                  null;
                const gatewayBatteryStatus =
                  webhookEnergy?.batteryStatus ??
                  gatewayStatus?.battery?.status ??
                  null;
                const gatewayBatteryTemperature =
                  webhookEnergy?.batteryTemperature ??
                  gatewayStatus?.battery?.temperature ??
                  null;
                const gatewayBatteryTemperatureReportedAt =
                  webhookEnergy?.batteryTemperature !== null &&
                  webhookEnergy?.batteryTemperature !== undefined
                    ? device.last_seen_at
                    : gatewayStatus?.battery?.temperatureReportedAt ?? null;
                const gatewaySolarActive =
                  webhookEnergy?.solarActive ??
                  gatewayStatus?.solar?.active ??
                  null;
                const gatewaySolarLabel =
                  webhookEnergy?.solarLabel ??
                  gatewayStatus?.solar?.label ??
                  null;
                return (
                  <div key={device.device_uuid} className="bg-white rounded-2xl shadow p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_1fr_1fr] gap-4 items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          {isGateway && (
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${
                                gatewayOnline ? "bg-green-500" : "bg-red-500"
                              }`}
                              title={
                                gatewayOnline
                                  ? "Gateway en ligne — Milesight Open API indique ONLINE ou un webhook récent confirme la chaîne LoRaWAN"
                                  : "Gateway hors ligne — aucun signal récent via Milesight Open API ou webhook"
                              }
                              aria-label={gatewayOnline ? "Gateway en ligne" : "Gateway hors ligne"}
                            />
                          )}
                          <div className="text-xs uppercase tracking-wide text-gray-400">DevEUI</div>
                        </div>
                        <div className="font-mono font-semibold text-gray-900 break-all">
                          {device.device_uuid}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          {isGateway ? "Dernière activité réseau" : "Dernier webhook"} :{" "}
                          {formatDate(isGateway ? gatewayActivity : device.last_seen_at)}
                        </div>
                        {isGateway && (
                          <div
                            className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold ${
                              gatewayOnline ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${
                                gatewayOnline ? "bg-green-500" : "bg-red-500"
                              }`}
                            />
                            {gatewayOnline ? "En ligne" : "Hors ligne"}
                          </div>
                        )}
                      </div>

                      <div className="text-sm">
                        <label className="block font-medium text-gray-700 mb-1" htmlFor={`nickname-${device.device_uuid}`}>
                          Surnom
                        </label>
                        <div className="flex gap-2">
                          <input
                            id={`nickname-${device.device_uuid}`}
                            type="text"
                            maxLength={80}
                            value={device.nickname || ""}
                            onChange={(event) => updateNicknameDraft(device.device_uuid, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveNickname(device.device_uuid, device.nickname || "");
                                event.currentTarget.blur();
                              }
                            }}
                            placeholder="Ex. Code intérieur"
                            className="min-w-0 w-full border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => saveNickname(device.device_uuid, device.nickname || "")}
                            className="shrink-0 px-3 py-2 border rounded-xl text-xs font-semibold hover:bg-gray-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>

                      <div className="text-sm text-gray-700">
                        <div>
                          <strong>Type :</strong>{" "}
                          {isGateway ? `Gateway LoRaWAN ${gatewayStatus?.gateway?.model || "SG50"}` : (device.record_type || "—")}
                        </div>
                        {isGateway ? (
                          <div className="mt-1 space-y-1">
                            <div>
                              <strong>État Milesight :</strong>{" "}
                              {gatewayStatusLoading && !gatewayStatus
                                ? "Chargement…"
                                : gatewayStatus?.connectStatus || "—"}
                            </div>
                            <div>
                              <strong>Dernière activité réseau :</strong>{" "}
                              {formatDate(gatewayActivity)}
                            </div>
                            {gatewayStatus?.gateway?.firmwareVersion && (
                              <div>
                                <strong>Firmware :</strong>{" "}
                                {gatewayStatus.gateway.firmwareVersion}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <strong>Dernière mesure :</strong>{" "}
                            {values.temperature !== undefined ? `${values.temperature} °C` : "—"}
                            {values.humidity !== undefined ? ` · ${values.humidity} %` : ""}
                          </div>
                        )}
                      </div>

                      {isGateway ? (
                        <div className="text-sm">
                          <div className="mb-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="block font-medium text-gray-700">Énergie SG50</span>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={syncGatewayEnergy}
                                  disabled={gatewayManualSyncing}
                                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  title="Récupérer les dernières informations déjà disponibles"
                                >
                                  <span aria-hidden="true" className={gatewayManualSyncing ? "animate-spin" : ""}>↻</span>
                                  {gatewayManualSyncing ? "Synchronisation…" : "Synchroniser"}
                                </button>

                                <button
                                  type="button"
                                  onClick={queryGatewayNow}
                                  disabled={
                                    gatewayQuerying ||
                                    !gatewayStatus?.capabilities?.statusQuerySupported
                                  }
                                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                                  title={
                                    gatewayStatus?.capabilities?.statusQuerySupported
                                      ? `Forcer une nouvelle demande via ${gatewayStatus.capabilities.statusQueryService?.id || "le service TSL détecté"}`
                                      : "Aucun service d'interrogation compatible détecté dans le TSL du SG50"
                                  }
                                >
                                  <span aria-hidden="true">📡</span>
                                  {gatewayQuerying ? "Interrogation…" : "Interroger SG50"}
                                </button>
                              </div>
                            </div>

                            <div className="mt-1 text-[11px]">
                              {gatewayStatus?.capabilities?.statusQuerySupported ? (
                                <span className="text-green-700">
                                  Interrogation directe disponible :{" "}
                                  <span className="font-mono">
                                    {gatewayStatus.capabilities.statusQueryService?.id}
                                  </span>
                                </span>
                              ) : gatewayStatus?.capabilities ? (
                                <span className="text-gray-500">
                                  Aucun service de demande d’état compatible détecté dans le TSL
                                  ({gatewayStatus.capabilities.serviceCount || 0} service(s) publié(s)).
                                </span>
                              ) : (
                                <span className="text-gray-400">
                                  Détection des commandes SG50…
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full border rounded-xl px-3 py-2 bg-gray-50 text-gray-700 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span>🔋 Batterie</span>
                              <strong>
                                {gatewayBatteryLevel !== null &&
                                gatewayBatteryLevel !== undefined
                                  ? `${gatewayBatteryLevel}%`
                                  : "—"}
                              </strong>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>État batterie</span>
                              <span>{gatewayBatteryStatus || "—"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>☀️ Solaire</span>
                              <span
                                className={
                                  gatewaySolarActive === true
                                    ? "font-semibold text-green-700"
                                    : gatewaySolarActive === false
                                    ? "font-semibold text-gray-600"
                                    : ""
                                }
                              >
                                {gatewaySolarLabel || "—"}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span>🌡️ Batterie</span>
                                <span>
                                  {gatewayBatteryTemperature !== null &&
                                  gatewayBatteryTemperature !== undefined
                                    ? `${gatewayBatteryTemperature} °C`
                                    : "—"}
                                </span>
                              </div>
                              {gatewayBatteryTemperatureReportedAt && (
                                <div className="text-[11px] text-gray-500 text-right mt-0.5">
                                  Rapportée : {formatDate(gatewayBatteryTemperatureReportedAt)}
                                </div>
                              )}
                              {gatewayBatteryTemperature == null &&
                                gatewayStatus?.propertyScan?.missing?.includes("battery_temperature") && (
                                  <div className="text-[11px] text-amber-700 mt-1">
                                    Température non trouvée après{" "}
                                    {gatewayStatus.propertyScan.recordsScanned || 0} rapport(s) Milesight
                                    sur {gatewayStatus.propertyScan.pagesScanned || 0} page(s).
                                  </div>
                                )}
                            </div>
                          </div>
                          {gatewayQueryMessage && (
                            <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-2 text-xs text-blue-800">
                              {gatewayQueryMessage}
                            </div>
                          )}
                          {gatewayLastManualSync && (
                            <div className="mt-2 text-[11px] text-gray-500">
                              Dernière synchronisation manuelle : {formatDate(gatewayLastManualSync)}
                            </div>
                          )}
                          {gatewayStatusError && (
                            <div className="mt-2 text-xs text-amber-700">
                              {gatewayStatusError}
                            </div>
                          )}
                        </div>
                      ) : (
                        <label className="text-sm">
                          <span className="block font-medium text-gray-700 mb-1">Assignation</span>
                          <select
                            value={device.assignment || "unassigned"}
                            onChange={(event) => assign(device.device_uuid, event.target.value)}
                            className="w-full border rounded-xl px-3 py-2 bg-white"
                          >
                            {ASSIGNMENTS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}

        {resetOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-stats-title"
          >
            <form
              onSubmit={resetStatistics}
              className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6"
            >
              <div className="w-11 h-11 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xl font-bold mb-4">
                !
              </div>
              <h2 id="reset-stats-title" className="text-xl font-bold text-gray-900">
                Confirmer la remise à zéro
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                Cette opération est irréversible. Toutes les mesures historiques de la phase de test seront supprimées.
                La configuration des capteurs sera conservée.
              </p>

              <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-800">
                Pour confirmer, saisis de nouveau le mot de passe administrateur.
              </div>

              <label className="block text-sm font-medium text-gray-700 mt-5 mb-2" htmlFor="reset-admin-password">
                Mot de passe administrateur
              </label>
              <input
                id="reset-admin-password"
                type="password"
                autoComplete="current-password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
                required
              />

              {resetError && (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">
                  {resetError}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={closeResetDialog}
                  disabled={resetLoading}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || !resetPassword}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {resetLoading ? "Remise à zéro…" : "Confirmer la remise à zéro"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
