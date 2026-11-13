// Light / dark appearance. The choice is remembered on each device (phone and computer can differ).
// 'auto' follows the device's own setting.

const KEY = 'pl_theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(choice = getTheme()) {
  const dark = choice === 'dark' || (choice === 'auto' && Boolean(media?.matches));
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111a15' : '#24392f');
}

export function setTheme(choice) {
  try { localStorage.setItem(KEY, choice); } catch { /* not important */ }
  applyTheme(choice);
}

// Follow the device when it switches between light and dark (e.g. at sunset).
media?.addEventListener?.('change', () => { if (getTheme() === 'auto') applyTheme('auto'); });
