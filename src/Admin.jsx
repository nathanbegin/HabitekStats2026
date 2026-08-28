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

function isGatewayDevice(device) {
  if (!device) return false;
  const nickname = String(device.nickname || "").toLowerCase();
  return (
    device.record_type === "unknown" ||
    nickname.includes("gateway") ||
    nickname.includes("sg50")
  );
}

function gatewayIsOnline(device) {
  const lastSeen = new Date(device?.last_seen_at || "").getTime();
  if (!Number.isFinite(lastSeen)) return false;
  return Date.now() - lastSeen <= GATEWAY_ONLINE_WINDOW_MS;
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

  const mappedCount = useMemo(
    () => devices.filter((device) => device.assignment).length,
    [devices]
  );

  const latestWebhook = logs[0] || null;

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

  const refreshAll = () => {
    loadDevices();
    loadLogs();
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
                Les DevEUI apparaissent automatiquement dès qu'un webhook valide est traité. Le gateway est identifié séparément avec son état en ligne/hors ligne selon l'heure du dernier webhook.
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
                const isGateway = isGatewayDevice(device);
                const gatewayOnline = isGateway ? gatewayIsOnline(device) : false;
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
                                  ? "Gateway en ligne — webhook reçu dans les 30 dernières minutes"
                                  : "Gateway hors ligne — aucun webhook récent"
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
                          Dernier webhook : {formatDate(device.last_seen_at)}
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
                          {isGateway ? "Gateway LoRaWAN SG50" : (device.record_type || "—")}
                        </div>
                        {isGateway ? (
                          <div className="mt-1">
                            <strong>Dernière activité :</strong>{" "}
                            {formatDate(device.last_seen_at)}
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
                          <span className="block font-medium text-gray-700 mb-1">Rôle</span>
                          <div className="w-full border rounded-xl px-3 py-2 bg-gray-50 text-gray-700">
                            Passerelle LoRaWAN
                          </div>
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
