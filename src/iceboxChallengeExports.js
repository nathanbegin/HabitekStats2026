import ApexCharts from 'apexcharts';

const WIDGET_ID = 'habitek-icebox-downloads';
const STYLE_ID = 'habitek-icebox-downloads-style';

const RANGE_START = '2026-09-03T04:00:00.000Z'; // Sept. 3, 00:00 EDT
const RANGE_END = '2026-10-01T03:59:59.999Z';   // Sept. 30, 23:59:59 EDT
const RANGE_MIN = new Date(RANGE_START).getTime();
const RANGE_MAX = new Date(RANGE_END).getTime();

const COLORS = {
  code: '#be1622',
  passive: '#f2b705',
  outside: '#ef7d22',
  ink: '#111827',
  muted: '#64748b',
  grid: '#e5e7eb',
};

const copy = {
  fr: {
    button: 'Télécharger les graphiques Icebox',
    helper: '3 graphiques · 3 au 30 septembre 2026',
    loading: 'Préparation des graphiques…',
    done: 'Graphiques téléchargés ✓',
    error: 'Impossible de générer les graphiques Icebox.',
    tempTitle: 'ICE-BOX Challenge Montréal 2026 — Températures intérieures',
    humidityTitle: 'ICE-BOX Challenge Montréal 2026 — Humidité intérieure',
    combinedTitle: 'ICE-BOX Challenge Montréal 2026 — Température et humidité',
    subtitle: 'Période officielle : 3 au 30 septembre 2026',
    codeTemp: 'Temp. intérieure — Cabane Code',
    passiveTemp: 'Temp. intérieure — PassiveHouse',
    outsideTemp: 'Temp. extérieure',
    codeHumidity: 'Humidité intérieure — Cabane Code',
    passiveHumidity: 'Humidité intérieure — PassiveHouse',
    outsideHumidity: 'Humidité extérieure',
    tempAxis: 'Température (°C)',
    humidityAxis: 'Humidité relative (%)',
    timeAxis: 'Date',
  },
  en: {
    button: 'Download Icebox charts',
    helper: '3 charts · September 3–30, 2026',
    loading: 'Preparing charts…',
    done: 'Charts downloaded ✓',
    error: 'Unable to generate the Icebox charts.',
    tempTitle: 'ICE-BOX Challenge Montréal 2026 — Indoor temperatures',
    humidityTitle: 'ICE-BOX Challenge Montréal 2026 — Indoor humidity',
    combinedTitle: 'ICE-BOX Challenge Montréal 2026 — Temperature and humidity',
    subtitle: 'Official period: September 3–30, 2026',
    codeTemp: 'Indoor temp. — Code cabin',
    passiveTemp: 'Indoor temp. — PassiveHouse',
    outsideTemp: 'Outdoor temperature',
    codeHumidity: 'Indoor humidity — Code cabin',
    passiveHumidity: 'Indoor humidity — PassiveHouse',
    outsideHumidity: 'Outdoor humidity',
    tempAxis: 'Temperature (°C)',
    humidityAxis: 'Relative humidity (%)',
    timeAxis: 'Date',
  },
};

function language() {
  const heading = Array.from(document.querySelectorAll('h2')).find((element) => {
    const value = element.textContent?.trim().toLowerCase();
    return value === 'comparaison' || value === 'comparison';
  });
  return heading?.textContent?.trim().toLowerCase() === 'comparison' ? 'en' : 'fr';
}

function comparisonSection() {
  const heading = Array.from(document.querySelectorAll('h2')).find((element) => {
    const value = element.textContent?.trim().toLowerCase();
    return value === 'comparaison' || value === 'comparison';
  });
  return heading?.parentElement || null;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${WIDGET_ID} {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.65rem;
      margin: 0.75rem 0 1rem;
      padding: 0.75rem;
      border: 1px solid rgba(190, 22, 34, 0.16);
      border-radius: 0.9rem;
      background: linear-gradient(100deg, rgba(190,22,34,0.055), rgba(242,183,5,0.055));
    }
    #${WIDGET_ID} button {
      border: 1px solid rgba(143, 16, 25, 0.35);
      border-radius: 0.75rem;
      padding: 0.55rem 0.9rem;
      color: #ffffff;
      background: linear-gradient(110deg, #8f1019, #be1622);
      font-size: 0.78rem;
      font-weight: 800;
      line-height: 1.2;
      cursor: pointer;
      box-shadow: 0 5px 14px rgba(143, 16, 25, 0.16);
      transition: transform 120ms ease, opacity 120ms ease;
    }
    #${WIDGET_ID} button:hover:not(:disabled) { transform: translateY(-1px); }
    #${WIDGET_ID} button:disabled { cursor: wait; opacity: 0.72; }
    #${WIDGET_ID} .habitek-icebox-helper {
      color: #6b7280;
      font-size: 0.7rem;
      font-weight: 650;
    }
  `;
  document.head.appendChild(style);
}

function ensureWidget() {
  const section = comparisonSection();
  if (!section) return null;

  let widget = document.getElementById(WIDGET_ID);
  if (widget && widget.parentElement === section) return widget;

  widget = document.createElement('div');
  widget.id = WIDGET_ID;

  const lang = language();
  widget.innerHTML = `
    <button type="button" data-role="download">${copy[lang].button}</button>
    <span class="habitek-icebox-helper">${copy[lang].helper}</span>
  `;

  const heading = Array.from(section.children).find((child) => child.tagName === 'H2');
  const rangeControls = section.querySelector('#habitek-comparison-range-controls');
  if (rangeControls) {
    rangeControls.insertAdjacentElement('afterend', widget);
  } else if (heading?.nextSibling) {
    section.insertBefore(widget, heading.nextSibling);
  } else {
    section.prepend(widget);
  }

  widget.querySelector('[data-role="download"]')?.addEventListener('click', downloadChallengeCharts);
  return widget;
}

function pointValue(row, key) {
  const value = Number(row?.data?.[key]);
  const timestamp = new Date(row?.timestamp).getTime();
  if (!Number.isFinite(value) || !Number.isFinite(timestamp)) return null;
  return [timestamp, value];
}

function downsample(points, maxPoints = 3500) {
  if (points.length <= maxPoints) return points;
  const sampled = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

function seriesFor(rows, deviceUuid, key) {
  return downsample(
    rows
      .filter((row) => row.device_uuid === deviceUuid && row.record_type === 'sensor')
      .map((row) => pointValue(row, key))
      .filter(Boolean)
      .sort((a, b) => a[0] - b[0])
  );
}

function findDevices(mappings) {
  const result = { code: null, passive: null, outside: null };
  Object.entries(mappings || {}).forEach(([uuid, mapping]) => {
    if (mapping?.type === 'outdoor') result.outside ||= uuid;
    if (mapping?.type !== 'indoor') return;
    if (mapping?.appliesTo?.includes('Code')) result.code ||= uuid;
    if (mapping?.appliesTo?.includes('PassiveHouse')) result.passive ||= uuid;
  });
  return result;
}

async function loadChallengeData() {
  const query = new URLSearchParams({
    start_timestamp: RANGE_START,
    end_timestamp: RANGE_END,
    limit: '50000',
  });

  const [mappingResponse, historyResponse] = await Promise.all([
    fetch('/api/device-mappings', { cache: 'no-store' }),
    fetch(`/api/history?${query.toString()}`, { cache: 'no-store' }),
  ]);

  if (!mappingResponse.ok) throw new Error(`Device mappings: HTTP ${mappingResponse.status}`);
  if (!historyResponse.ok) throw new Error(`History: HTTP ${historyResponse.status}`);

  const mappings = await mappingResponse.json();
  const rows = await historyResponse.json();
  const devices = findDevices(mappings);

  if (!devices.code || !devices.passive || !devices.outside) {
    throw new Error('Required Code, PassiveHouse or outdoor sensor assignment is missing.');
  }

  return {
    codeTemp: seriesFor(rows, devices.code, 'temperature'),
    passiveTemp: seriesFor(rows, devices.passive, 'temperature'),
    codeHumidity: seriesFor(rows, devices.code, 'humidity'),
    passiveHumidity: seriesFor(rows, devices.passive, 'humidity'),
    outsideTemp: seriesFor(rows, devices.outside, 'temperature'),
    outsideHumidity: seriesFor(rows, devices.outside, 'humidity'),
  };
}

function numericExtent(seriesList, fallback) {
  const values = seriesList.flatMap((series) => series.map((point) => point[1])).filter(Number.isFinite);
  if (!values.length) return fallback;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.08, fallback.padding || 1);
  return {
    min: Math.floor((min - padding) * 10) / 10,
    max: Math.ceil((max + padding) * 10) / 10,
  };
}

function baseOptions(title, subtitle, lang) {
  return {
    chart: {
      type: 'line',
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      background: '#ffffff',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    },
    title: {
      text: title,
      align: 'left',
      margin: 12,
      style: { fontSize: '20px', fontWeight: 800, color: COLORS.ink },
    },
    subtitle: {
      text: subtitle,
      align: 'left',
      margin: 18,
      style: { fontSize: '12px', fontWeight: 500, color: COLORS.muted },
    },
    xaxis: {
      type: 'datetime',
      min: RANGE_MIN,
      max: RANGE_MAX,
      title: { text: copy[lang].timeAxis },
      labels: {
        datetimeUTC: false,
        format: 'dd MMM',
        style: { fontSize: '11px' },
      },
      axisBorder: { color: COLORS.grid },
      axisTicks: { color: COLORS.grid },
    },
    grid: {
      borderColor: COLORS.grid,
      strokeDashArray: 3,
      padding: { left: 8, right: 18, bottom: 6 },
    },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'left',
      fontSize: '12px',
      itemMargin: { horizontal: 10, vertical: 5 },
    },
    tooltip: {
      shared: true,
      x: { format: 'dd MMM yyyy HH:mm' },
    },
    markers: { size: 0 },
    dataLabels: { enabled: false },
  };
}

function temperatureOptions(data, lang) {
  const t = copy[lang];
  const extent = numericExtent([data.codeTemp, data.passiveTemp], { min: 0, max: 35, padding: 1 });
  return {
    ...baseOptions(t.tempTitle, t.subtitle, lang),
    colors: [COLORS.code, COLORS.passive],
    stroke: { width: [2.5, 2.5], curve: 'straight' },
    yaxis: {
      min: extent.min,
      max: extent.max,
      decimalsInFloat: 1,
      title: { text: t.tempAxis },
      labels: { formatter: (value) => `${value.toFixed(1)}°` },
    },
  };
}

function humidityOptions(data, lang) {
  const t = copy[lang];
  const extent = numericExtent([data.codeHumidity, data.passiveHumidity], { min: 0, max: 100, padding: 3 });
  return {
    ...baseOptions(t.humidityTitle, t.subtitle, lang),
    colors: [COLORS.code, COLORS.passive],
    stroke: { width: [2.5, 2.5], curve: 'straight' },
    yaxis: {
      min: Math.max(0, extent.min),
      max: Math.min(100, extent.max),
      decimalsInFloat: 0,
      title: { text: t.humidityAxis },
      labels: { formatter: (value) => `${value.toFixed(0)} %` },
    },
  };
}

function combinedOptions(data, lang) {
  const t = copy[lang];
  const tempExtent = numericExtent(
    [data.codeTemp, data.passiveTemp, data.outsideTemp],
    { min: 0, max: 35, padding: 1 }
  );
  const humExtent = numericExtent(
    [data.codeHumidity, data.passiveHumidity, data.outsideHumidity],
    { min: 0, max: 100, padding: 3 }
  );

  const tempAxis = (show, seriesName) => ({
    seriesName,
    min: tempExtent.min,
    max: tempExtent.max,
    show,
    title: show ? { text: t.tempAxis } : undefined,
    labels: show ? { formatter: (value) => `${value.toFixed(1)}°` } : { show: false },
  });

  const humidityAxis = (show, seriesName) => ({
    seriesName,
    min: Math.max(0, humExtent.min),
    max: Math.min(100, humExtent.max),
    show,
    opposite: true,
    title: show ? { text: t.humidityAxis } : undefined,
    labels: show ? { formatter: (value) => `${value.toFixed(0)} %` } : { show: false },
  });

  return {
    ...baseOptions(t.combinedTitle, t.subtitle, lang),
    colors: [
      COLORS.code, COLORS.passive, COLORS.outside,
      COLORS.code, COLORS.passive, COLORS.outside,
    ],
    stroke: {
      width: [2.5, 2.5, 2.2, 2, 2, 1.9],
      curve: 'straight',
      dashArray: [0, 0, 0, 6, 6, 6],
    },
    yaxis: [
      tempAxis(true, t.codeTemp),
      tempAxis(false, t.passiveTemp),
      tempAxis(false, t.outsideTemp),
      humidityAxis(true, t.codeHumidity),
      humidityAxis(false, t.passiveHumidity),
      humidityAxis(false, t.outsideHumidity),
    ],
  };
}

function triggerDownload(dataUri, filename) {
  const anchor = document.createElement('a');
  anchor.href = dataUri;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function renderAndDownload({ options, series, filename, height = 680 }) {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-20000px';
  host.style.top = '0';
  host.style.width = '1400px';
  host.style.height = `${height}px`;
  host.style.background = '#ffffff';
  document.body.appendChild(host);

  const chart = new ApexCharts(host, {
    ...options,
    chart: {
      ...options.chart,
      width: 1400,
      height,
    },
    series,
  });

  try {
    await chart.render();
    const result = await chart.dataURI({ scale: 2 });
    if (!result?.imgURI) throw new Error('ApexCharts did not return a PNG image.');
    triggerDownload(result.imgURI, filename);
  } finally {
    await chart.destroy();
    host.remove();
  }
}

async function downloadChallengeCharts() {
  const widget = ensureWidget();
  const button = widget?.querySelector('[data-role="download"]');
  const lang = language();
  const t = copy[lang];

  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = t.loading;

  try {
    const data = await loadChallengeData();

    const temperatureSeries = [
      { name: t.codeTemp, data: data.codeTemp },
      { name: t.passiveTemp, data: data.passiveTemp },
    ];
    const humiditySeries = [
      { name: t.codeHumidity, data: data.codeHumidity },
      { name: t.passiveHumidity, data: data.passiveHumidity },
    ];
    const combinedSeries = [
      { name: t.codeTemp, data: data.codeTemp },
      { name: t.passiveTemp, data: data.passiveTemp },
      { name: t.outsideTemp, data: data.outsideTemp },
      { name: t.codeHumidity, data: data.codeHumidity },
      { name: t.passiveHumidity, data: data.passiveHumidity },
      { name: t.outsideHumidity, data: data.outsideHumidity },
    ];

    await renderAndDownload({
      options: temperatureOptions(data, lang),
      series: temperatureSeries,
      filename: 'ICEBOX-2026_temperatures-interieures_03-30-septembre.png',
    });

    await new Promise((resolve) => setTimeout(resolve, 180));

    await renderAndDownload({
      options: humidityOptions(data, lang),
      series: humiditySeries,
      filename: 'ICEBOX-2026_humidite-interieure_03-30-septembre.png',
    });

    await new Promise((resolve) => setTimeout(resolve, 180));

    await renderAndDownload({
      options: combinedOptions(data, lang),
      series: combinedSeries,
      filename: 'ICEBOX-2026_temperature-humidite-interieur-exterieur_03-30-septembre.png',
      height: 760,
    });

    button.textContent = t.done;
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = copy[language()].button;
    }, 2200);
  } catch (error) {
    console.error('[HabiTEK] Icebox chart export failed', error);
    window.alert(t.error);
    button.textContent = t.button;
  } finally {
    button.disabled = false;
  }
}

function refreshWidgetLanguage() {
  const widget = ensureWidget();
  if (!widget) return;
  const lang = language();
  const button = widget.querySelector('[data-role="download"]');
  const helper = widget.querySelector('.habitek-icebox-helper');
  if (button && !button.disabled) button.textContent = copy[lang].button;
  if (helper) helper.textContent = copy[lang].helper;
}

function install() {
  if (window.location.pathname.startsWith('/admin')) return;
  installStyles();

  const start = () => {
    refreshWidgetLanguage();
    window.setInterval(refreshWidgetLanguage, 1500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

install();
