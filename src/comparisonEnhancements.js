// Enhancements for the public dashboard.
//
// - Mirrors the existing App.jsx time-window controls above the comparison chart.
// - Routes the custom PNG button through ApexCharts' own working PNG exporter,
//   with a high-resolution canvas fallback.
// - Keeps SVG and printable PDF exports vector-based.
// - Improves the Current Conditions presentation using the HabiTEK UX concept:
//   stronger hierarchy, construction badges, live exterior context and a
//   prominent indoor temperature delta.

const COMPARE_CHART_ID = 'compareChart';
const CONTROL_ID = 'habitek-comparison-range-controls';
const CURRENT_PANEL_ID = 'habitek-current-conditions';
const CURRENT_SUMMARY_ID = 'habitek-current-summary';
const STYLE_ID = 'habitek-public-ui-enhancements';
const EXPORT_SCALE = 3;

const PRESETS = [
  { value: 6, fr: '6 heures', en: '6 hours' },
  { value: 12, fr: '12 heures', en: '12 hours' },
  { value: 24, fr: '1 jour', en: '1 day' },
  { value: 24 * 7, fr: '1 semaine', en: '1 week' },
  { value: 24 * 14, fr: '2 semaines', en: '2 weeks' },
  { value: 24 * 31, fr: '1 mois', en: '1 month' },
];

const copy = {
  fr: {
    title: 'Étendue de temps',
    custom: 'Plage personnalisée',
    start: 'Date de début',
    end: 'Date de fin',
    apply: 'Appliquer',
    current: 'Plage active',
    exportError: "Impossible de générer l’export de comparaison.",
    popupBlocked: 'La fenêtre d’impression a été bloquée. Autorisez les fenêtres contextuelles puis réessayez.',
    printableTitle: 'Comparaison HabiTEK',
    conditionsSubtitle: 'Lecture instantanée des conditions mesurées dans les deux cabanes.',
    standard: 'Standard',
    highPerformance: 'Haute performance',
    deltaTitle: 'Delta thermique intérieur',
    deltaLabel: 'écart entre les cabanes',
    outside: 'Conditions extérieures',
    sameTemperature: 'Les deux cabanes affichent présentement la même température intérieure.',
    passiveColder: (value) => `La PassiveHouse est ${value} °C plus froide que la cabane Code.`,
    passiveWarmer: (value) => `La PassiveHouse est ${value} °C plus chaude que la cabane Code.`,
  },
  en: {
    title: 'Time range',
    custom: 'Custom range',
    start: 'Start date',
    end: 'End date',
    apply: 'Apply',
    current: 'Active range',
    exportError: 'Unable to generate the comparison export.',
    popupBlocked: 'The print window was blocked. Allow pop-ups and try again.',
    printableTitle: 'HabiTEK Comparison',
    conditionsSubtitle: 'Live view of the conditions measured in both cabins.',
    standard: 'Standard',
    highPerformance: 'High performance',
    deltaTitle: 'Indoor thermal delta',
    deltaLabel: 'difference between cabins',
    outside: 'Outdoor conditions',
    sameTemperature: 'Both cabins currently show the same indoor temperature.',
    passiveColder: (value) => `PassiveHouse is ${value} °C colder than the Code cabin.`,
    passiveWarmer: (value) => `PassiveHouse is ${value} °C warmer than the Code cabin.`,
  },
};

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${CURRENT_PANEL_ID} {
      position: relative;
      overflow: hidden;
      color: #e5eef9;
      background:
        radial-gradient(circle at 92% 8%, rgba(56, 189, 248, 0.14), transparent 32%),
        linear-gradient(145deg, #0f1d33 0%, #13233b 58%, #0f1d33 100%) !important;
      border: 1px solid rgba(148, 163, 184, 0.18);
      box-shadow: 0 18px 45px rgba(15, 29, 51, 0.18);
    }

    #${CURRENT_PANEL_ID} > h2 {
      color: #f8fafc !important;
      margin-bottom: 0.25rem !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-subtitle {
      margin: 0 auto 1rem;
      max-width: 46rem;
      color: #a9b8cb;
      font-size: 0.82rem;
      line-height: 1.45;
      text-align: center;
    }

    #${CURRENT_PANEL_ID} .habitek-current-grid {
      gap: 1rem !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card {
      position: relative;
      align-items: stretch !important;
      text-align: left !important;
      color: #e5eef9 !important;
      background: rgba(255, 255, 255, 0.055) !important;
      border: 1px solid rgba(148, 163, 184, 0.16) !important;
      border-radius: 1rem !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card[data-cabin='passivehouse'] {
      border-color: rgba(45, 212, 191, 0.26) !important;
      background: linear-gradient(145deg, rgba(20, 184, 166, 0.075), rgba(255,255,255,0.045)) !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card h3 {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.85rem !important;
      color: #38bdf8 !important;
      font-size: 1rem !important;
      font-weight: 750 !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card[data-cabin='passivehouse'] h3 {
      color: #5eead4 !important;
    }

    #${CURRENT_PANEL_ID} .habitek-cabin-badge {
      display: inline-flex;
      align-items: center;
      min-height: 1.35rem;
      padding: 0.16rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid rgba(251, 191, 36, 0.34);
      color: #fcd34d;
      background: rgba(245, 158, 11, 0.10);
      font-size: 0.64rem;
      line-height: 1;
      font-weight: 700;
      white-space: nowrap;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card[data-cabin='passivehouse'] .habitek-cabin-badge {
      border-color: rgba(52, 211, 153, 0.34);
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.10);
    }

    #${CURRENT_PANEL_ID} .habitek-current-card > .grid {
      width: 100%;
      gap: 0.65rem 0.75rem !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card > .grid > div {
      align-items: flex-start !important;
      min-width: 0;
      padding: 0.65rem 0.7rem;
      border-radius: 0.8rem;
      background: rgba(15, 23, 42, 0.30);
      border: 1px solid rgba(148, 163, 184, 0.10);
    }

    #${CURRENT_PANEL_ID} .habitek-current-card .habitek-primary-temp {
      grid-column: span 1;
      background: rgba(14, 165, 233, 0.10) !important;
      border-color: rgba(56, 189, 248, 0.18) !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card[data-cabin='passivehouse'] .habitek-primary-temp {
      background: rgba(20, 184, 166, 0.10) !important;
      border-color: rgba(45, 212, 191, 0.20) !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card .habitek-primary-temp > span:first-child {
      color: #f8fafc !important;
      font-size: 1.65rem !important;
      line-height: 1.05 !important;
      font-weight: 800 !important;
      letter-spacing: -0.025em;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card .habitek-primary-humidity > span:first-child {
      color: #e2e8f0 !important;
      font-size: 1.15rem !important;
      font-weight: 700 !important;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card > .grid > div > span:last-child {
      margin-top: 0.25rem;
      color: #8fa1b8 !important;
      font-size: 0.66rem !important;
      line-height: 1.2;
    }

    #${CURRENT_PANEL_ID} .habitek-current-card > p {
      width: 100%;
      margin-top: 0.8rem !important;
      color: #8fa1b8 !important;
      text-align: left;
    }

    #${CURRENT_SUMMARY_ID} {
      display: grid;
      grid-template-columns: minmax(180px, 0.72fr) minmax(0, 1.6fr);
      gap: 0.85rem;
      margin: 0 0 1rem;
    }

    #${CURRENT_SUMMARY_ID} .habitek-delta-card,
    #${CURRENT_SUMMARY_ID} .habitek-context-card {
      min-width: 0;
      border-radius: 1rem;
      border: 1px solid rgba(56, 189, 248, 0.18);
      background: rgba(2, 132, 199, 0.10);
      padding: 0.9rem 1rem;
    }

    #${CURRENT_SUMMARY_ID} .habitek-delta-eyebrow,
    #${CURRENT_SUMMARY_ID} .habitek-context-eyebrow {
      color: #7dd3fc;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.055em;
      text-transform: uppercase;
    }

    #${CURRENT_SUMMARY_ID} .habitek-delta-value {
      margin-top: 0.2rem;
      color: #38bdf8;
      font-size: clamp(1.8rem, 4vw, 2.65rem);
      line-height: 1;
      font-weight: 850;
      letter-spacing: -0.04em;
    }

    #${CURRENT_SUMMARY_ID} .habitek-delta-caption {
      margin-top: 0.3rem;
      color: #a9b8cb;
      font-size: 0.68rem;
    }

    #${CURRENT_SUMMARY_ID} .habitek-context-card {
      display: flex;
      flex-direction: column;
      justify-content: center;
      border-color: rgba(148, 163, 184, 0.14);
      background: rgba(255, 255, 255, 0.045);
    }

    #${CURRENT_SUMMARY_ID} .habitek-context-main {
      margin-top: 0.3rem;
      color: #f8fafc;
      font-size: 0.92rem;
      font-weight: 700;
      line-height: 1.35;
    }

    #${CURRENT_SUMMARY_ID} .habitek-outside-pill {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: 0.35rem;
      margin-top: 0.55rem;
      padding: 0.3rem 0.55rem;
      border-radius: 9999px;
      color: #cbd5e1;
      background: rgba(15, 23, 42, 0.46);
      border: 1px solid rgba(148, 163, 184, 0.13);
      font-size: 0.69rem;
    }

    @media (max-width: 640px) {
      #${CURRENT_SUMMARY_ID} {
        grid-template-columns: 1fr;
      }

      #${CURRENT_PANEL_ID} .habitek-current-card .habitek-primary-temp > span:first-child {
        font-size: 1.45rem !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function comparisonSection() {
  return document.getElementById(COMPARE_CHART_ID)?.parentElement || null;
}

function languageForSection(section) {
  const heading = section?.querySelector('h2')?.textContent?.trim().toLowerCase() || '';
  return heading === 'comparison' ? 'en' : 'fr';
}

function mainRangeElements() {
  const mainChart = document.getElementById('fullscreenChart');
  if (!mainChart) return null;

  const rangeSelect = Array.from(mainChart.querySelectorAll('select')).find((select) => {
    const values = Array.from(select.options).map((option) => Number(option.value));
    return values.includes(6) && values.includes(24) && values.includes(24 * 31);
  });

  const dateInputs = Array.from(mainChart.querySelectorAll('input[type="datetime-local"]'));
  const applyButton = Array.from(mainChart.querySelectorAll('button')).find((button) => {
    const text = button.textContent?.trim().toLowerCase();
    return text === 'confirmer' || text === 'apply';
  });

  if (!rangeSelect || dateInputs.length < 2 || !applyButton) return null;

  return {
    rangeSelect,
    startInput: dateInputs[0],
    endInput: dateInputs[1],
    applyButton,
  };
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function formatLocalDate(value, lang) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function currentRangeText(source, lang) {
  const start = source?.startInput?.value;
  const end = source?.endInput?.value;
  if (start && end) {
    return `${formatLocalDate(start, lang)} → ${formatLocalDate(end, lang)}`;
  }

  const preset = PRESETS.find((item) => item.value === Number(source?.rangeSelect?.value));
  return preset ? preset[lang] : '—';
}

function renderRangeControls() {
  const section = comparisonSection();
  const source = mainRangeElements();
  if (!section || !source) return;

  const existing = document.getElementById(CONTROL_ID);
  if (existing && existing.parentElement === section) {
    syncRangeControls(existing, source, languageForSection(section));
    return;
  }
  existing?.remove();

  const lang = languageForSection(section);
  const text = copy[lang];
  const wrapper = document.createElement('div');
  wrapper.id = CONTROL_ID;
  wrapper.className = 'mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-4';

  wrapper.innerHTML = `
    <div class="flex flex-col gap-4">
      <div>
        <div class="text-sm font-semibold text-gray-900 mb-2">${text.title}</div>
        <div data-role="presets" class="flex flex-wrap gap-2"></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 md:items-end">
        <label class="flex flex-col gap-1 text-xs text-gray-700">
          <span>${text.start}</span>
          <input data-role="start" type="datetime-local" class="border rounded-xl bg-white px-3 py-2 text-sm" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-gray-700">
          <span>${text.end}</span>
          <input data-role="end" type="datetime-local" class="border rounded-xl bg-white px-3 py-2 text-sm" />
        </label>
        <button data-role="apply" type="button" class="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
          ${text.apply}
        </button>
      </div>
      <div class="text-xs text-gray-500">
        <strong>${text.current} :</strong> <span data-role="current"></span>
      </div>
    </div>
  `;

  const presets = wrapper.querySelector('[data-role="presets"]');
  PRESETS.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.hours = String(preset.value);
    button.className = 'rounded-xl border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100';
    button.textContent = preset[lang];
    button.addEventListener('click', () => {
      setNativeValue(source.rangeSelect, String(preset.value));
      queueMicrotask(() => syncRangeControls(wrapper, mainRangeElements(), lang));
    });
    presets.appendChild(button);
  });

  const start = wrapper.querySelector('[data-role="start"]');
  const end = wrapper.querySelector('[data-role="end"]');
  const apply = wrapper.querySelector('[data-role="apply"]');

  apply.addEventListener('click', () => {
    if (!start.value || !end.value) return;
    if (new Date(start.value).getTime() >= new Date(end.value).getTime()) {
      end.setCustomValidity(lang === 'fr' ? 'La fin doit être après le début.' : 'End must be after start.');
      end.reportValidity();
      return;
    }

    end.setCustomValidity('');
    const currentSource = mainRangeElements();
    if (!currentSource) return;
    setNativeValue(currentSource.startInput, start.value);
    setNativeValue(currentSource.endInput, end.value);
    currentSource.applyButton.click();
    setTimeout(() => syncRangeControls(wrapper, mainRangeElements(), lang), 0);
  });

  const heading = Array.from(section.children).find((child) => child.tagName === 'H2');
  if (heading?.nextSibling) section.insertBefore(wrapper, heading.nextSibling);
  else section.prepend(wrapper);

  syncRangeControls(wrapper, source, lang);
}

function syncRangeControls(wrapper, source, lang) {
  if (!wrapper || !source) return;
  const start = wrapper.querySelector('[data-role="start"]');
  const end = wrapper.querySelector('[data-role="end"]');
  const current = wrapper.querySelector('[data-role="current"]');

  if (document.activeElement !== start) start.value = source.startInput.value || '';
  if (document.activeElement !== end) end.value = source.endInput.value || '';
  if (current) current.textContent = currentRangeText(source, lang);

  wrapper.querySelectorAll('[data-hours]').forEach((button) => {
    const active = Number(button.dataset.hours) === Number(source.rangeSelect.value) &&
      !source.startInput.value && !source.endInput.value;
    button.className = active
      ? 'rounded-xl border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-semibold text-white'
      : 'rounded-xl border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100';
  });
}

function legendItems(section) {
  return Array.from(section.querySelectorAll('.apexcharts-legend-series')).map((series) => {
    const name = series.querySelector('.apexcharts-legend-text')?.textContent?.trim();
    const marker = series.querySelector('.apexcharts-legend-marker');
    const color = marker?.style?.background || marker?.style?.backgroundColor || '#374151';
    return name ? { name, color } : null;
  }).filter(Boolean);
}

function snapshotSvg() {
  const section = comparisonSection();
  const sourceSvg = document.querySelector(`#${COMPARE_CHART_ID} svg`);
  if (!section || !sourceSvg) throw new Error('Comparison SVG not found');

  const clone = sourceSvg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const rect = sourceSvg.getBoundingClientRect();
  let width = rect.width || Number(sourceSvg.getAttribute('width')) || 1000;
  let height = rect.height || Number(sourceSvg.getAttribute('height')) || 550;
  const viewBox = sourceSvg.getAttribute('viewBox');

  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      width = parts[2];
      height = parts[3];
    }
  } else {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const items = legendItems(section);
  if (items.length) {
    const namespace = 'http://www.w3.org/2000/svg';
    const padding = 16;
    const rowHeight = 20;
    const legendHeight = padding * 2 + items.length * rowHeight;
    const group = document.createElementNS(namespace, 'g');
    group.setAttribute('transform', `translate(${padding}, ${height + padding})`);

    const background = document.createElementNS(namespace, 'rect');
    background.setAttribute('x', String(-padding));
    background.setAttribute('y', String(-padding));
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(legendHeight));
    background.setAttribute('fill', '#ffffff');
    group.appendChild(background);

    items.forEach((item, index) => {
      const y = index * rowHeight;
      const marker = document.createElementNS(namespace, 'rect');
      marker.setAttribute('x', '0');
      marker.setAttribute('y', String(y + 2));
      marker.setAttribute('width', '14');
      marker.setAttribute('height', '14');
      marker.setAttribute('rx', '2');
      marker.setAttribute('fill', item.color || '#374151');

      const label = document.createElementNS(namespace, 'text');
      label.setAttribute('x', '22');
      label.setAttribute('y', String(y + 14));
      label.setAttribute('font-size', '12');
      label.setAttribute('font-family', 'Arial, sans-serif');
      label.setAttribute('fill', '#111827');
      label.textContent = item.name;

      group.append(marker, label);
    });

    clone.appendChild(group);
    height += legendHeight;
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  return { serialized, width, height };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportName(extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `habitek-comparison-${stamp}.${extension}`;
}

async function exportSvg() {
  const { serialized } = snapshotSvg();
  downloadBlob(
    new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }),
    exportName('svg')
  );
}

async function exportPngFallback() {
  const { serialized, width, height } = snapshotSvg();
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * EXPORT_SCALE));
    canvas.height = Math.max(1, Math.round(height * EXPORT_SCALE));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');

    context.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('PNG encoding failed')),
        'image/png',
        1
      );
    });
    downloadBlob(pngBlob, exportName('png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportPng() {
  // The native ApexCharts toolbar PNG export is known to work on this chart.
  // Reuse that exact action so the custom button behaves identically instead
  // of maintaining a separate rasterization path that browsers may reject.
  const chartRoot = document.getElementById(COMPARE_CHART_ID);
  if (!chartRoot) throw new Error('Comparison chart not found');

  let exportItem = chartRoot.querySelector('.apexcharts-menu-item.exportPNG, .exportPNG');
  if (!exportItem) {
    chartRoot.querySelector('.apexcharts-menu-icon')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    exportItem = chartRoot.querySelector('.apexcharts-menu-item.exportPNG, .exportPNG');
  }

  if (exportItem) {
    exportItem.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
    );
    return;
  }

  // Keep a fallback for browsers or ApexCharts versions where the menu item is
  // not present in the DOM until after a different toolbar interaction.
  await exportPngFallback();
}

function exportPrintablePdf(lang) {
  const { serialized } = snapshotSvg();
  const section = comparisonSection();
  const source = mainRangeElements();
  const text = copy[lang];
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert(text.popupBlocked);
    return;
  }

  const pairLabels = Array.from(section?.querySelectorAll('select') || [])
    .slice(0, 2)
    .map((select) => select.value)
    .filter(Boolean);
  const subtitle = pairLabels.length === 2 ? `${pairLabels[0]} vs ${pairLabels[1]}` : '';
  const range = currentRangeText(source, lang);

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${text.printableTitle}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #111827; font-family: Arial, sans-serif; }
          h1 { margin: 0 0 4px; font-size: 22px; }
          .meta { margin-bottom: 12px; color: #4b5563; font-size: 12px; }
          .chart { width: 100%; page-break-inside: avoid; }
          .chart svg { display: block; width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <h1>${text.printableTitle}${subtitle ? ` — ${subtitle}` : ''}</h1>
        <div class="meta">${text.current}: ${range}</div>
        <div class="chart">${serialized}</div>
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 300);
}

function parseDisplayedNumber(value) {
  if (!value) return null;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function findCurrentConditionsPanel() {
  const heading = Array.from(document.querySelectorAll('h2')).find((element) => {
    const text = element.textContent?.trim().toLowerCase();
    return text === 'conditions actuelles' || text === 'current conditions';
  });
  return heading?.parentElement || null;
}

function findCurrentDataGrid(panel) {
  if (!panel) return null;
  return Array.from(panel.children).find((child) => {
    if (!(child instanceof HTMLElement) || !child.classList.contains('grid')) return false;
    const cards = Array.from(child.children).filter((element) => element.querySelector?.('h3'));
    return cards.length >= 2;
  }) || null;
}

function findMetricGroup(card, patterns) {
  const groups = Array.from(card.querySelectorAll(':scope > .grid > div'));
  return groups.find((group) => {
    const spans = group.querySelectorAll('span');
    const label = spans[spans.length - 1]?.textContent?.trim().toLowerCase() || '';
    return patterns.some((pattern) => label.includes(pattern));
  }) || null;
}

function readCabinCard(card) {
  const tempIntGroup = findMetricGroup(card, ['temp. int', 'indoor temp']);
  const humIntGroup = findMetricGroup(card, ['hum. int', 'indoor hum']);
  const tempExtGroup = findMetricGroup(card, ['temp. ext', 'outdoor temp']);
  const humExtGroup = findMetricGroup(card, ['hum. ext', 'outdoor hum']);

  tempIntGroup?.classList.add('habitek-primary-temp');
  humIntGroup?.classList.add('habitek-primary-humidity');
  tempExtGroup?.classList.add('habitek-secondary-metric');
  humExtGroup?.classList.add('habitek-secondary-metric');

  const firstSpanNumber = (group) =>
    parseDisplayedNumber(group?.querySelector('span:first-child')?.textContent);

  return {
    tempInt: firstSpanNumber(tempIntGroup),
    humidityInt: firstSpanNumber(humIntGroup),
    tempExt: firstSpanNumber(tempExtGroup),
    humidityExt: firstSpanNumber(humExtGroup),
  };
}

function ensureCabinBadge(card, cabin, lang) {
  const title = card.querySelector('h3');
  if (!title) return;

  let badge = title.querySelector('.habitek-cabin-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'habitek-cabin-badge';
    title.appendChild(badge);
  }

  badge.textContent = cabin === 'passivehouse'
    ? copy[lang].highPerformance
    : copy[lang].standard;
}

function enhanceCurrentConditions() {
  const panel = findCurrentConditionsPanel();
  const grid = findCurrentDataGrid(panel);
  if (!panel || !grid) return;

  installStyles();
  panel.id = CURRENT_PANEL_ID;
  grid.classList.add('habitek-current-grid');

  const heading = panel.querySelector(':scope > h2');
  const lang = heading?.textContent?.trim().toLowerCase() === 'current conditions' ? 'en' : 'fr';

  let subtitle = panel.querySelector('.habitek-current-subtitle');
  if (!subtitle && heading) {
    subtitle = document.createElement('p');
    subtitle.className = 'habitek-current-subtitle';
    heading.insertAdjacentElement('afterend', subtitle);
  }
  if (subtitle) subtitle.textContent = copy[lang].conditionsSubtitle;

  const cards = Array.from(grid.children).filter((element) => element.querySelector?.('h3'));
  const byCabin = {};

  cards.forEach((card) => {
    const cabinName = card.querySelector('h3')?.childNodes?.[0]?.textContent?.trim().toLowerCase() ||
      card.querySelector('h3')?.textContent?.trim().toLowerCase() || '';
    const cabin = cabinName.includes('passive') ? 'passivehouse' : cabinName.includes('code') ? 'code' : null;
    if (!cabin) return;

    card.classList.add('habitek-current-card');
    card.dataset.cabin = cabin;
    ensureCabinBadge(card, cabin, lang);
    byCabin[cabin] = readCabinCard(card);
  });

  const code = byCabin.code;
  const passive = byCabin.passivehouse;
  if (!code || !passive) return;

  const delta = Number.isFinite(code.tempInt) && Number.isFinite(passive.tempInt)
    ? code.tempInt - passive.tempInt
    : null;
  const absDelta = Number.isFinite(delta) ? Math.abs(delta) : null;

  let comparisonText = copy[lang].sameTemperature;
  if (Number.isFinite(delta) && Math.abs(delta) >= 0.05) {
    comparisonText = delta > 0
      ? copy[lang].passiveColder(absDelta.toFixed(1))
      : copy[lang].passiveWarmer(absDelta.toFixed(1));
  }

  const outsideTemp = Number.isFinite(code.tempExt) ? code.tempExt : passive.tempExt;
  const outsideHumidity = Number.isFinite(code.humidityExt) ? code.humidityExt : passive.humidityExt;
  const outsideParts = [];
  if (Number.isFinite(outsideTemp)) outsideParts.push(`${outsideTemp.toFixed(1)} °C`);
  if (Number.isFinite(outsideHumidity)) outsideParts.push(`${outsideHumidity.toFixed(0)} % HR`);

  const signature = JSON.stringify({
    lang,
    delta: Number.isFinite(absDelta) ? absDelta.toFixed(1) : null,
    comparisonText,
    outsideParts,
  });

  let summary = panel.querySelector(`#${CURRENT_SUMMARY_ID}`);
  if (!summary) {
    summary = document.createElement('div');
    summary.id = CURRENT_SUMMARY_ID;
    const insertionPoint = subtitle?.nextSibling || grid;
    panel.insertBefore(summary, insertionPoint);
  }

  if (summary.dataset.signature !== signature) {
    summary.dataset.signature = signature;
    summary.innerHTML = `
      <div class="habitek-delta-card">
        <div class="habitek-delta-eyebrow">${copy[lang].deltaTitle}</div>
        <div class="habitek-delta-value">${Number.isFinite(absDelta) ? `${absDelta.toFixed(1)} °C` : '—'}</div>
        <div class="habitek-delta-caption">${copy[lang].deltaLabel}</div>
      </div>
      <div class="habitek-context-card">
        <div class="habitek-context-eyebrow">${copy[lang].outside}</div>
        <div class="habitek-context-main">${comparisonText}</div>
        ${outsideParts.length ? `<div class="habitek-outside-pill">☁ ${outsideParts.join(' · ')}</div>` : ''}
      </div>
    `;
  }
}

function interceptExports(event) {
  const button = event.target.closest?.('button');
  const section = comparisonSection();
  if (!button || !section || !section.contains(button)) return;

  const label = button.textContent?.trim().toLowerCase() || '';
  let action = null;
  if (label.includes('png')) action = 'png';
  else if (label.includes('svg')) action = 'svg';
  else if (label.includes('pdf')) action = 'pdf';
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  const lang = languageForSection(section);
  Promise.resolve()
    .then(() => action === 'png' ? exportPng() : action === 'svg' ? exportSvg() : exportPrintablePdf(lang))
    .catch((error) => {
      console.error(`[comparison export:${action}]`, error);
      window.alert(copy[lang].exportError);
    });
}

function install() {
  if (window.location.pathname.startsWith('/admin')) return;

  installStyles();

  const refresh = () => {
    renderRangeControls();
    enhanceCurrentConditions();
  };

  const observer = new MutationObserver(() => {
    window.clearTimeout(observer._timer);
    observer._timer = window.setTimeout(refresh, 70);
  });

  const start = () => {
    refresh();
    observer.observe(document.getElementById('root') || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener('click', interceptExports, true);
    window.setInterval(refresh, 1500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

install();
