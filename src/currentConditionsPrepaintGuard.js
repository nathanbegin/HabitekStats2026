// Prevent a flash of the legacy Current Conditions presentation before the
// HabiTEK branding enhancer has finished transforming the section.

const STYLE_ID = 'habitek-current-prepaint-guard';
const READY_CLASS = 'habitek-current-ready';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html:not(.${READY_CLASS}) #root > div > header + div {
      opacity: 0 !important;
    }

    html.${READY_CLASS} #root > div > header + div,
    html.${READY_CLASS} #habitek-current-conditions {
      opacity: 1 !important;
      transition: opacity 120ms ease;
    }
  `;
  document.head.appendChild(style);
}

function finalBrandingReady() {
  const panel = document.getElementById('habitek-current-conditions');
  return Boolean(
    panel?.querySelector('.habitek-delta-banner-v2') &&
    panel?.querySelector('#habitek-current-outdoor-card') &&
    panel?.querySelector('#habitek-current-temperature-bars')
  );
}

function syncReadyState() {
  if (window.location.pathname.startsWith('/admin')) {
    document.documentElement.classList.add(READY_CLASS);
    return;
  }

  if (finalBrandingReady()) {
    document.documentElement.classList.add(READY_CLASS);
  }
}

installStyles();

if (!window.location.pathname.startsWith('/admin')) {
  const start = () => {
    syncReadyState();
    const observer = new MutationObserver(syncReadyState);
    observer.observe(document.getElementById('root') || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Safety fallback: never leave the section hidden indefinitely if data is
    // unavailable or the expected branded elements cannot be created.
    window.setTimeout(() => {
      document.documentElement.classList.add(READY_CLASS);
    }, 2500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
} else {
  document.documentElement.classList.add(READY_CLASS);
}
