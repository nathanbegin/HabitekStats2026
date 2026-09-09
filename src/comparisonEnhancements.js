// Enhancements for the public comparison chart.
//
// App.jsx currently uses the same time-window state for the main and comparison
// charts. This module exposes that existing state directly above the comparison
// chart without duplicating network/state logic, and hardens the three export
// actions (PNG, SVG and printable PDF) around the rendered ApexCharts SVG.

const COMPARE_CHART_ID = 'compareChart';
const CONTROL_ID = 'habitek-comparison-range-controls';
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
  },
};

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

  // Keep the controls immediately below the Comparison heading.
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
  const fromApex = Array.from(section.querySelectorAll('.apexcharts-legend-series')).map((series) => {
    const name = series.querySelector('.apexcharts-legend-text')?.textContent?.trim();
    const marker = series.querySelector('.apexcharts-legend-marker');
    const color = marker?.style?.background || marker?.style?.backgroundColor || '#374151';
    return name ? { name, color } : null;
  }).filter(Boolean);

  if (fromApex.length) return fromApex;

  return [];
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
  downloadBlob(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }), exportName('svg'));
}

async function exportPng() {
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
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG encoding failed')), 'image/png', 1);
    });
    downloadBlob(pngBlob, exportName('png'));
  } finally {
    URL.revokeObjectURL(url);
  }
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

  const refresh = () => renderRangeControls();
  const observer = new MutationObserver(() => {
    window.clearTimeout(observer._timer);
    observer._timer = window.setTimeout(refresh, 50);
  });

  const start = () => {
    refresh();
    observer.observe(document.getElementById('root') || document.body, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('click', interceptExports, true);
    window.setInterval(refresh, 1000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

install();
