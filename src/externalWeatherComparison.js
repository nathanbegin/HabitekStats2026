// Compare the HabiTEK outdoor sensor with the nearby ECCC McTavish station.
// The comparison is rendered directly inside the outdoor card and is restored
// automatically if another enhancement layer rebuilds that card.

const BLOCK_ID = 'habitek-eccc-comparison';
const STYLE_ID = 'habitek-eccc-comparison-style';
const REFRESH_MS = 5 * 60 * 1000;
const RENDER_MS = 1200;
const STALE_MS = 90 * 60 * 1000;

let externalWeather = null;
let weatherState = 'loading';
let fetchPromise = null;

const copy = {
  fr: {
    title: 'Comparatif météo externe',
    source: 'ECCC · McTavish',
    temperature: 'Température',
    humidity: 'Humidité',
    sensor: 'HabiTEK',
    reference: 'McTavish',
    updated: 'Observation ECCC',
    stale: 'Donnée externe ancienne',
    loading: 'Chargement de la référence ECCC…',
    unavailable: 'Référence ECCC temporairement indisponible',
    infoLabel: 'Pourquoi les données sont-elles différentes ?',
    infoTitle: 'Pourquoi y a-t-il une différence entre les données externes et les données récoltées par les capteurs sur le site ?',
    infoBody: "L’explication se résume principalement à l’emplacement du capteur extérieur. Il se trouve dans un endroit où les conditions de température peuvent être différentes, notamment parce qu’il est plus près des rejets d’eau provenant de la fonte de la glace. C’est pourquoi nous avons remarqué une augmentation de l’humidité mesurée par le capteur extérieur en comparaison avec les données météo d’Environnement et Changement climatique Canada.",
  },
  en: {
    title: 'External weather comparison',
    source: 'ECCC · McTavish',
    temperature: 'Temperature',
    humidity: 'Humidity',
    sensor: 'HabiTEK',
    reference: 'McTavish',
    updated: 'ECCC observation',
    stale: 'External data is old',
    loading: 'Loading ECCC reference…',
    unavailable: 'ECCC reference temporarily unavailable',
    infoLabel: 'Why are the measurements different?',
    infoTitle: 'Why is there a difference between the external reference and the sensors on site?',
    infoBody: 'The difference is mainly explained by the location of the outdoor sensor. It is installed in an area where local temperature conditions can differ, particularly because it is closer to water discharge from melting ice. This is why we have observed higher humidity at the outdoor sensor compared with the weather data published by Environment and Climate Change Canada.',
  },
};

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BLOCK_ID} {
      margin-top: 0.85rem;
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

    #${BLOCK_ID} .habitek-eccc-title-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0.38rem;
      min-width: 0;
    }

    #${BLOCK_ID} .habitek-eccc-title {
      color: #f4f7fb;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.045em;
      text-transform: uppercase;
    }

    #${BLOCK_ID} .habitek-eccc-info {
      position: relative;
      flex: 0 0 auto;
    }

    #${BLOCK_ID} .habitek-eccc-info-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.05rem;
      height: 1.05rem;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.42);
      border-radius: 999px;
      color: #f4f7fb;
      background: rgba(255,255,255,0.06);
      font: 800 0.67rem/1 Arial, sans-serif;
      cursor: help;
      appearance: none;
    }

    #${BLOCK_ID} .habitek-eccc-info-button:hover,
    #${BLOCK_ID} .habitek-eccc-info-button:focus-visible {
      border-color: #f7c24b;
      color: #f7c24b;
      outline: none;
      background: rgba(247,194,75,0.08);
    }

    #${BLOCK_ID} .habitek-eccc-info-popover {
      position: absolute;
      z-index: 30;
      left: 0;
      top: calc(100% + 0.48rem);
      width: min(23rem, calc(100vw - 3rem));
      padding: 0.72rem 0.78rem;
      border: 1px solid rgba(247,194,75,0.28);
      border-radius: 0.7rem;
      color: #dce5f0;
      background: #151d2a;
      box-shadow: 0 12px 30px rgba(0,0,0,0.34);
      font-size: 0.66rem;
      line-height: 1.45;
      text-transform: none;
      letter-spacing: normal;
      font-weight: 400;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-4px);
      transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
      pointer-events: none;
    }

    #${BLOCK_ID} .habitek-eccc-info-popover strong {
      display: block;
      margin-bottom: 0.38rem;
      color: #ffffff;
      font-size: 0.68rem;
      line-height: 1.35;
      font-weight: 800;
    }

    #${BLOCK_ID} .habitek-eccc-info:hover .habitek-eccc-info-popover,
    #${BLOCK_ID} .habitek-eccc-info:focus-within .habitek-eccc-info-popover {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      pointer-events: auto;
    }

    #${BLOCK_ID} .habitek-eccc-source {
      display: inline-flex;
      align-items: center;
      padding: 0.18rem 0.42rem;
      border: 1px solid rgba(239,125,34,0.38);
      border-radius: 999px;
      color: #ffe3cc;
      background: rgba(239,125,34,0.10);
      font-size: 0.59rem;
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
      padding: 0.55rem 0.58rem;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 0.68rem;
      background: rgba(15,23,42,0.27);
    }

    #${BLOCK_ID} .habitek-eccc-metric-label {
      margin-bottom: 0.28rem;
      color: #aeb9c8;
      font-size: 0.6rem;
      font-weight: 700;
    }

    #${BLOCK_ID} .habitek-eccc-values {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.4rem;
      min-width: 0;
    }

    #${BLOCK_ID} .habitek-eccc-reference-value {
      color: #ffffff;
      font-size: 1.05rem;
      line-height: 1.05;
      font-weight: 850;
      white-space: nowrap;
    }

    #${BLOCK_ID} .habitek-eccc-delta {
      color: #f7c24b;
      font-size: 0.61rem;
      line-height: 1.1;
      font-weight: 800;
      text-align: right;
      white-space: nowrap;
    }

    #${BLOCK_ID} .habitek-eccc-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.48rem;
      color: #8f9bad;
      font-size: 0.56rem;
      line-height: 1.25;
    }

    #${BLOCK_ID} .habitek-eccc-stale {
      color: #f7c24b;
      font-weight: 800;
    }

    #${BLOCK_ID} .habitek-eccc-state {
      padding: 0.52rem 0.58rem;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 0.65rem;
      color: #aeb9c8;
      background: rgba(15,23,42,0.24);
      font-size: 0.63rem;
      line-height: 1.3;
    }

    @media (max-width: 640px) {
      #${BLOCK_ID} .habitek-eccc-grid {
        grid-template-columns: 1fr;
      }

      #${BLOCK_ID} .habitek-eccc-info-popover {
        left: -0.25rem;
        width: min(20rem, calc(100vw - 2.5rem));
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

function findOutdoorCard() {
  return document.getElementById('habitek-current-outdoor-card') ||
    document.querySelector(".habitek-current-card[data-cabin='outdoor']");
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

function ensureBlock(card) {
  let block = document.getElementById(BLOCK_ID);
  if (!block) {
    block = document.createElement('div');
    block.id = BLOCK_ID;
    card.appendChild(block);
  } else if (block.parentElement !== card) {
    card.appendChild(block);
  }
  return block;
}

function infoMarkup(t) {
  return `
    <span class="habitek-eccc-info">
      <button class="habitek-eccc-info-button" type="button" aria-label="${t.infoLabel}" aria-describedby="habitek-eccc-info-text">i</button>
      <span class="habitek-eccc-info-popover" id="habitek-eccc-info-text" role="tooltip">
        <strong>${t.infoTitle}</strong>
        <span>${t.infoBody}</span>
      </span>
    </span>
  `;
}

function headerMarkup(t, sourceMarkup) {
  return `
    <div class="habitek-eccc-header">
      <div class="habitek-eccc-title-wrap">
        <div class="habitek-eccc-title">${t.title}</div>
        ${infoMarkup(t)}
      </div>
      ${sourceMarkup}
    </div>
  `;
}

function setBlockHtml(block, signature, html) {
  if (block.dataset.renderSignature === signature) return;
  block.dataset.renderSignature = signature;
  block.innerHTML = html;
}

function render() {
  const card = findOutdoorCard();
  if (!card) return;

  installStyles();
  const lang = language();
  const t = copy[lang];
  const local = outdoorValues(card);
  const block = ensureBlock(card);

  if (weatherState === 'loading') {
    setBlockHtml(
      block,
      `${lang}|loading`,
      `${headerMarkup(t, `<span class="habitek-eccc-source">${t.source}</span>`)}<div class="habitek-eccc-state">${t.loading}</div>`
    );
    return;
  }

  if (!externalWeather) {
    setBlockHtml(
      block,
      `${lang}|unavailable`,
      `${headerMarkup(t, `<span class="habitek-eccc-source">${t.source}</span>`)}<div class="habitek-eccc-state">${t.unavailable}</div>`
    );
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

  const signature = [
    lang,
    referenceTemp,
    referenceHumidity,
    local.temperature,
    local.humidity,
    externalWeather.observed_at || '',
    stale ? 'stale' : 'fresh',
  ].join('|');

  setBlockHtml(block, signature, `
    ${headerMarkup(t, `
      <a class="habitek-eccc-source" href="${stationLink}" target="_blank" rel="noopener noreferrer">
        ${t.source}
      </a>
    `)}
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
  `);
}

async function refreshExternalWeather() {
  if (fetchPromise) return fetchPromise;
  weatherState = 'loading';
  render();

  fetchPromise = fetch(`/api/latest?external_weather=1&_=${Date.now()}`, { cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
      externalWeather = payload?.external_weather || null;
      weatherState = externalWeather ? 'ready' : 'unavailable';
      render();
      return externalWeather;
    })
    .catch((error) => {
      console.warn('[HabiTEK] external weather comparison unavailable', error);
      externalWeather = null;
      weatherState = 'unavailable';
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

  const start = () => {
    render();
    refreshExternalWeather();
    window.setInterval(render, RENDER_MS);
    window.setInterval(refreshExternalWeather, REFRESH_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

install();
