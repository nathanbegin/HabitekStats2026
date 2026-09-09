// Keep a single, stable Current Conditions subtitle.
// Older enhancement layers may still rewrite .habitek-current-subtitle during
// live refreshes; hide that shared node and render one dedicated subtitle that
// those layers do not target.

const STYLE_ID = 'habitek-current-subtitle-stable-style';
const STABLE_ID = 'habitek-current-subtitle-stable';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .habitek-current-subtitle {
      display: none !important;
    }

    #${STABLE_ID} {
      display: block !important;
      margin: 0 auto 1rem !important;
      max-width: 46rem;
      color: #aeb9c8 !important;
      font-size: 0.82rem !important;
      line-height: 1.45 !important;
      font-weight: 400 !important;
      text-align: center !important;
    }
  `;

  document.head.appendChild(style);
}

function findHeading() {
  return Array.from(document.querySelectorAll('h2')).find((element) => {
    const value = element.textContent?.trim().toLowerCase();
    return value === 'conditions actuelles' || value === 'current conditions';
  }) || null;
}

function ensureStableSubtitle() {
  if (window.location.pathname.startsWith('/admin')) return;

  const heading = findHeading();
  if (!heading) return;

  const lang = heading.textContent?.trim().toLowerCase() === 'current conditions'
    ? 'en'
    : 'fr';

  let subtitle = document.getElementById(STABLE_ID);
  if (!subtitle) {
    subtitle = document.createElement('p');
    subtitle.id = STABLE_ID;
    heading.insertAdjacentElement('afterend', subtitle);
  } else if (subtitle.previousElementSibling !== heading) {
    heading.insertAdjacentElement('afterend', subtitle);
  }

  const nextText = lang === 'fr'
    ? 'Lecture des conditions mesurées à l’extérieur et dans les deux cabanes.'
    : 'Measured conditions outdoors and inside both cabins.';

  if (subtitle.textContent !== nextText) subtitle.textContent = nextText;
}

installStyles();

function install() {
  if (window.location.pathname.startsWith('/admin')) return;

  const start = () => {
    ensureStableSubtitle();

    const observer = new MutationObserver(() => {
      window.clearTimeout(observer._timer);
      observer._timer = window.setTimeout(ensureStableSubtitle, 20);
    });

    observer.observe(document.getElementById('root') || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

install();
