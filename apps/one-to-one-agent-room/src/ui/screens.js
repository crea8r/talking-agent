const VALID_SCREENS = new Set(['setup', 'session', 'diagnostics']);
const DEFAULT_SCREEN = 'setup';

function normalizeScreenId(value) {
  return VALID_SCREENS.has(value) ? value : DEFAULT_SCREEN;
}

function getHashScreenId() {
  return normalizeScreenId(window.location.hash.replace(/^#/, ''));
}

export function createScreenNavigator({ tabs, screens }) {
  const panelMap = new Map(
    screens
      .map((screen) => [screen.dataset.screen, screen])
      .filter(([screenId, screen]) => screenId && screen),
  );
  const orderedTabs = tabs.filter((tab) => panelMap.has(tab.dataset.screenTarget));
  let activeScreenId = DEFAULT_SCREEN;

  function syncTabs(nextScreenId) {
    orderedTabs.forEach((tab, index) => {
      const isActive = tab.dataset.screenTarget === nextScreenId;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
      if (isActive && document.activeElement === orderedTabs[index]) {
        tab.focus();
      }
    });
  }

  function syncPanels(nextScreenId) {
    panelMap.forEach((panel, screenId) => {
      const isActive = screenId === nextScreenId;
      panel.hidden = !isActive;
      panel.toggleAttribute('data-active', isActive);
    });
  }

  function show(screenId, { updateHash = true } = {}) {
    const nextScreenId = normalizeScreenId(screenId);
    activeScreenId = nextScreenId;
    syncTabs(nextScreenId);
    syncPanels(nextScreenId);

    if (updateHash) {
      const nextHash = `#${nextScreenId}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    }
  }

  function moveFocus(currentIndex, direction) {
    const nextIndex = (currentIndex + direction + orderedTabs.length) % orderedTabs.length;
    const nextTab = orderedTabs[nextIndex];
    nextTab?.focus();
    if (nextTab?.dataset.screenTarget) {
      show(nextTab.dataset.screenTarget);
    }
  }

  orderedTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      show(tab.dataset.screenTarget);
    });

    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveFocus(index, 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveFocus(index, -1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        orderedTabs[0]?.focus();
        show(orderedTabs[0]?.dataset.screenTarget);
      } else if (event.key === 'End') {
        event.preventDefault();
        const lastTab = orderedTabs.at(-1);
        lastTab?.focus();
        show(lastTab?.dataset.screenTarget);
      }
    });
  });

  window.addEventListener('hashchange', () => {
    show(getHashScreenId(), { updateHash: false });
  });

  show(getHashScreenId(), { updateHash: !VALID_SCREENS.has(window.location.hash.replace(/^#/, '')) });

  return {
    getActiveScreen() {
      return activeScreenId;
    },
    show,
  };
}
