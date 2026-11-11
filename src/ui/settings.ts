import { fx } from './fx';

/** Display settings kept on the device (sound volumes and vibration are kept by audio.ts). */
const KEY = 'mycryptotrading.display.v1';

interface Display {
  calm: boolean;
  bigText: boolean;
}

function read(): Display {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Display>;
    return { calm: !!raw.calm, bigText: !!raw.bigText };
  } catch {
    return { calm: false, bigText: false };
  }
}

const state: Display = read();

function apply(): void {
  const html = document.documentElement;
  html.classList.toggle('calm', state.calm);
  html.classList.toggle('big-text', state.bigText);
  html.style.setProperty('--text-scale', state.bigText ? '1.15' : '1');
  fx.setCalm(state.calm);
}

function keep(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not kept: the setting still holds until the page is closed
  }
}

export const display = {
  get calm(): boolean {
    return state.calm;
  },
  get bigText(): boolean {
    return state.bigText;
  },
  /** true when motion should be cut down: the game's setting or the system's */
  get still(): boolean {
    return state.calm || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  },
  setCalm(on: boolean): void {
    state.calm = on;
    apply();
    keep();
  },
  setBigText(on: boolean): void {
    state.bigText = on;
    apply();
    keep();
  },
  /** Call once at start-up. */
  init(): void {
    apply();
  },
};
