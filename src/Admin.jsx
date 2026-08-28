import React, { useEffect, useMemo, useState } from "react";

const ASSIGNMENTS = [
  { value: "unassigned", label: "Non assigné" },
  { value: "code_indoor", label: "Code — intérieur" },
  { value: "passivehouse_indoor", label: "PassiveHouse — intérieur" },
  { value: "outdoor_shared", label: "Extérieur — partagé" },
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "medium" });
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [devices, setDevices] = useState([]);
  const [authenticated, setAuthenticated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const mappedCount = useMemo(
    () => devices.filter((device) => device.assignment).length,
    [devices]
  );

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

  useEffect(() => {
    loadDevices();
  }, []);

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
            <h1 className="text-2xl font-bold text-gray-900">Capteurs Milesight</h1>
            <p className="text-sm text-gray-600 mt-1">
              Les DevEUI apparaissent ici automatiquement dès qu'un webhook est reçu.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/" className="px-3 py-2 border rounded-xl text-sm hover:bg-gray-50">
              Voir le dashboard
            </a>
            <button onClick={loadDevices} className="px-3 py-2 border rounded-xl text-sm hover:bg-gray-50">
              Actualiser
            </button>
            <button onClick={logout} className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm">
              Déconnexion
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">{devices.length}</div>
            <div className="text-sm text-gray-500">DevEUI détectés</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">{mappedCount}</div>
            <div className="text-sm text-gray-500">Capteurs assignés</div>
          </div>
        </div>

        {message && (
          <div className="bg-blue-50 border border-blue-100 text-blue-800 rounded-xl px-4 py-3 mb-4 text-sm">
            {message}
          </div>
        )}

        {devices.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-600">
            Aucun DevEUI reçu pour le moment. Envoie un webhook Milesight puis clique sur « Actualiser ».
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => {
              const values = device.latest_data || {};
              return (
                <div key={device.device_uuid} className="bg-white rounded-2xl shadow p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr] gap-4 items-center">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-400">DevEUI</div>
                      <div className="font-mono font-semibold text-gray-900 break-all">
                        {device.device_uuid}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Dernier webhook : {formatDate(device.last_seen_at)}
                      </div>
                    </div>

                    <div className="text-sm text-gray-700">
                      <div><strong>Type :</strong> {device.record_type || "—"}</div>
                      <div>
                        <strong>Dernière mesure :</strong>{" "}
                        {values.temperature !== undefined ? `${values.temperature} °C` : "—"}
                        {values.humidity !== undefined ? ` · ${values.humidity} %` : ""}
                      </div>
                    </div>

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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
