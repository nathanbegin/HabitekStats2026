// HabiTEK-branded Current Conditions presentation.
// Keeps the exterior measurements visually separate from the thermal comparison,
// and adds a compact horizontal temperature comparison inspired by the UX concept.

const STYLE_ID = 'habitek-current-branding-v2';
const PANEL_ID = 'habitek-current-conditions';
const SUMMARY_ID = 'habitek-current-summary';
const OUTDOOR_CARD_ID = 'habitek-current-outdoor-card';
const BARS_ID = 'habitek-current-temperature-bars';

const text = {
  fr: {
    subtitle: 'Lecture instantanée des conditions mesurées à l’extérieur et dans les deux cabanes.',
    exterior: 'Conditions extérieures',
    weather: 'Météo',
    outdoorTemp: 'Temp. extérieure',
    outdoorHumidity: 'Humidité extérieure',
    delta: 'Écart thermique intérieur',
    same: 'Les deux cabanes affichent la même température intérieure.',
    passiveColder: (value) => `La PassiveHouse est ${value} °C plus froide que la cabane Code.`,
    passiveWarmer: (value) => `La PassiveHouse est ${value} °C plus chaude que la cabane Code.`,
    comparison: 'Comparatif des températures actuelles',
    outsideBar: 'Météo extérieure',
    codeBar: 'Cabane Code Standard',
    passiveBar: 'Cabane Passive HabiTEK',
    noData: 'ND',
  },
  en: {
    subtitle: 'Live view of the conditions measured outdoors and inside both cabins.',
    exterior: 'Outdoor conditions',
    weather: 'Weather',
    outdoorTemp: 'Outdoor temp.',
    outdoorHumidity: 'Outdoor humidity',
    delta: 'Indoor thermal difference',
    same: 'Both cabins currently show the same indoor temperature.',
    passiveColder: (value) => `PassiveHouse is ${value} °C colder than the Code cabin.`,
    passiveWarmer: (value) => `PassiveHouse is ${value} °C warmer than the Code cabin.`,
    comparison: 'Current temperature comparison',
    outsideBar: 'Outdoor weather',
    codeBar: 'Code Standard cabin',
    passiveBar: 'Passive HabiTEK cabin',
    noData: 'NA',
  },
};

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* HabiTEK palette: signature red, warm amber, charcoal and white. */
    #${PANEL_ID} {
      --habitek-red: #be1622;
      --habitek-red-dark: #8f1019;
      --habitek-orange: #ef7d22;
      --habitek-gold: #f2b705;
      --habitek-ink: #151b26;
      --habitek-surface: #202a3a;
      --habitek-track: #303a4b;
      --habitek-muted: #aeb9c8;
      color: #ffffff !important;
      background:
        radial-gradient(circle at 100% 0%, rgba(190, 22, 34, 0.18), transparent 34%),
        linear-gradient(145deg, #171d28 0%, #202837 58%, #171d28 100%) !important;
      border: 1px solid rgba(190, 22, 34, 0.24) !important;
      box-shadow: 0 18px 44px rgba(21, 27, 38, 0.18) !important;
    }

    #${PANEL_ID} > h2 {
      color: #ffffff !important;
      position: relative;
      display: table;
      margin-left: auto;
      margin-right: auto;
      padding-bottom: 0.48rem;
    }

    #${PANEL_ID} > h2::after {
      content: '';
      position: absolute;
      left: 18%;
      right: 18%;
      bottom: 0;
      height: 3px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--habitek-gold), var(--habitek-orange), var(--habitek-red));
    }

    #${PANEL_ID} .habitek-current-subtitle {
      color: var(--habitek-muted) !important;
      margin-bottom: 1rem !important;
    }

    #${SUMMARY_ID} {
      display: block !important;
      margin: 0 0 1rem !important;
    }

    #${SUMMARY_ID} .habitek-delta-banner-v2 {
      display: grid;
      grid-template-columns: minmax(150px, auto) minmax(0, 1fr);
      align-items: center;
      gap: 1rem;
      padding: 0.9rem 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(190, 22, 34, 0.32);
      background: linear-gradient(100deg, rgba(190, 22, 34, 0.15), rgba(239, 125, 34, 0.07));
    }

    #${SUMMARY_ID} .habitek-delta-number-v2 {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    #${SUMMARY_ID} .habitek-delta-kicker-v2 {
      color: #f7c24b;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    #${SUMMARY_ID} .habitek-delta-value-v2 {
      color: #ffffff;
      font-size: clamp(1.75rem, 3.2vw, 2.5rem);
      font-weight: 850;
      line-height: 1;
      letter-spacing: -0.035em;
    }

    #${SUMMARY_ID} .habitek-delta-message-v2 {
      color: #ffffff;
      font-size: 0.92rem;
      font-weight: 750;
      line-height: 1.4;
    }

    #${PANEL_ID} .habitek-current-grid {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 0.85rem !important;
      align-items: stretch;
    }

    #${PANEL_ID} .habitek-current-card,
    #${OUTDOOR_CARD_ID} {
      min-width: 0;
      color: #ffffff !important;
      background: rgba(255,255,255,0.055) !important;
      border: 1px solid rgba(255,255,255,0.10) !important;
      border-radius: 1rem !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important;
    }

    #${PANEL_ID} .habitek-current-card[data-cabin='code'] {
      border-top: 3px solid var(--habitek-red) !important;
    }

    #${PANEL_ID} .habitek-current-card[data-cabin='passivehouse'] {
      border-top: 3px solid var(--habitek-gold) !important;
      background: linear-gradient(145deg, rgba(242,183,5,0.07), rgba(255,255,255,0.045)) !important;
    }

    #${OUTDOOR_CARD_ID} {
      padding: 1rem;
      border-top: 3px solid var(--habitek-orange) !important;
      background: linear-gradient(145deg, rgba(239,125,34,0.08), rgba(255,255,255,0.045)) !important;
    }

    #${OUTDOOR_CARD_ID} .habitek-outdoor-heading-v2,
    #${PANEL_ID} .habitek-current-card h3 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      width: 100%;
      margin: 0 0 0.85rem !important;
      color: #ffffff !important;
      font-size: 0.96rem !important;
      font-weight: 800 !important;
    }

    #${PANEL_ID} .habitek-current-card h3 {
      color: #ffffff !important;
    }

    #${PANEL_ID} .habitek-cabin-badge,
    #${OUTDOOR_CARD_ID} .habitek-weather-badge-v2 {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      font-size: 0.62rem;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
    }

    #${PANEL_ID} .habitek-current-card[data-cabin='code'] .habitek-cabin-badge {
      color: #ffd6da !important;
      border-color: rgba(190,22,34,0.42) !important;
      background: rgba(190,22,34,0.18) !important;
    }

    #${PANEL_ID} .habitek-current-card[data-cabin='passivehouse'] .habitek-cabin-badge {
      color: #ffe8a3 !important;
      border-color: rgba(242,183,5,0.42) !important;
      background: rgba(242,183,5,0.13) !important;
    }

    #${OUTDOOR_CARD_ID} .habitek-weather-badge-v2 {
      color: #ffe3cc;
      border: 1px solid rgba(239,125,34,0.42);
      background: rgba(239,125,34,0.14);
    }

    /* Exterior values now use the exact same metric-card language as cabin stats. */
    #${OUTDOOR_CARD_ID} .habitek-outdoor-metrics-v2,
    #${PANEL_ID} .habitek-current-card > .grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 0.65rem !important;
      width: 100%;
    }

    #${OUTDOOR_CARD_ID} .habitek-outdoor-metric-v2,
    #${PANEL_ID} .habitek-current-card > .grid > div {
      display: flex;
      flex-direction: column;
      align-items: flex-start !important;
      justify-content: center;
      min-width: 0;
      padding: 0.7rem;
      border-radius: 0.8rem;
      background: rgba(15, 23, 42, 0.34) !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
    }

    #${OUTDOOR_CARD_ID} .habitek-outdoor-value-v2,
    #${PANEL_ID} .habitek-current-card .habitek-primary-temp > span:first-child {
      color: #ffffff !important;
      font-size: clamp(1.35rem, 2.2vw, 1.7rem) !important;
      line-height: 1.05 !important;
      font-weight: 850 !important;
      letter-spacing: -0.025em;
    }

    #${OUTDOOR_CARD_ID} .habitek-outdoor-label-v2,
    #${PANEL_ID} .habitek-current-card > .grid > div > span:last-child {
      margin-top: 0.28rem;
      color: var(--habitek-muted) !important;
      font-size: 0.66rem !important;
      line-height: 1.2;
    }

    /* Exterior metrics already live in the dedicated exterior card. */
    #${PANEL_ID} .habitek-current-card .habitek-secondary-metric {
      display: none !important;
    }

    #${PANEL_ID} .habitek-current-card > p {
      color: var(--habitek-muted) !important;
    }

    #${BARS_ID} {
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 1rem;
      background: rgba(255,255,255,0.045);
      border: 1px solid rgba(255,255,255,0.09);
    }

    #${BARS_ID} .habitek-bars-title-v2 {
      margin-bottom: 0.85rem;
      color: #ffffff;
      font-size: 0.88rem;
      font-weight: 800;
    }

    #${BARS_ID} .habitek-temp-row-v2 {
      display: grid;
      grid-template-columns: minmax(150px, 210px) minmax(0, 1fr);
      align-items: center;
      gap: 0.9rem;
      margin-top: 0.65rem;
    }

    #${BARS_ID} .habitek-temp-label-v2 {
      color: #f4f7fb;
      font-size: 0.78rem;
      font-weight: 750;
      text-align: right;
    }

    #${BARS_ID} .habitek-temp-track-v2 {
      position: relative;
      height: 2.55rem;
      overflow: hidden;
      border-radius: 0.5rem;
      background: var(--habitek-track);
    }

    #${BARS_ID} .habitek-temp-fill-v2 {
      height: 100%;
      min-width: 3.25rem;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 0.7rem;
      border-radius: 0.5rem;
      color: #ffffff;
      font-size: 0.82rem;
      font-weight: 850;
      white-space: nowrap;
      transition: width 240ms ease;
    }

    #${BARS_ID} .habitek-temp-fill-v2[data-type='outside'] {
      background: linear-gradient(90deg, var(--habitek-gold), var(--habitek-orange), #f0444f);
    }

    #${BARS_ID} .habitek-temp-fill-v2[data-type='code'] {
      background: linear-gradient(90deg, #7f1017, var(--habitek-red), #e73743);
    }

    #${BARS_ID} .habitek-temp-fill-v2[data-type='passive'] {
      background: linear-gradient(90deg, #dc8f00, var(--habitek-gold), #ffd45c);
      color: #281d00;
    }

    @media (max-width: 900px) {
      #${PANEL_ID} .habitek-current-grid {
        grid-template-columns: 1fr !important;
      }
    }

    @media (max-width: 640px) {
      #${SUMMARY_ID} .habitek-delta-banner-v2 {
        grid-template-columns: 1fr;
        gap: 0.45rem;
      }

      #${BARS_ID} .habitek-temp-row-v2 {
        grid-template-columns: 1fr;
        gap: 0.35rem;
      }

      #${BARS_ID} .habitek-temp-label-v2 {
        text-align: left;
      }

      #${BARS_ID} .habitek-temp-track-v2 {
        height: 2.25rem;
      }
    }
  `;

  document.head.appendChild(style);
}

function parseNumber(value) {
  if (value == null) return null;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function panelElement() {
  const direct = document.getElementById(PANEL_ID);
  if (direct) return direct;

  const heading = Array.from(document.querySelectorAll('h2')).find((element) => {
    const value = element.textContent?.trim().toLowerCase();
    return value === 'conditions actuelles' || value === 'current conditions';
  });
  return heading?.parentElement || null;
}

function panelLanguage(panel) {
  const heading = panel?.querySelector(':scope > h2');
  return heading?.textContent?.trim().toLowerCase() === 'current conditions' ? 'en' : 'fr';
}

function dataGrid(panel) {
  if (!panel) return null;
  return Array.from(panel.children).find((child) => {
    if (!(child instanceof HTMLElement) || !child.classList.contains('grid')) return false;
    return Array.from(child.children).some((element) => element.querySelector?.('h3'));
  }) || null;
}

function metricGroup(card, patterns) {
  if (!card) return null;
  const groups = Array.from(card.querySelectorAll(':scope > .grid > div'));
  return groups.find((group) => {
    const spans = group.querySelectorAll('span');
    const label = spans[spans.length - 1]?.textContent?.trim().toLowerCase() || '';
    return patterns.some((pattern) => label.includes(pattern));
  }) || null;
}

function readCard(card) {
  const read = (patterns) => parseNumber(metricGroup(card, patterns)?.querySelector('span:first-child')?.textContent);
  return {
    tempInt: read(['temp. int', 'indoor temp']),
    humidityInt: read(['hum. int', 'indoor hum']),
    tempExt: read(['temp. ext', 'outdoor temp']),
    humidityExt: read(['hum. ext', 'outdoor hum']),
  };
}

function cabinFromCard(card) {
  const heading = card?.querySelector('h3');
  if (!heading) return null;
  const value = heading.childNodes?.[0]?.textContent?.trim().toLowerCase() || heading.textContent?.trim().toLowerCase() || '';
  if (value.includes('passive')) return 'passivehouse';
  if (value.includes('code')) return 'code';
  return null;
}

function formatTemp(value, lang) {
  return Number.isFinite(value) ? `${value.toFixed(1)} °C` : text[lang].noData;
}

function formatHumidity(value, lang) {
  return Number.isFinite(value) ? `${value.toFixed(0)} %` : text[lang].noData;
}

function ensureOutdoorCard(grid, values, lang) {
  let card = document.getElementById(OUTDOOR_CARD_ID);
  if (!card) {
    card = document.createElement('div');
    card.id = OUTDOOR_CARD_ID;
    card.dataset.cabin = 'outdoor';
    card.className = 'habitek-current-card';
    grid.prepend(card);
  }

  const signature = `${lang}|${values.temp}|${values.humidity}`;
  if (card.dataset.signature !== signature) {
    card.dataset.signature = signature;
    card.innerHTML = `
      <div class="habitek-outdoor-heading-v2">
        <span>${text[lang].exterior}</span>
        <span class="habitek-weather-badge-v2">${text[lang].weather}</span>
      </div>
      <div class="habitek-outdoor-metrics-v2">
        <div class="habitek-outdoor-metric-v2">
          <span class="habitek-outdoor-value-v2">${formatTemp(values.temp, lang)}</span>
          <span class="habitek-outdoor-label-v2">${text[lang].outdoorTemp}</span>
        </div>
        <div class="habitek-outdoor-metric-v2">
          <span class="habitek-outdoor-value-v2">${formatHumidity(values.humidity, lang)}</span>
          <span class="habitek-outdoor-label-v2">${text[lang].outdoorHumidity}</span>
        </div>
      </div>
    `;
  }

  if (grid.firstElementChild !== card) grid.prepend(card);
}

function ensureDelta(panel, grid, code, passive, lang) {
  let summary = document.getElementById(SUMMARY_ID);
  if (!summary) {
    summary = document.createElement('div');
    summary.id = SUMMARY_ID;
    panel.insertBefore(summary, grid);
  } else if (summary.nextElementSibling !== grid) {
    panel.insertBefore(summary, grid);
  }

  const delta = Number.isFinite(code.tempInt) && Number.isFinite(passive.tempInt)
    ? code.tempInt - passive.tempInt
    : null;
  const magnitude = Number.isFinite(delta) ? Math.abs(delta) : null;

  let message = text[lang].same;
  if (Number.isFinite(delta) && Math.abs(delta) >= 0.05) {
    message = delta > 0
      ? text[lang].passiveColder(magnitude.toFixed(1))
      : text[lang].passiveWarmer(magnitude.toFixed(1));
  }

  const signature = `${lang}|${delta}|${message}`;
  if (summary.dataset.brandingSignature === signature) return;
  summary.dataset.brandingSignature = signature;
  summary.innerHTML = `
    <div class="habitek-delta-banner-v2">
      <div class="habitek-delta-number-v2">
        <span class="habitek-delta-kicker-v2">${text[lang].delta}</span>
        <span class="habitek-delta-value-v2">${Number.isFinite(magnitude) ? `${magnitude.toFixed(1)} °C` : '—'}</span>
      </div>
      <div class="habitek-delta-message-v2">${message}</div>
    </div>
  `;
}

function barWidth(value, values) {
  if (!Number.isFinite(value)) return 0;
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 0;
  const max = Math.max(...finite.map((item) => Math.abs(item)), 1);
  return Math.max(8, Math.min(100, (Math.abs(value) / max) * 100));
}

function ensureTemperatureBars(panel, grid, values, lang) {
  let block = document.getElementById(BARS_ID);
  if (!block) {
    block = document.createElement('div');
    block.id = BARS_ID;
    grid.insertAdjacentElement('afterend', block);
  } else if (block.previousElementSibling !== grid) {
    grid.insertAdjacentElement('afterend', block);
  }

  const temperatures = [values.outside, values.code, values.passive];
  const rows = [
    { label: text[lang].outsideBar, value: values.outside, type: 'outside' },
    { label: text[lang].codeBar, value: values.code, type: 'code' },
    { label: text[lang].passiveBar, value: values.passive, type: 'passive' },
  ];

  const signature = `${lang}|${temperatures.join('|')}`;
  if (block.dataset.signature === signature) return;
  block.dataset.signature = signature;
  block.innerHTML = `
    <div class="habitek-bars-title-v2">${text[lang].comparison}</div>
    ${rows.map((row) => {
      const width = barWidth(row.value, temperatures);
      return `
        <div class="habitek-temp-row-v2">
          <div class="habitek-temp-label-v2">${row.label}</div>
          <div class="habitek-temp-track-v2">
            <div class="habitek-temp-fill-v2" data-type="${row.type}" style="width:${width}%">
              ${formatTemp(row.value, lang)}
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function enhance() {
  if (window.location.pathname.startsWith('/admin')) return;

  const panel = panelElement();
  const grid = dataGrid(panel);
  if (!panel || !grid) return;

  const cards = Array.from(grid.children).filter((element) => element.querySelector?.('h3'));
  const mapped = {};
  cards.forEach((card) => {
    const cabin = cabinFromCard(card);
    if (!cabin) return;
    mapped[cabin] = { card, ...readCard(card) };
  });

  if (!mapped.code || !mapped.passivehouse) return;

  installStyles();
  panel.id = PANEL_ID;
  grid.classList.add('habitek-current-grid');

  const lang = panelLanguage(panel);
  const subtitle = panel.querySelector('.habitek-current-subtitle');
  if (subtitle) subtitle.textContent = text[lang].subtitle;

  const outsideTemp = Number.isFinite(mapped.code.tempExt)
    ? mapped.code.tempExt
    : mapped.passivehouse.tempExt;
  const outsideHumidity = Number.isFinite(mapped.code.humidityExt)
    ? mapped.code.humidityExt
    : mapped.passivehouse.humidityExt;

  ensureDelta(panel, grid, mapped.code, mapped.passivehouse, lang);
  ensureOutdoorCard(grid, { temp: outsideTemp, humidity: outsideHumidity }, lang);
  ensureTemperatureBars(panel, grid, {
    outside: outsideTemp,
    code: mapped.code.tempInt,
    passive: mapped.passivehouse.tempInt,
  }, lang);
}

function install() {
  if (window.location.pathname.startsWith('/admin')) return;

  const refresh = () => enhance();
  const observer = new MutationObserver(() => {
    clearTimeout(observer._timer);
    observer._timer = setTimeout(refresh, 80);
  });

  const start = () => {
    refresh();
    observer.observe(document.getElementById('root') || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.setInterval(refresh, 1500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

install();
