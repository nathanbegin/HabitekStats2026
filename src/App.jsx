// App.jsx
// Main application component rendering building statistics with live WebSocket updates
import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import Chart from "react-apexcharts"; // Import ApexCharts
import ApexCharts from "apexcharts"; // Used for programmatic PNG exports
import { createClient } from "@supabase/supabase-js"; // Supabase Realtime

// --- Translation Context and Hook ---
const LanguageContext = createContext();

const translations = {
  fr: {
    event: "ICE‑BOX Challenge Montréal 2026",
    appTitle: "Statistiques des cabanes HabiTEK",
    currentConditions: "Conditions Actuelles",
    loadingStats: "Chargement des dernières statistiques...",
    tempInt: "Temp. Int.",
    humInt: "Hum. Int.",
    tempExt: "Temp. Ext.",
    humExt: "Hum. Ext.",
    lastUpdate: "Dernière MAJ",
    cameraSnapshot: "Dernière capture caméra",
    noImageAvailable: "Aucune image disponible",
    selectBuilding: "Sélectionne une cabane HabiTEK pour afficher ses statistiques de température et d’humidité.",
    dataNotAvailable: "Données historiques non disponibles pour cette cabane (ND)",
    buildingStats: "Statistiques de la cabane :",
    range: "Plage",
    hours: "h",
    day: "jour",
    week: "sem",
    exitFullscreen: "Quitter plein écran",
    fullscreen: "Plein écran",
    temperatureIntLabel: "Temp. intérieure (°C)",
    temperatureExtLabel: "Temp. extérieure (°C)",
    humidityIntLabel: "Humidité intérieure (%)",
    humidityExtLabel: "Humidité extérieure (%)",
    measuredValue: "Valeur mesurée",
    time: "Temps (horodatage)",
    comparison: "Comparaison",
    building1: "Cabane 1",
    building2: "Cabane 2",
    disableDemoMode: "🔁 Désactiver mode démo",
    activateDemoMode: "🧪 Activer mode démo",
    customRange: "Plage personnalisée",
    startDate: "Date de début",
    endDate: "Date de fin",
    applyRange: "Confirmer",
    exportCsv: "Exporter CSV",
    exportComparisonPng: "PNG comparaison (avec légende)",
    exportComparisonSvg: "SVG (qualité vectorielle)",
    exportComparisonPdf: "PDF imprimable (toutes les comparaisons)",
    hottestDayTitle: "Journée la plus chaude (température ext.)",
    topHotDays: "5 journées les plus chaudes",
    topColdDays: "5 journées les plus froides",
    statsForBuilding: "Statistiques pour la cabane",
    max: "Max",
    min: "Min",
    avg: "Moyenne",
    noDataHottest: "Aucune donnée extérieure pour déterminer la journée la plus chaude.",
    footerText: "Site pour l'Ice Box Challenge Montréal 2026. Les valeurs des capteurs sont obtenues grâce au partenariat avec Telus.",
  },
  en: {
    event: "ICE‑BOX Challenge Montréal 2026",
    appTitle: "HabiTEK Cabin Statistics",
    currentConditions: "Current Conditions",
    loadingStats: "Loading latest statistics...",
    tempInt: "Indoor Temp.",
    humInt: "Indoor Hum.",
    tempExt: "Outdoor Temp.",
    humExt: "Outdoor Hum.",
    lastUpdate: "Last Update",
    cameraSnapshot: "Latest Camera Snapshot",
    noImageAvailable: "No image available",
    selectBuilding: "Select a HabiTEK cabin to view its temperature and humidity statistics.",
    dataNotAvailable: "Historical data not available for this cabin (NA)",
    buildingStats: "Cabin Statistics:",
    range: "Range",
    hours: "h",
    day: "day",
    week: "week",
    exitFullscreen: "Exit Fullscreen",
    fullscreen: "Fullscreen",
    temperatureIntLabel: "Indoor Temp. (°C)",
    temperatureExtLabel: "Outdoor Temp. (°C)",
    humidityIntLabel: "Indoor Humidity (%)",
    humidityExtLabel: "Outdoor Humidity (%)",
    measuredValue: "Measured Value",
    time: "Time (Timestamp)",
    comparison: "Comparison",
    building1: "Cabin 1",
    building2: "Cabin 2",
    disableDemoMode: "🔁 Disable Demo Mode",
    activateDemoMode: "🧪 Activate Demo Mode",
    customRange: "Custom range",
    startDate: "Start date",
    endDate: "End date",
    applyRange: "Apply",
    exportCsv: "Export CSV",
    exportComparisonPng: "Comparison PNG (with legend)",
    exportComparisonSvg: "SVG (vector quality)",
    exportComparisonPdf: "Printable PDF (all comparisons)",
    hottestDayTitle: "Hottest day (outdoor temp)",
    topHotDays: "Top 5 hottest days",
    topColdDays: "Top 5 coldest days",
    statsForBuilding: "Stats for cabin",
    max: "Max",
    min: "Min",
    avg: "Average",
    noDataHottest: "No outdoor data to determine the hottest day.",
    footerText: "Website for the Ice Box Challenge Montreal 2026. Sensor values are obtained through partnership with Telus.",
  },
};

const useTranslation = () => {
  const { language } = useContext(LanguageContext);
  const t = (key) => translations[language][key] || key;
  return { t, language };
};
// --- End Translation Context and Hook ---

// Utility to lighten colors for comparison series
// percent should be between -100 and 100 (negative for darker, positive for lighter)
const lightenColor = (color, percent) => {
  const num = parseInt(color.replace('#',''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
};

// Normalize a date to a YYYY-MM-DD key to group daily statistics
const getDayKey = (date) => {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

// Define available sensor keys with their labels and base colors
const AVAILABLE_KEYS = [
  { key: "temperature_int", label: "Temp. intérieure (°C)", labelEn: "Indoor Temp. (°C)", color: "#2563eb" }, // Blue
  { key: "temperature_ext", label: "Temp. extérieure (°C)", labelEn: "Outdoor Temp. (°C)", color: "#10b981" }, // Green
  { key: "humidity_int", label: "Humidité intérieure (%)", labelEn: "Indoor Humidity (%)", color: "#f59e0b" }, // Amber
  { key: "humidity_ext", label: "Humidité extérieure (%)", labelEn: "Outdoor Humidity (%)", color: "#ef4444" }  // Red
];

// HabiTEK 2026 has two cabins: Code and PassiveHouse.
// Legacy UUIDs are retained as migration defaults until the 2026 DevEUI values are confirmed.
// Update these three values when the 2026 sensors are assigned.
const CODE_INDOOR_DEVICE_UUID =
  import.meta.env.VITE_CODE_INDOOR_DEVICE_UUID || '24E124785F162247';
const PASSIVEHOUSE_INDOOR_DEVICE_UUID =
  import.meta.env.VITE_PASSIVEHOUSE_INDOOR_DEVICE_UUID || '24E124785F160861';
const OUTDOOR_DEVICE_UUID =
  import.meta.env.VITE_OUTDOOR_DEVICE_UUID || '24E124785F162605';

const CABINS = ['Code', 'PassiveHouse'];

const DEVICE_UUID_BUILDING_MAP = {
  [CODE_INDOOR_DEVICE_UUID]: { appliesTo: ['Code'], type: 'indoor' },
  [PASSIVEHOUSE_INDOOR_DEVICE_UUID]: { appliesTo: ['PassiveHouse'], type: 'indoor' },
  [OUTDOOR_DEVICE_UUID]: { appliesTo: CABINS, type: 'outdoor' },
};

// WebSocket server URL
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// This is the actual application logic component that consumes the context
function AppContent() {
  const { t, language } = useTranslation(); // Now useTranslation is called within the context provider

  // Default custom range to display data immediately on load.
  const nowForDefaultRange = new Date();
  const startForDefaultRange = new Date(nowForDefaultRange.getTime() - 24 * 60 * 60 * 1000);
  const toDateTimeLocal = (date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const defaultStart = toDateTimeLocal(startForDefaultRange);
  const defaultEnd = toDateTimeLocal(nowForDefaultRange);

  const [building, setBuilding] = useState("Code"); // Currently selected building for the main chart
  const [data, setData] = useState([]); // Stores data for the currently selected building for charts
  const [comparisonData, setComparisonData] = useState([]); // Stores data for both HabiTEK cabins for comparison chart
  const [latestStats, setLatestStats] = useState({}); // Stores the very latest stats for each building (for current conditions panel)
  const [snapshotUrl, setSnapshotUrl] = useState(''); // URL for camera snapshot
  const [compareBuildings, setCompareBuildings] = useState(['Code', 'PassiveHouse']); // Buildings selected for comparison
  const [compareSeries, setCompareSeries] = useState([]); // Formatted series for comparison chart
  const [error, setError] = useState(false); // Error state for API calls
  const [useFakeData, setUseFakeData] = useState(false); // Toggle for fake data mode
  const [visibleKeys, setVisibleKeys] = useState(AVAILABLE_KEYS.map((k) => k.key)); // Keys visible in the main chart
  const [visibleCompareKeys, setVisibleCompareKeys] = useState(AVAILABLE_KEYS.map((k) => k.key)); // Keys visible in the comparison chart
  const [rangeHours, setRangeHours] = useState(24); // Default number of hours displayed in charts
  const [customStart, setCustomStart] = useState(defaultStart); // Custom start date for filtering
  const [customEnd, setCustomEnd] = useState(defaultEnd); // Custom end date for filtering
  // Draft values let users adjust the calendar without triggering network calls until they confirm.
  const [pendingStart, setPendingStart] = useState(defaultStart);
  const [pendingEnd, setPendingEnd] = useState(defaultEnd);
  // Track viewport width to tailor chart heights/labels for mobile readability.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [lastUpdate, setLastUpdate] = useState(null); // Timestamp of last data refresh
  const [isChartFullscreen, setIsChartFullscreen] = useState(false); // Fullscreen state for the main chart
  const [loadingLatestStats, setLoadingLatestStats] = useState(true); // Loading state for latest stats panel
  const [hottestDayStats, setHottestDayStats] = useState(null); // Tracks the hottest day and per-building summary
  const [extremeDays, setExtremeDays] = useState({ hottest: [], coldest: [] }); // Tracks 5 hottest/coldest days

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getTimeWindow = () => {
    const now = new Date();
    const parsedEnd = customEnd ? new Date(customEnd) : now;
    const safeEnd = isNaN(parsedEnd.getTime()) ? now : parsedEnd;

    const parsedStart = customStart ? new Date(customStart) : new Date(safeEnd.getTime() - rangeHours * 60 * 60 * 1000);
    const safeStart = isNaN(parsedStart.getTime())
      ? new Date(safeEnd.getTime() - rangeHours * 60 * 60 * 1000)
      : parsedStart;

    if (safeStart > safeEnd) {
      return {
        start: new Date(safeEnd.getTime() - rangeHours * 60 * 60 * 1000),
        end: safeEnd,
        hours: rangeHours,
      };
    }

    return {
      start: safeStart,
      end: safeEnd,
      hours: Math.max(1, Math.round((safeEnd.getTime() - safeStart.getTime()) / (60 * 60 * 1000)))
    };
  };

  // Build min/max/avg stats for a given day key and building data array
  const summarizeDayForBuilding = (dayKey, buildingData) => {
    const inDay = buildingData.filter((d) => getDayKey(d.timestamp) === dayKey);
    const metrics = {};

    ['temperature_ext', 'temperature_int', 'humidity_ext', 'humidity_int'].forEach((key) => {
      const values = inDay
        .map((d) => parseFloat(d[key]))
        .filter((v) => !isNaN(v));
      if (values.length) {
        const max = Math.max(...values);
        const min = Math.min(...values);
        const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
        metrics[key] = { max, min, avg };
      }
    });

    return { count: inDay.length, metrics };
  };

  // Helper function to update a data array (either `data` or a `compBuilding.data`)
  // This function handles merging new data points with existing ones if timestamps are very close.
  const updateDataArray = (prevArray, newSensorData, newTimestamp, timeThresholdMs) => {
    const updatedArray = [...prevArray];
    const lastEntryIndex = updatedArray.length - 1;
    const lastEntry = lastEntryIndex >= 0 ? updatedArray[lastEntryIndex] : null;
  
    if (lastEntry && (newTimestamp.getTime() - lastEntry.timestamp.getTime()) < timeThresholdMs) {
      // Merge into the last existing entry
      updatedArray[lastEntryIndex] = {
        ...lastEntry,
        ...newSensorData,
        timestamp: newTimestamp
      };
    } else {
      // Create a NEW entry, starting from previous values if they exist
      const base = lastEntry ? { ...lastEntry } : { timestamp: newTimestamp };
      const newEntry = {
        ...base,
        ...newSensorData,
        timestamp: newTimestamp
      };
      updatedArray.push(newEntry);
    }
  
    // ⭐ MODIFIED: Filter based on the *current time* (Date.now()), not newTimestamp
    const { start, end } = getTimeWindow();
    return updatedArray.filter(d =>
      d.timestamp.getTime() >= start.getTime() && d.timestamp.getTime() <= end.getTime()
    );
  };

const fetchStats = async (buildingName, timeWindow) => { // Add rangeHours as a parameter
  if (useFakeData) {
    console.log(`[fetchStats] Generating fake data for ${buildingName}.`);
    const now = timeWindow.end.getTime();
    const interval = 60 * 60 * 1000; // 1 hour in milliseconds
    const count = timeWindow.hours;
    const fakeData = Array.from({ length: count }, (_, i) => {
      const timestamp = new Date(now - (count - i - 1) * interval);
      return {
        timestamp, // Store as Date object
        temperature_int: (20 + Math.random() * 5), // Return as number
        temperature_ext: (15 + Math.random() * 10), // Return as number
        humidity_int: (40 + Math.random() * 20), // Return as number
        humidity_ext: (50 + Math.random() * 30) // Return as number
      };
    });
    return fakeData;
  }

  try {
    // Calculate start_timestamp and end_timestamp
    const endTimestamp = timeWindow.end.toISOString();
    console.log(`Current time : ${endTimestamp}`);
    const startTimestamp = timeWindow.start.toISOString();

    // ⭐ ADDED: Log rangeHours, endTimestamp, and startTimestamp
    console.log(`[fetchStats Debug] hours: ${timeWindow.hours}, endTimestamp: ${endTimestamp}, startTimestamp: ${startTimestamp}`);


    // Construct the API URL with start_timestamp, end_timestamp, and a generous limit
    // The limit is still included as your backend API uses it, ensuring enough data is pulled
    const apiUrl = `/api/history?start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}&limit=50000`;
    console.log(`[fetchStats] Fetching historical data for ${buildingName} from: ${apiUrl}`);
    const res = await fetch(apiUrl);
    console.log(`[fetchStats] API response status for ${buildingName}: ${res.status}`);

    if (!res.ok) {
      throw new Error(`API Error fetching historical data: ${res.status} ${res.statusText}`);
    }
    const allHistoryData = await res.json();
    console.log(`[fetchStats] Received ${allHistoryData.length} raw items from API for ${buildingName}.`);

    const buildingSpecificData = allHistoryData
      .filter(item => {
        const deviceUuid = item.device_uuid;
        const mappedDevice = DEVICE_UUID_BUILDING_MAP[deviceUuid];
        return mappedDevice && mappedDevice.appliesTo.includes(buildingName);
      })
      .map(item => {
        const timestamp = new Date(item.timestamp);
        // ⭐ ADDED: Check for invalid timestamp immediately after creation
        if (isNaN(timestamp.getTime())) {
          console.warn(`[fetchStats] Invalid timestamp encountered for item:`, item);
          return null; // Return null for invalid items
        }

        const sensorData = {
            timestamp,
            temperature_int: undefined,
            temperature_ext: undefined,
            humidity_int: undefined,
            humidity_ext: undefined,
        };

        const deviceMapping = DEVICE_UUID_BUILDING_MAP[item.device_uuid];

        if (item.record_type === 'sensor' && item.data) {
          if (deviceMapping.type === 'indoor') {
            if (item.data.temperature !== undefined) sensorData.temperature_int = parseFloat(item.data.temperature);
            if (item.data.humidity !== undefined) sensorData.humidity_int = parseFloat(item.data.humidity);
          } else if (deviceMapping.type === 'outdoor') {
            if (item.data.temperature !== undefined) sensorData.temperature_ext = parseFloat(item.data.temperature);
            if (item.data.humidity !== undefined) sensorData.humidity_ext = parseFloat(item.data.humidity);
          }
        }
        return sensorData;
      })
      .filter(d => d !== null) // ⭐ ADDED: Filter out nulls (invalid items) here
      .filter(d => !isNaN(d.temperature_int) || !isNaN(d.temperature_ext) || !isNaN(d.humidity_int) || !isNaN(d.humidity_ext)); // Keep existing filter

    // Group by timestamp and merge properties
    const groupedData = {};
    buildingSpecificData.forEach(item => {
      //const timeKey = item.timestamp.toISOString();
      const timeKey = item.timestamp;
      //console.log(timeKey);
      if (!groupedData[timeKey]) {
        groupedData[timeKey] = { timestamp: item.timestamp };
      }
      Object.assign(groupedData[timeKey], item);
    });

    const mergedAndSortedData = Object.values(groupedData).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    console.log(`[fetchStats] Processed and merged ${mergedAndSortedData.length} data points for ${buildingName}.`);

   // Log the oldest entry
   if (mergedAndSortedData.length > 0) {
    console.log(`[fetchStats] Oldest entry for ${buildingName}:`, mergedAndSortedData[0]);
    // ⭐ ADDED: Log the most recent entry
    console.log(`[fetchStats] Most recent entry for ${buildingName}:`, mergedAndSortedData[mergedAndSortedData.length - 1]);
  } else {
    console.log(`[fetchStats] No data found to determine the oldest entry for ${buildingName}.`);
  }

    // Return all data within the fetched time range, as API now filters by time
    return mergedAndSortedData; // Remove .slice(-rangeHours)
  } catch (e) {
    console.error(`[fetchStats] Error loading historical data for ${buildingName}:`, e);
    return [];
  }
};




  // Helper fetching data for both HabiTEK cabins, used for the comparison chart
  const fetchAllStatsForCharts = async () => {
    console.log('[fetchAllStatsForCharts] Fetching data for both HabiTEK cabins for comparison.');
    const buildingsList = CABINS;
    const timeWindow = getTimeWindow();
    const allDataPromises = buildingsList.map(async (b) => {
      const stats = await fetchStats(b, timeWindow); // This will return live/historical data or empty array if API is not implemented
      return { name: b, data: stats }; // stats is already filtered and merged
    });
    return Promise.all(allDataPromises);
  };

  // Fonction pour récupérer les données historiques les plus récentes pour le panneau "Conditions Actuelles"
  const fetchLatestStatsForPanel = async (buildingName) => {
    if (useFakeData) {
      return {
        temperature_int: (20 + Math.random() * 5).toFixed(1),
        temperature_ext: (15 + Math.random() * 10).toFixed(1),
        humidity_int: (40 + Math.random() * 20).toFixed(0),
        humidity_ext: (50 + Math.random() * 30).toFixed(0),
        timestamp: new Date().toLocaleString(language === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }),
      };
    }

    try {
      const apiUrl = `/api/history?limit=1000`;
      //const apiUrl = `/api/history`; // Fetch more to find the very latest for each type
      console.log(`[fetchLatestStatsForPanel] Fetching data for ${buildingName} from: ${apiUrl}`);
      const res = await fetch(apiUrl);

      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
      }
      const allHistoryData = await res.json();
      console.log(`[fetchLatestStatsForPanel] Received ${allHistoryData.length} raw items from API for ${buildingName}.`);

      const latestDataForBuilding = {};
      let latestOverallTimestamp = null; // Track the latest timestamp for any sensor in this building

      allHistoryData.forEach(item => {
        const deviceUuid = item.device_uuid;
        const mappedDevice = DEVICE_UUID_BUILDING_MAP[deviceUuid];

        if (mappedDevice && mappedDevice.appliesTo.includes(buildingName) && item.record_type === 'sensor' && item.data) {
          const timestamp = new Date(item.timestamp).getTime();
          // ⭐ Consider adding an `isNaN(timestamp)` check here as well for robustness,
          // though it's less likely to cause a hard error with `toLocaleString` than `toISOString`.
          if (isNaN(timestamp)) {
              console.warn(`[fetchLatestStatsForPanel] Invalid timestamp encountered for item (panel):`, item);
              return; // Skip this item
          }

          let tempKey, humidityKey;
          if (mappedDevice.type === 'indoor') {
            tempKey = 'temperature_int';
            humidityKey = 'humidity_int';
          } else if (mappedDevice.type === 'outdoor') {
            tempKey = 'temperature_ext';
            humidityKey = 'humidity_ext';
          }

          if (item.data.temperature !== undefined) {
            if (!latestDataForBuilding[tempKey] || (latestDataForBuilding[tempKey + '_ts'] && timestamp > latestDataForBuilding[tempKey + '_ts'])) {
              latestDataForBuilding[tempKey] = parseFloat(item.data.temperature).toFixed(1);
              latestDataForBuilding[tempKey + '_ts'] = timestamp; // Store timestamp associated with this specific sensor value
            }
          }
          if (item.data.humidity !== undefined) {
            if (!latestDataForBuilding[humidityKey] || (latestDataForBuilding[humidityKey + '_ts'] && timestamp > latestDataForBuilding[humidityKey + '_ts'])) {
              latestDataForBuilding[humidityKey] = parseFloat(item.data.humidity).toFixed(0);
            }
          }
          if (!latestOverallTimestamp || timestamp > latestOverallTimestamp) {
            latestOverallTimestamp = timestamp;
          }
        }
      });
      // Clean up temporary timestamps
      Object.keys(latestDataForBuilding).forEach(key => {
        if (key.endsWith('_ts')) delete latestDataForBuilding[key];
      });

      latestDataForBuilding.timestamp = latestOverallTimestamp ? new Date(latestOverallTimestamp).toLocaleString(language === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';
      return latestDataForBuilding;

    } catch (e) {
      console.error(`[fetchLatestStatsForPanel] Error loading data for ${buildingName}:`, e);
      return {};
    }
  };

  // Subscribe to inserts in Supabase Realtime
  useEffect(() => {
    if (!supabase) {
      console.warn('[Supabase] Realtime disabled: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const timeThresholdMs = 5000;

    const channel = supabase
      .channel('device-data-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_data' },
        (payload) => {
          if (useFakeData) return;

          const row = payload.new;
          if (!row) return;

          const liveData = {
            device_uuid: row.device_uuid,
            timestamp: row.timestamp,
            record_type: row.record_type,
            values: row.data || {},
          };

          const deviceMapping = DEVICE_UUID_BUILDING_MAP[liveData.device_uuid];
          if (!deviceMapping) return;

          if (liveData.record_type === 'camera' && liveData.values?.image) {
            setSnapshotUrl(liveData.values.image);
          }

          if (liveData.record_type !== 'sensor' || !liveData.values) return;

          const newTimestamp = new Date(liveData.timestamp);
          if (isNaN(newTimestamp.getTime())) return;

          const newSensorData = { timestamp: newTimestamp };

          if (deviceMapping.type === 'indoor') {
            if (liveData.values.temperature !== undefined) {
              newSensorData.temperature_int = parseFloat(liveData.values.temperature);
            }
            if (liveData.values.humidity !== undefined) {
              newSensorData.humidity_int = parseFloat(liveData.values.humidity);
            }
          } else if (deviceMapping.type === 'outdoor') {
            if (liveData.values.temperature !== undefined) {
              newSensorData.temperature_ext = parseFloat(liveData.values.temperature);
            }
            if (liveData.values.humidity !== undefined) {
              newSensorData.humidity_ext = parseFloat(liveData.values.humidity);
            }
          }

          if (deviceMapping.appliesTo.includes(building)) {
            setData((prevData) =>
              updateDataArray(prevData, newSensorData, newTimestamp, timeThresholdMs)
            );
            setLastUpdate(newTimestamp);
          }

          setComparisonData((prevComparisonData) =>
            prevComparisonData.map((compBuilding) => {
              if (!deviceMapping.appliesTo.includes(compBuilding.name)) return compBuilding;
              return {
                ...compBuilding,
                data: updateDataArray(
                  compBuilding.data,
                  newSensorData,
                  newTimestamp,
                  timeThresholdMs
                ),
              };
            })
          );

          deviceMapping.appliesTo.forEach((buildingName) => {
            setLatestStats((prevStats) => {
              const updatedStats = { ...(prevStats[buildingName] || {}) };

              if (deviceMapping.type === 'indoor') {
                if (liveData.values.temperature !== undefined) {
                  updatedStats.temperature_int = parseFloat(liveData.values.temperature).toFixed(1);
                }
                if (liveData.values.humidity !== undefined) {
                  updatedStats.humidity_int = parseFloat(liveData.values.humidity).toFixed(0);
                }
              } else {
                if (liveData.values.temperature !== undefined) {
                  updatedStats.temperature_ext = parseFloat(liveData.values.temperature).toFixed(1);
                }
                if (liveData.values.humidity !== undefined) {
                  updatedStats.humidity_ext = parseFloat(liveData.values.humidity).toFixed(0);
                }
              }

              updatedStats.timestamp = newTimestamp.toLocaleString(
                language === 'fr' ? 'fr-CA' : 'en-CA',
                { dateStyle: 'medium', timeStyle: 'short' }
              );

              return { ...prevStats, [buildingName]: updatedStats };
            });
          });
        }
      )
      .subscribe((status) => console.info('[Supabase Realtime]', status));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [building, rangeHours, compareBuildings, useFakeData, language, customStart, customEnd]);

  // Fetch initial main building data and refresh for historical/fake data for charts
  useEffect(() => {
    const updateMainChartData = async () => {
      console.log(`[useEffect - main chart data] Calling fetchStats for ${building}. useFakeData: ${useFakeData}`);
      const result = await fetchStats(building, getTimeWindow());
      if (result === "ND") {
        setData([]);
        setError(true);
      } else {
        setData(result);
        setError(false);
        setLastUpdate(new Date());
      }
    };
    updateMainChartData();
    const id = setInterval(updateMainChartData, 15 * 60 * 1000); // Refresh historical data every 15 mins
    console.log("Component updated. window.ApexCharts:", window.ApexCharts);
    return () => clearInterval(id);
  }, [building, useFakeData, rangeHours, customStart, customEnd]); // rangeHours is already a dependency

  // Load data for both HabiTEK cabins whenever demo mode changes or initial load for comparison chart
  useEffect(() => {
    console.log('[useEffect - comparison chart data] Calling fetchAllStatsForCharts.');
    fetchAllStatsForCharts().then(setComparisonData);
  }, [useFakeData, rangeHours, customStart, customEnd]); // rangeHours is already a dependency

  // Identify the hottest outdoor day across both HabiTEK cabins and compile per-building stats for that day
  useEffect(() => {
    if (!comparisonData.length) {
      setHottestDayStats(null);
      setExtremeDays({ hottest: [], coldest: [] });
      return;
    }

    let hottestEntry = null;

    comparisonData.forEach(({ data }) => {
      data.forEach((d) => {
        const temp = parseFloat(d.temperature_ext);
        if (!isNaN(temp)) {
          if (!hottestEntry || temp > hottestEntry.value) {
            hottestEntry = { value: temp, timestamp: d.timestamp };
          }
        }
      });
    });

    if (!hottestEntry) {
      setHottestDayStats(null);
      return;
    }

    const hottestDayKey = getDayKey(hottestEntry.timestamp);
    const perBuilding = {};
    comparisonData.forEach(({ name, data }) => {
      perBuilding[name] = summarizeDayForBuilding(hottestDayKey, data);
    });

    setHottestDayStats({ dayKey: hottestDayKey, perBuilding });

    // Build a ranking of hottest/coldest days based on outdoor temperature averages across both HabiTEK cabins
    const dayAverages = new Map();
    comparisonData.forEach(({ data }) => {
      data.forEach((d) => {
        const temp = parseFloat(d.temperature_ext);
        if (isNaN(temp)) return;
        const key = getDayKey(d.timestamp);
        const entry = dayAverages.get(key) || { temps: [] };
        entry.temps.push(temp);
        dayAverages.set(key, entry);
      });
    });

    const rankedDays = Array.from(dayAverages.entries())
      .map(([dayKey, entry]) => ({
        dayKey,
        avg: entry.temps.reduce((acc, v) => acc + v, 0) / entry.temps.length,
      }))
      .sort((a, b) => b.avg - a.avg);

    const topHottest = rankedDays.slice(0, 5).map((day) => ({
      ...day,
      perBuilding: Object.fromEntries(
        comparisonData.map(({ name, data }) => [name, summarizeDayForBuilding(day.dayKey, data)])
      ),
    }));

    const topColdest = rankedDays
      .slice(Math.max(rankedDays.length - 5, 0))
      .reverse()
      .map((day) => ({
        ...day,
        perBuilding: Object.fromEntries(
          comparisonData.map(({ name, data }) => [name, summarizeDayForBuilding(day.dayKey, data)])
        ),
      }));

    setExtremeDays({ hottest: topHottest, coldest: topColdest });
  }, [comparisonData]);

  // Load latest stats for both HabiTEK cabins for the "Conditions Actuelles" panel
  useEffect(() => {
    const loadAllLatestStats = async () => {
      setLoadingLatestStats(true);
      const buildingsList = CABINS;
      const statsPromises = buildingsList.map(b => fetchLatestStatsForPanel(b));
      const results = await Promise.all(statsPromises);
      const newLatestStats = {};
      buildingsList.forEach((b, index) => {
        newLatestStats[b] = results[index];
      });
      setLatestStats(newLatestStats);
      setLoadingLatestStats(false);
    };

    loadAllLatestStats();
    const intervalId = setInterval(loadAllLatestStats, 5 * 60 * 1000); // Refresh every 5 mins
    return () => clearInterval(intervalId);
  }, [useFakeData, language]);

  // Update camera snapshot every 15 minutes using a placeholder image (if not updated by WS)
  useEffect(() => {
    const updateSnapshot = () => {
      if (!snapshotUrl || snapshotUrl.startsWith('https://placehold.co')) {
        const ts = Date.now();
        const timeString = new Date(ts).toLocaleTimeString(language === 'fr' ? 'fr-CA' : 'en-CA', {hour:'2-digit', minute:'2-digit'});
        setSnapshotUrl(`https://placehold.co/640x480/E0E0E0/333333?text=Snapshot+${timeString}`);
      }
    };
    updateSnapshot();
    const id = setInterval(updateSnapshot, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [snapshotUrl, language]);

  const buildComparisonSeriesForPair = (pair) => {
    return pair.flatMap((b, index) => {
      const buildingData = comparisonData.find(cd => cd.name === b)?.data || [];
      return AVAILABLE_KEYS
        .filter(k => visibleCompareKeys.includes(k.key))
        .map((k) => {
          let seriesColor = k.color;
          if (index === 1) {
            seriesColor = lightenColor(k.color, 30);
          }

          return {
            name: `${language === 'fr' ? k.label : k.labelEn} - ${b}`,
            data: buildingData
              .map(d => ({ x: d.timestamp.getTime(), y: parseFloat(d[k.key]) }))
              .filter(point => !isNaN(point.y)),
            color: seriesColor
          };
        });
    });
  };

  // Fetch data for comparison chart whenever selected buildings or period change
  useEffect(() => {
    const fetchComparison = async () => {
      const seriesArr = buildComparisonSeriesForPair(compareBuildings);
      setCompareSeries(seriesArr); // seriesArr is already flat
    };
    fetchComparison();
  }, [compareBuildings, comparisonData, visibleCompareKeys, language]);

  // Listen to browser fullscreen events to resize the chart container
  useEffect(() => {
    const chartElement = document.getElementById("fullscreenChart");

    const handleFullscreenChange = () => {
      const enteringFullscreen = (document.fullscreenElement === chartElement);
      setIsChartFullscreen(enteringFullscreen);

      if (window.ApexCharts) {
        window.ApexCharts.exec(CHART_ID, 'updateOptions', {
          chart: {
            height: enteringFullscreen ? window.innerHeight - 80 : 550
          }
        }, false, true);
      }

      if (chartElement) {
          chartElement.style.transform = '';
          chartElement.style.transition = '';
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const timeWindow = getTimeWindow();

  // Filter series based on visibleKeys for the main chart
  const series = AVAILABLE_KEYS.filter(k => visibleKeys.includes(k.key)).map((k) => ({
    name: language === 'fr' ? k.label : k.labelEn, // Use translated label
    data: data.map((d) => ({ x: d.timestamp.getTime(), y: parseFloat(d[k.key]) }))
      .filter(point => !isNaN(point.y)),
    color: k.color
  }));

  // Formatter for X-axis labels
  const xAxisLabelFormatter = (value, timestamp) => {
    const date = new Date(timestamp);
    if (timeWindow.hours <= 12) {
      return date.toLocaleTimeString(language === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-CA', { day: '2-digit', month: 'short' }) + ' ' +
             date.toLocaleTimeString(language === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' });
    }
  };

  const CHART_ID = 'timeseries';
  const COMPARE_CHART_ID = 'compareChart';
  const mainChartHeight = isMobile ? 420 : 550;
  const comparisonChartHeight = isMobile ? 430 : 550;

  // Toggle fullscreen mode for a given element
  const handleFullscreen = (id) => {
    const el = document.getElementById(id);

    if (document.fullscreenElement === el) {
      document.exitFullscreen();
    } else if (el?.requestFullscreen) {
      el.requestFullscreen();
      el.style.transition = 'transform 0.3s ease';
      el.style.transform = 'scale(1.03)';
      setTimeout(() => {
        el.style.transform = 'scale(1)';
      }, 300);

      const audio = new Audio("https://actions.google.com/sounds/v1/cartoon/pop.ogg");
      audio.volume = 0.4;
      audio.play().catch(() => {});
    }
  };

  const allBuildings = CABINS;

  // Selecting a preset clears any draft/custom inputs so the preset window is authoritative.
  const handlePresetChange = (value) => {
    setRangeHours(value);
    setCustomStart('');
    setCustomEnd('');
    setPendingStart('');
    setPendingEnd('');
  };

  // Persist draft calendar values so data reloads only after explicit confirmation.
  const handleApplyCustomRange = () => {
    setCustomStart(pendingStart);
    setCustomEnd(pendingEnd);
  };

  // Add a legend block into an ApexCharts SVG so downloads keep series labels.
  const addLegendToSvg = (svgString, legendItems, fallbackSize = { width: 900, height: 500 }) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return null;

    const viewBox = svgEl.getAttribute('viewBox');
    let width = fallbackSize.width;
    let height = fallbackSize.height;

    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        width = parts[2];
        height = parts[3];
      }
    } else {
      const parsedWidth = parseFloat(svgEl.getAttribute('width'));
      const parsedHeight = parseFloat(svgEl.getAttribute('height'));
      width = !isNaN(parsedWidth) ? parsedWidth : fallbackSize.width;
      height = !isNaN(parsedHeight) ? parsedHeight : fallbackSize.height;
      svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    const legendPadding = 16;
    const rowHeight = 18;
    const legendHeight = legendItems.length * rowHeight + legendPadding * 2;
    const totalHeight = height + legendHeight;

    svgEl.setAttribute('height', totalHeight);
    svgEl.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);

    const legendGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    legendGroup.setAttribute('transform', `translate(${legendPadding}, ${height + legendPadding})`);

    legendItems.forEach((item, idx) => {
      const y = idx * rowHeight;
      const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', y.toString());
      rect.setAttribute('width', '14');
      rect.setAttribute('height', '14');
      rect.setAttribute('rx', '2');
      rect.setAttribute('fill', item.color || '#374151');

      const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '20');
      text.setAttribute('y', (y + 12).toString());
      text.setAttribute('font-size', '12');
      text.setAttribute('fill', '#111827');
      text.textContent = item.name;

      legendGroup.appendChild(rect);
      legendGroup.appendChild(text);
    });

    svgEl.appendChild(legendGroup);
    const serialized = new XMLSerializer().serializeToString(svgEl);
    return { svgString: serialized, width, height: totalHeight };
  };

  // Export the currently visible window to CSV with the requested sensor columns.
  const handleExportCsv = () => {
    const { start, end } = getTimeWindow();
    const filteredData = data
      .filter((d) => d.timestamp.getTime() >= start.getTime() && d.timestamp.getTime() <= end.getTime())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const header = 'timestamp,temperature_int,temperature_ext,humidity_int,humidity_ext';
    const rows = filteredData.map((d) => [
      d.timestamp.toISOString(),
      d.temperature_int ?? '',
      d.temperature_ext ?? '',
      d.humidity_int ?? '',
      d.humidity_ext ?? ''
    ].join(','));

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${building}_stats_${start.toISOString()}_${end.toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export the visible comparison chart as a PNG that embeds the legend
  const handleExportComparisonPng = async () => {
    try {
      const svgEl = document.querySelector(`#${COMPARE_CHART_ID} svg`);
      if (!svgEl) return;

      const serializer = new XMLSerializer();
      const baseSvg = serializer.serializeToString(svgEl);
      const legendAugmented = addLegendToSvg(baseSvg, compareSeries, {
        width: svgEl.clientWidth || 900,
        height: svgEl.clientHeight || 500
      });

      if (!legendAugmented?.svgString) return;

      const img = new Image();
      const svgBlob = new Blob([legendAugmented.svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = legendAugmented.width;
        canvas.height = legendAugmented.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `comparison_${compareBuildings.join('_')}.png`;
        link.click();

        URL.revokeObjectURL(url);
      };

      img.onerror = (e) => {
        console.error('PNG export failed', e);
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (err) {
      console.error('PNG export failed', err);
    }
  };

  // Export a vector-quality SVG of the comparison chart for lossless scaling
  const handleExportComparisonSvg = () => {
    const svgEl = document.querySelector(`#${COMPARE_CHART_ID} svg`);
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const baseSvg = serializer.serializeToString(svgEl);
    const legendAugmented = addLegendToSvg(baseSvg, compareSeries, {
      width: svgEl.clientWidth || 900,
      height: svgEl.clientHeight || 500
    });
    if (!legendAugmented?.svgString) return;
    const blob = new Blob([legendAugmented.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparison_${compareBuildings.join('_')}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Create a printable page with every cabin-pair comparison so users can "Save as PDF"
  const handleExportAllComparisonsPdf = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup bloque\u0301 - autorisez les fenêtres pour exporter le PDF.');
      return;
    }

    const buildingPairs = [];
    for (let i = 0; i < allBuildings.length; i += 1) {
      for (let j = i + 1; j < allBuildings.length; j += 1) {
        buildingPairs.push([allBuildings[i], allBuildings[j]]);
      }
    }

    const snapshots = [];
    try {
      for (const pair of buildingPairs) {
        const pairSeries = buildComparisonSeriesForPair(pair);
        if (!pairSeries.length) continue;

        const tempContainer = document.createElement('div');
        tempContainer.style.width = '900px';
        tempContainer.style.height = '600px';
        tempContainer.style.position = 'fixed';
        tempContainer.style.left = '-9999px';
        document.body.appendChild(tempContainer);

        const chart = new ApexCharts(tempContainer, {
          chart: {
            id: `export-${pair.join('-')}-${Date.now()}`,
            type: 'line',
            animations: { enabled: false },
            toolbar: { show: false },
          },
          stroke: { width: 2 },
          tooltip: { enabled: false },
          legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'left',
            fontSize: '12px',
            labels: { colors: '#111827' }
          },
          xaxis: {
            type: 'datetime',
            labels: { formatter: xAxisLabelFormatter },
            min: timeWindow.start.getTime(),
            max: timeWindow.end.getTime(),
            tooltip: { enabled: false }
          },
          yaxis: { labels: { style: { fontSize: '11px' } } },
          series: pairSeries,
        });

        await chart.render();

        // Prefer a true SVG snapshot with legend; fall back to PNG if SVG is unavailable.
        const svgEl = tempContainer.querySelector('svg');
        if (svgEl) {
          const serialized = new XMLSerializer().serializeToString(svgEl);
          const legendSvg = addLegendToSvg(serialized, pairSeries, { width: 900, height: 600 });
          if (legendSvg?.svgString) {
            const encodedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(legendSvg.svgString)}`;
            snapshots.push({ label: `${pair[0]} vs ${pair[1]}`, uri: encodedSvg, rawSvg: legendSvg.svgString });
          }
        } else {
          const dataUri = await chart.dataURI();
          if (dataUri?.imgURI) {
            snapshots.push({ label: `${pair[0]} vs ${pair[1]}`, uri: dataUri.imgURI, rawSvg: `<img src="${dataUri.imgURI}" alt="${pair[0]} vs ${pair[1]}" />` });
          }
        }

        chart.destroy();
        tempContainer.remove();
      }
    } catch (err) {
      console.error('[exportComparisonPdf] Failed to build comparison charts:', err);
    }

    const hottestBlock = hottestDayStats
      ? `<section><h2>${t('hottestDayTitle')} - ${hottestDayStats.dayKey}</h2>${Object.entries(hottestDayStats.perBuilding)
          .map(([name, stats]) => {
            if (!stats || !stats.metrics || stats.count === 0) return `<p>${name}: ${t('noDataHottest')}</p>`;
            const formatMetric = (key, label) => {
              const metric = stats.metrics[key];
              if (!metric) return '';
              return `<div><strong>${label}</strong>: ${t('max')} ${metric.max.toFixed(1)}, ${t('min')} ${metric.min.toFixed(1)}, ${t('avg')} ${metric.avg.toFixed(1)}</div>`;
            };
            return `<div style="margin-bottom:8px;">
              <h3>${t('statsForBuilding')} ${name}</h3>
              ${formatMetric('temperature_ext', translations[language].temperatureExtLabel)}
              ${formatMetric('temperature_int', translations[language].temperatureIntLabel)}
              ${formatMetric('humidity_ext', translations[language].humidityExtLabel)}
              ${formatMetric('humidity_int', translations[language].humidityIntLabel)}
            </div>`;
          }).join('')}</section>`
      : `<p>${t('noDataHottest')}</p>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>${t('exportComparisonPdf')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h2 { margin-top: 24px; }
            img, svg { max-width: 100%; height: auto; margin: 12px 0; border: 1px solid #e5e7eb; }
            .chart-block { background: #f9fafb; padding: 8px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <h1>${t('comparison')}</h1>
          ${hottestBlock}
          ${snapshots.length
            ? snapshots.map(s => `<div class="chart-block"><h2>${s.label}</h2>${s.rawSvg}</div>`).join('')
            : `<p>${t('noDataHottest')}</p>`}
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  // Handle parameter visibility toggle for main chart
  const handleToggleVisibleKey = (key) => {
    setVisibleKeys(prevKeys =>
      prevKeys.includes(key)
        ? prevKeys.filter(k => k !== key)
        : [...prevKeys, key]
    );
  };

  // Handle parameter visibility toggle for comparison chart
  const handleToggleVisibleCompareKey = (key) => {
    setVisibleCompareKeys(prevKeys =>
      prevKeys.includes(key)
        ? prevKeys.filter(k => k !== key)
        : [...prevKeys, key]
    );
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-4"> 
        <h1 className="text-3xl font-bold">{t('event')}</h1>  
      </div>
      <div className="flex justify-between items-center mb-4">            
        <h1 className="text-2xl font-bold">{t('appTitle')}</h1>
        {/* Language selection buttons are now handled by the RootApp,
            but we need a way to change language from here.
            We'll pass setLanguage down from RootApp or use a different context setup.
            For now, let's assume setLanguage is available from context. */}
        <LanguageContext.Consumer>
          {({ setLanguage: contextSetLanguage }) => (
            <div className="flex space-x-2">
              <button
                onClick={() => contextSetLanguage('fr')}
                className={`px-3 py-1 rounded ${language === 'fr' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                FR
              </button>
              <button
                onClick={() => contextSetLanguage('en')}
                className={`px-3 py-1 rounded ${language === 'en' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                EN
              </button>
            </div>
          )}
        </LanguageContext.Consumer>
      </div>

      {/* Latest Conditions for Both HabiTEK Cabins */}
      <div className="bg-white p-4 rounded-2xl shadow mb-6">
        <h2 className="text-xl font-semibold mb-4 text-center text-gray-800">{t('currentConditions')}</h2>
        {loadingLatestStats ? (
          <p className="text-center text-gray-600">{t('loadingStats')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {allBuildings.map((b) => {
              const stats = latestStats[b] || {};
              return (
                <div key={b} className="bg-gray-50 p-4 rounded-lg flex flex-col items-center text-center border border-gray-100">
                  <h3 className="text-lg font-medium mb-2 text-blue-600">{b}</h3>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 w-full text-gray-800">
                    <div className="flex flex-col items-center">
                      <span className="text-md font-medium">🌡️ {stats.temperature_int || 'ND'}°C</span>
                      <span className="text-xs text-gray-500">{t('tempInt')}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-md font-medium">💧 {stats.humidity_int || 'ND'}%</span>
                      <span className="text-xs text-gray-500">{t('humInt')}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-md font-medium">🌡️ {stats.temperature_ext || 'ND'}°C</span>
                      <span className="text-xs text-gray-500">{t('tempExt')}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-md font-medium">💧 {stats.humidity_ext || 'ND'}%</span>
                      <span className="text-xs text-gray-500">{t('humExt')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    {t('lastUpdate')}: {stats.timestamp || 'N/A'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Camera snapshot section */}
      <div className="bg-white p-4 rounded-2xl shadow mb-6">
        <h2 className="text-xl font-semibold mb-4 text-center text-gray-800">{t('cameraSnapshot')}</h2>
        <div className="flex justify-center">
          {snapshotUrl ? (
            <img src={snapshotUrl} alt="Camera snapshot" className="max-w-full rounded" />
          ) : (
            <div className="flex items-center justify-center w-full h-48 bg-gray-200 rounded text-gray-500">
              {t('noImageAvailable')}
            </div>
          )}
        </div>
      </div>

      {/* Moved: Building selector between camera and main chart */}
      <div className="bg-white p-4 rounded-2xl shadow mb-6">
        <p className="text-center text-sm text-gray-600 mb-2 px-4">
          {t('selectBuilding')}
        </p>
        <div className="flex justify-center gap-4 flex-wrap">
          {allBuildings.map((b) => (
            <button
              key={b}
              className={`px-4 py-2 rounded-xl border ${
                b === building ? "bg-blue-500 text-white" : "bg-white"
              }`}
              onClick={() => setBuilding(b)}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-center text-red-600 font-semibold mb-4">
          {t('dataNotAvailable')}
        </div>
      )}

      {/* Main Chart container */}
      <div
        className={`bg-white rounded-2xl px-4 pt-4 pb-12 shadow mb-10 ${
          isChartFullscreen ? 'fixed inset-0 z-[9997] h-screen w-screen bg-white flex flex-col' : ''
        }`}
        id="fullscreenChart"
      >
        {/* Chart Header with Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-2 border-b pb-2">
          <h2 className="text-lg font-semibold mb-2 sm:mb-0">
            {t('buildingStats')} {building}
          </h2>
          <div className="flex flex-col lg:flex-row items-center gap-3 flex-wrap justify-center w-full lg:w-auto">
            <div className="flex items-center gap-2">
              {/* Range selection */}
              <select
                className="border rounded px-2 py-1 text-sm"
                value={rangeHours}
                onChange={(e) => handlePresetChange(Number(e.target.value))}
              >
                {[
                  { label: `6 ${t('hours')}`, value: 6 },
                  { label: `12 ${t('hours')}`, value: 12 },
                  { label: `1 ${t('day')}`, value: 24 },
                  { label: `1 ${t('week')}`, value: 24 * 7 },
                  { label: `2 ${t('week')}`, value: 24 * 14 },
                  { label: `1 ${t('month')}`, value: 24 * 31 }
                ].map(({ label, value }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {/* Fullscreen button */}
              <button
                onClick={() => handleFullscreen("fullscreenChart")}
                title={isChartFullscreen ? t('exitFullscreen') : t('fullscreen')}
                className="p-1 border rounded text-sm hover:bg-gray-100"
              >
                {isChartFullscreen ? '⤡' : '⛶'}
              </button>
            </div>
            <div className="flex flex-col gap-1 text-xs text-gray-700">
              <span className="font-semibold text-sm text-gray-800">{t('customRange')}</span>
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1">
                  <span>{t('startDate')}</span>
                  <input
                    type="datetime-local"
                    value={pendingStart}
                    onChange={(e) => setPendingStart(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>{t('endDate')}</span>
                  <input
                    type="datetime-local"
                    value={pendingEnd}
                    onChange={(e) => setPendingEnd(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={handleApplyCustomRange}
                  className="px-3 py-1 border rounded bg-blue-600 text-white text-xs hover:bg-blue-700 transition"
                >
                  {t('applyRange')}
                </button>
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1 border rounded bg-green-600 text-white text-xs hover:bg-green-700 transition"
                >
                  {t('exportCsv')}
                </button>
              </div>
              <span className="text-[11px] text-gray-500">{t('range')} {timeWindow.hours} {t('hours')}</span>
            </div>
          </div>
        </div>

        {/* Parameter visibility toggles for main chart */}
        <div className="flex flex-wrap justify-center gap-4 py-2 border-b mb-4">
          {AVAILABLE_KEYS.map((k) => (
            <label key={k.key} className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="form-checkbox h-4 w-4 text-blue-600 rounded"
                checked={visibleKeys.includes(k.key)}
                onChange={() => handleToggleVisibleKey(k.key)}
              />
              <span className="ml-2 text-sm text-gray-700" style={{ color: k.color }}>{language === 'fr' ? k.label : k.labelEn}</span>
            </label>
          ))}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-2 sm:p-4 shadow-sm">
          <Chart
            options={{
              chart: {
                id: CHART_ID,
                type: "line",
                zoom: { enabled: true },
                toolbar: {
                  show: true,
                  tools: { download: true },
                  autoSelected: 'zoom'
                },
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
              },
              stroke: { width: isMobile ? 2.6 : 2 },
              tooltip: { x: { format: "dd MMM HH:mm" } },
              legend: {
                position: "top",
                horizontalAlign: "left",
                fontSize: isMobile ? '12px' : '13px',
                itemMargin: { horizontal: 8, vertical: 6 },
                labels: {
                  colors: '#1f2937',
                  useSeriesColors: false
                }
              },
              grid: { padding: { left: 6, right: 6, bottom: isMobile ? 12 : 18 } },
              yaxis: {
                title: {
                  text: t('measuredValue'),
                  style: { fontSize: '12px' }
                },
                labels: { style: { fontSize: isMobile ? '11px' : '12px' } }
              },
              xaxis: {
                type: "datetime",
                title: {
                  text: t('time'),
                  style: { fontSize: '12px' }
                },
                min: timeWindow.start.getTime(),
                max: timeWindow.end.getTime(),
                labels: {
                  rotate: isMobile ? -25 : -45,
                  fontSize: isMobile ? '10px' : '11px',
                  maxHeight: 80,
                  formatter: xAxisLabelFormatter,
                  datetimeUTC: false,
                  offsetY: 0,
                  trim: true
                },
                axisBorder: { show: true },
                axisTicks: { show: true },
                tooltip: { enabled: false },
                offsetY: 0
              },
              responsive: [
                {
                  breakpoint: 640,
                  options: {
                    chart: {
                      height: mainChartHeight,
                      toolbar: { show: true },
                      zoom: { enabled: false },
                      pan: { enabled: false }
                    },
                    legend: { position: "top", horizontalAlign: "left", fontSize: '11px' },
                    xaxis: {
                      labels: {
                        rotate: -20,
                        fontSize: '10px',
                        maxHeight: 70,
                        offsetY: 0
                      }
                    }
                  }
                }
              ]
            }}
            series={series}
            type="line"
            height={mainChartHeight}
          />
        </div>
      </div>

      {/* Comparison chart for two cabins */}
      <div className="bg-white rounded-2xl px-4 pt-4 pb-12 shadow mb-10">
        <h2 className="text-lg font-semibold mb-4 text-center">{t('comparison')}</h2>
        <div className="mb-4 border-b pb-2">
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <div className="flex flex-col items-start">
              <label className="text-xs text-gray-700 mb-1" htmlFor="bat1">{t('building1')}</label>
              <select
                id="bat1"
                className="border rounded px-2 py-1"
                value={compareBuildings[0]}
                onChange={(e) => setCompareBuildings([e.target.value, compareBuildings[1]])}
              >
                {allBuildings.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col items-start">
              <label className="text-xs text-gray-700 mb-1" htmlFor="bat2">{t('building2')}</label>
              <select
                id="bat2"
                className="border rounded px-2 py-1"
                value={compareBuildings[1]}
                onChange={(e) => setCompareBuildings([compareBuildings[0], e.target.value])}
              >
                {allBuildings.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Parameter visibility toggles for comparison chart */}
          <div className="flex flex-wrap justify-center gap-4 py-2 mt-2">
            {AVAILABLE_KEYS.map((k) => (
              <label key={k.key} className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  checked={visibleCompareKeys.includes(k.key)}
                  onChange={() => handleToggleVisibleCompareKey(k.key)}
                />
                <span className="ml-2 text-sm text-gray-700" style={{ color: k.color }}>{language === 'fr' ? k.label : k.labelEn}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs mt-2">
            {compareSeries.map((s) => (
              <div key={s.name} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: s.color }}></span>
                <span>{s.name}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button
              onClick={handleExportComparisonPng}
              className="px-3 py-1 border rounded bg-blue-600 text-white text-xs hover:bg-blue-700 transition"
            >
              {t('exportComparisonPng')}
            </button>
            <button
              onClick={handleExportComparisonSvg}
              className="px-3 py-1 border rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700 transition"
            >
              {t('exportComparisonSvg')}
            </button>
            <button
              onClick={handleExportAllComparisonsPdf}
              className="px-3 py-1 border rounded bg-purple-600 text-white text-xs hover:bg-purple-700 transition"
            >
              {t('exportComparisonPdf')}
            </button>
          </div>
          <div className="mt-4 bg-gray-50 rounded-xl p-3">
            <h3 className="font-semibold text-sm mb-2">{t('hottestDayTitle')}</h3>
            {hottestDayStats ? (
              <>
                <p className="text-xs text-gray-600 mb-2">{hottestDayStats.dayKey}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.entries(hottestDayStats.perBuilding).map(([name, stats]) => (
                    <div key={name} className="bg-white border rounded-lg p-2 shadow-sm">
                      <h4 className="text-sm font-semibold mb-1">{t('statsForBuilding')} {name}</h4>
                      {stats && stats.metrics && stats.count ? (
                        <ul className="text-xs text-gray-700 space-y-1">
                          {stats.metrics.temperature_ext && (
                            <li><strong>{translations[language].temperatureExtLabel}:</strong> {t('max')} {stats.metrics.temperature_ext.max.toFixed(1)}, {t('min')} {stats.metrics.temperature_ext.min.toFixed(1)}, {t('avg')} {stats.metrics.temperature_ext.avg.toFixed(1)}</li>
                          )}
                          {stats.metrics.temperature_int && (
                            <li><strong>{translations[language].temperatureIntLabel}:</strong> {t('max')} {stats.metrics.temperature_int.max.toFixed(1)}, {t('min')} {stats.metrics.temperature_int.min.toFixed(1)}, {t('avg')} {stats.metrics.temperature_int.avg.toFixed(1)}</li>
                          )}
                          {stats.metrics.humidity_ext && (
                            <li><strong>{translations[language].humidityExtLabel}:</strong> {t('max')} {stats.metrics.humidity_ext.max.toFixed(0)}%, {t('min')} {stats.metrics.humidity_ext.min.toFixed(0)}%, {t('avg')} {stats.metrics.humidity_ext.avg.toFixed(0)}%</li>
                          )}
                          {stats.metrics.humidity_int && (
                            <li><strong>{translations[language].humidityIntLabel}:</strong> {t('max')} {stats.metrics.humidity_int.max.toFixed(0)}%, {t('min')} {stats.metrics.humidity_int.min.toFixed(0)}%, {t('avg')} {stats.metrics.humidity_int.avg.toFixed(0)}%</li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">{t('noDataHottest')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-600">{t('noDataHottest')}</p>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <h3 className="font-semibold text-sm mb-2">{t('topHotDays')}</h3>
              {extremeDays.hottest.length ? (
                <ul className="space-y-2 text-xs text-gray-700">
                  {extremeDays.hottest.map((day) => (
                    <li key={`hot-${day.dayKey}`} className="bg-white border rounded-lg p-2 shadow-sm">
                      <div className="font-semibold text-gray-900">{day.dayKey} • {day.avg.toFixed(1)}°C</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        {Object.entries(day.perBuilding).map(([name, stats]) => (
                          <div key={name} className="bg-gray-50 rounded p-2">
                            <div className="font-semibold text-[11px]">{name}</div>
                            {stats.count ? (
                              <div className="text-[11px] text-gray-700 space-y-1">
                                {stats.metrics.temperature_ext && (
                                  <div><strong>{translations[language].temperatureExtLabel}:</strong> {t('max')} {stats.metrics.temperature_ext.max.toFixed(1)} / {t('min')} {stats.metrics.temperature_ext.min.toFixed(1)}</div>
                                )}
                                {stats.metrics.temperature_int && (
                                  <div><strong>{translations[language].temperatureIntLabel}:</strong> {t('max')} {stats.metrics.temperature_int.max.toFixed(1)} / {t('min')} {stats.metrics.temperature_int.min.toFixed(1)}</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-500">{t('noDataHottest')}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-600">{t('noDataHottest')}</p>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <h3 className="font-semibold text-sm mb-2">{t('topColdDays')}</h3>
              {extremeDays.coldest.length ? (
                <ul className="space-y-2 text-xs text-gray-700">
                  {extremeDays.coldest.map((day) => (
                    <li key={`cold-${day.dayKey}`} className="bg-white border rounded-lg p-2 shadow-sm">
                      <div className="font-semibold text-gray-900">{day.dayKey} • {day.avg.toFixed(1)}°C</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        {Object.entries(day.perBuilding).map(([name, stats]) => (
                          <div key={name} className="bg-gray-50 rounded p-2">
                            <div className="font-semibold text-[11px]">{name}</div>
                            {stats.count ? (
                              <div className="text-[11px] text-gray-700 space-y-1">
                                {stats.metrics.temperature_ext && (
                                  <div><strong>{translations[language].temperatureExtLabel}:</strong> {t('max')} {stats.metrics.temperature_ext.max.toFixed(1)} / {t('min')} {stats.metrics.temperature_ext.min.toFixed(1)}</div>
                                )}
                                {stats.metrics.temperature_int && (
                                  <div><strong>{translations[language].temperatureIntLabel}:</strong> {t('max')} {stats.metrics.temperature_int.max.toFixed(1)} / {t('min')} {stats.metrics.temperature_int.min.toFixed(1)}</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-500">{t('noDataHottest')}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-600">{t('noDataHottest')}</p>
              )}
            </div>
          </div>
        </div>
        <div id={COMPARE_CHART_ID} className="overflow-x-auto rounded-2xl border border-gray-100 p-2 sm:p-4 bg-white shadow-sm">
          <Chart
            options={{
              chart: {
                id: COMPARE_CHART_ID,
                type: 'line',
                zoom: { enabled: true },
                toolbar: { show: true, tools: { download: true }, autoSelected: 'zoom' },
                animations: { enabled: true },
                dropShadow: { enabled: false },
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
              },
              stroke: { width: isMobile ? 2.6 : 2 },
              tooltip: { x: { format: 'dd MMM HH:mm' } },
              legend: {
                show: true,
                position: isMobile ? 'bottom' : 'top',
                horizontalAlign: 'left',
                fontSize: isMobile ? '12px' : '13px',
                itemMargin: { horizontal: 8, vertical: 6 },
                markers: { width: 10, height: 10 },
                labels: { colors: '#1f2937', useSeriesColors: false }
              },
              xaxis: {
                type: 'datetime',
                labels: { rotate: isMobile ? -25 : -45, formatter: xAxisLabelFormatter, style: { fontSize: isMobile ? '10px' : '11px' } },
                min: timeWindow.start.getTime(),
                max: timeWindow.end.getTime(),
                tooltip: { enabled: false },
                tickAmount: isMobile ? 6 : undefined
              },
              grid: { padding: { left: 6, right: 6, bottom: isMobile ? 12 : 16 } },
              responsive: [
                {
                  breakpoint: 768,
                  options: {
                    chart: { height: comparisonChartHeight, toolbar: { show: true }, zoom: { enabled: false } },
                    legend: { fontSize: '11px', position: 'bottom' },
                    xaxis: { labels: { rotate: -25, style: { fontSize: '10px' } } },
                  },
                },
                {
                  breakpoint: 480,
                  options: {
                    chart: { height: comparisonChartHeight, toolbar: { show: true }, zoom: { enabled: false } },
                    legend: { fontSize: '11px', position: 'bottom' },
                    xaxis: { labels: { rotate: -20, style: { fontSize: '10px' } } },
                    stroke: { width: 2.4 },
                  },
                },
              ]
            }}
            series={compareSeries}
            type="line"
            height={comparisonChartHeight}
          />
        </div>
      </div>

      {/* Footer information */}
      <footer className="text-center text-sm text-gray-600 mt-10">
        <div className="mt-8 text-center mb-4">
          <button
            onClick={() => setUseFakeData((v) => !v)}
            className="px-4 py-2 border rounded-xl text-sm text-white bg-gray-800 hover:bg-gray-700"
          >
            {useFakeData ? t('disableDemoMode') : t('activateDemoMode')}
          </button>
        </div>
        {t('footerText')}
        <a href="https://iceboxmontreal.com/" className="underline">Ice Box Challenge Montréal 2026</a>
        .
        <div className="flex justify-center mt-2">
          <img
            src="https://images.ctfassets.net/58hwalxwfjo5/1MV1LpbleB9VZSfXjN6ehG/9f17735bf7ae7a79f466a5510fa539c2/Brand_image.png"
            alt="Telus logo"
            className="transform scale-100 md:scale-[1.0]"
          />
        </div>
      </footer>
    </div>
  );
}

// This is the root component that provides the LanguageContext
export default function App() {
  const [language, setLanguage] = useState('fr');

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <AppContent />
    </LanguageContext.Provider>
  );
}