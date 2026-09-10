// Compare the HabiTEK outdoor sensor with the nearby ECCC McTavish station.
// Data is proxied through the existing /api/latest route so this does not add a
// Vercel Serverless Function.

const BLOCK_ID = 'habitek-eccc-comparison';
const STYLE_ID = 'habitek-eccc-comparison-style';
const REFRESH_MS = 5 * 60 * 1000;
const STALE_MS = 90 * 60 * 1000;

let externalWeather = null;
let lastFetchAt = 0;
let fetchPromise = null;

const copy = {
  fr: {
    title: 'Référence externe',
    source: 'ECCC · McTavish',
    temperature: 'Température',
    humidity: 'Humidité',
    sensor: 'Capteur HabiTEK',
    reference: 'McTavish',
    difference: 'Écart',
    updated: 'Observation ECCC',
    stale: 'Donnée externe ancienne',
    unavailable: 'Référence ECCC temporairement indisponible',
  },
  en: {
    title: 'External reference',
    source: 'ECCC · McTavish',
    temperature: 'Temperature',
    humidity: 'Humidity',
    sensor: 'HabiTEK sensor',
    reference: 'McTavish',
    difference: 'Difference',
    updated: 'ECCC observation',
    stale: 'External data is old',
    unavailable: 'ECCC reference temporarily unavailable',
  },
};

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BLOCK_ID} {
      margin-top: 0.8rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(255,255,255,0.10);
    }

    #${BLOCK_ID} .habitek-eccc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
      margin-bottom: 0.55rem;
    }

    #${BLOCK_ID} .habitek-eccc-title {
      color: #f4f7fb;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.045em;
      text-transform: uppercase;
    }

    #${BLOCK_ID} .habitek-eccc-source {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.18rem 0.42rem;
      border: 1px solid rgba(239,125,34,0.38);
      border-radius: 999px;
      color: #ffe3cc;
      background: rgba(239,125,34,0.10);
      font-size: 0.6rem;
      font-weight: 750;
      text-decoration: none;
      white-space: nowrap;
    }

    #${BLOCK_ID} .habitek-eccc-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    #${BLOCK_ID} .habitek-eccc-metric {
      min-width: 0;
      padding: 0.52rem 0.58rem;
      border: 1px solid rgba(255,255,255,0.075);
      border-radius: 0.68rem;
      background: rgba(15,23,42,0.24);
    }

    #${BLOCK_ID} .habitek-eccc-metric-label {
      margin-bottom: 0.3rem;
      color: #aeb9c8;
      font-size: 0.61rem;
      font-weight: 700;
    }

    #${BLOCK_ID} .habitek-eccc-values {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      gap: 0.35rem;
    }

    #${BLOCK_ID} .habitek-eccc-reference-value {
      color: #ffffff;
      font-size: 0.98rem;
      line-height: 1.05;
      font-weight: 850;
    }

    #${BLOCK_ID} .habitek-eccc-delta {
      color: #f7c24b;
      font-size: 0.65rem;
      line-height: 1.1;
      font-weight: 800;
      white-space: nowrap;
    }

    #${BLOCK_ID} .habitek-eccc-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.48rem;
      color: #8f9bad;
      font-size: 0.57rem;
      line-height: 1.25;
    }

    #${BLOCK_ID} .habitek-eccc-stale {
      color: #f7c24b;
      font-weight: 800;
    }

    #${BLOCK_ID} .habitek-eccc-unavailable {
      padding: 0.5rem 0.58rem;
      border-radius: 0.65rem;
      color: #aeb9c8;
      background: rgba(15,23,42,0.22);
      font-size: 0.64rem;
    }

    @media (max-width: 640px) {
      #${BLOCK_ID} .habitek-eccc-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function language() {
  const heading = Array.from(document.querySelectorAll('h2')).find((element) => {
    const value = element.textContent?.trim().toLowerCase();
    return value === 'conditions actuelles' || value === 'current conditions';
  });
  return heading?.textContent?.trim().toLowerCase() === 'current conditions' ? 'en' : 'fr';
}

function parseNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function outdoorValues(card) {
  const values = card?.querySelectorAll('.habitek-outdoor-value-v2');
  return {
    temperature: parseNumber(values?.[0]?.textContent),
    humidity: parseNumber(values?.[1]?.textContent),
  };
}

function signed(value, decimals, suffix) {
  if (!Number.isFinite(value)) return '—';
  const rounded = value.toFixed(decimals);
  return `${value > 0 ? '+' : ''}${rounded}${suffix}`;
}

function formatObservationTime(value, lang) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function render() {
  const card = document.getElementById('habitek-current-outdoor-card');
  if (!card) return;

  installStyles();
  const lang = language();
  const t = copy[lang];
  const local = outdoorValues(card);

  let block = document.getElementById(BLOCK_ID);
  if (!block) {
    block = document.createElement('div');
    block.id = BLOCK_ID;
    card.appendChild(block);
  } else if (block.parentElement !== card) {
    card.appendChild(block);
  }

  if (!externalWeather) {
    block.innerHTML = `<div class="habitek-eccc-unavailable">${t.unavailable}</div>`;
    return;
  }

  const referenceTemp = parseNumber(externalWeather.temperature);
  const referenceHumidity = parseNumber(externalWeather.humidity);
  const tempDelta = Number.isFinite(local.temperature) && Number.isFinite(referenceTemp)
    ? local.temperature - referenceTemp
    : null;
  const humidityDelta = Number.isFinite(local.humidity) && Number.isFinite(referenceHumidity)
    ? local.humidity - referenceHumidity
    : null;

  const observedDate = externalWeather.observed_at ? new Date(externalWeather.observed_at) : null;
  const stale = observedDate && !Number.isNaN(observedDate.getTime())
    ? Date.now() - observedDate.getTime() > STALE_MS
    : false;
  const observedLabel = formatObservationTime(externalWeather.observed_at, lang);
  const stationLink = lang === 'fr'
    ? 'https://weather.gc.ca/past_conditions/index_f.html?station=wta'
    : 'https://weather.gc.ca/past_conditions/index_e.html?station=wta';

  block.innerHTML = `
    <div class="habitek-eccc-header">
      <div class="habitek-eccc-title">${t.title}</div>
      <a class="habitek-eccc-source" href="${stationLink}" target="_blank" rel="noopener noreferrer">
        ${t.source}
      </a>
    </div>
    <div class="habitek-eccc-grid">
      <div class="habitek-eccc-metric">
        <div class="habitek-eccc-metric-label">🌡 ${t.temperature} · ${t.reference}</div>
        <div class="habitek-eccc-values">
          <span class="habitek-eccc-reference-value">${Number.isFinite(referenceTemp) ? `${referenceTemp.toFixed(1)} °C` : '—'}</span>
          <span class="habitek-eccc-delta">Δ ${t.sensor} ${signed(tempDelta, 1, ' °C')}</span>
        </div>
      </div>
      <div class="habitek-eccc-metric">
        <div class="habitek-eccc-metric-label">💧 ${t.humidity} · ${t.reference}</div>
        <div class="habitek-eccc-values">
          <span class="habitek-eccc-reference-value">${Number.isFinite(referenceHumidity) ? `${referenceHumidity.toFixed(0)} %` : '—'}</span>
          <span class="habitek-eccc-delta">Δ ${t.sensor} ${signed(humidityDelta, 0, ' %')}</span>
        </div>
      </div>
    </div>
    <div class="habitek-eccc-meta">
      <span>${observedLabel ? `${t.updated} : ${observedLabel}` : t.updated}</span>
      ${stale ? `<span class="habitek-eccc-stale">⚠ ${t.stale}</span>` : ''}
    </div>
  `;
}

async function refreshExternalWeather(force = false) {
  if (fetchPromise) return fetchPromise;
  if (!force && externalWeather && Date.now() - lastFetchAt < REFRESH_MS) {
    render();
    return externalWeather;
  }

  fetchPromise = fetch('/api/latest', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      externalWeather = payload?.external_weather || null;
      lastFetchAt = Date.now();
      render();
      return externalWeather;
    })
    .catch((error) => {
      console.warn('[HabiTEK] external weather comparison unavailable', error);
      render();
      return null;
    })
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}

function install() {
  if (window.location.pathname.startsWith('/admin')) return;
  installStyles();

  const observer = new MutationObserver(() => {
    window.clearTimeout(observer._timer);
    observer._timer = window.setTimeout(render, 70);
  });

  const start = () => {
    refreshExternalWeather(true);
    observer.observe(document.getElementById('root') || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.setInterval(() => refreshExternalWeather(true), REFRESH_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

install();
