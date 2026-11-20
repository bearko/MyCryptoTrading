/**
 * The one door to the shared platform of bearko.games (login, achievements, total score, RTA, the chat, the
 * numbers on who plays). Nothing else touches `window.BearkoGames`.
 *
 * The game must play to the end without it: the SDK may fail to load (offline, a blocker) or its calls may fail
 * (the title not yet registered). Every call is wrapped; a failure is a console warning and nothing more.
 * The game keeps no cookie of its own: the platform holds the login.
 */
import { version } from '../../package.json';
import { LESSONS } from '../game/guide';
import type { GameState } from '../game/state';

const GAME = 'trading';

/** The least of the SDK that is used here (bearko.games/sdk/v1.js). */
interface Sdk {
  init(opts: Record<string, unknown>): Promise<unknown>;
  tutorialStep(step: number, id: string): void;
  unlockTrophy(id: string): Promise<unknown>;
  submitScore(metrics: Record<string, unknown>, opts?: { quiet?: boolean }): Promise<unknown>;
  rta: { start(opts: Record<string, unknown>): Promise<unknown>; checkpoint(id: string, opts?: { igtMs?: number }): Promise<unknown>; abort(): void };
  chat: { open(): void; setVisible(on: boolean): void };
}

const sdk = (): Sdk | null => (ready ? ((window as unknown as { BearkoGames?: Sdk }).BearkoGames ?? null) : null);
let ready = false;

function guard<T>(what: string, run: (api: Sdk) => T): T | undefined {
  try {
    const api = sdk();
    if (!api) return undefined;
    const out = run(api);
    if (out instanceof Promise) out.catch((err) => console.warn(`[platform] ${what}`, err));
    return out;
  } catch (err) {
    console.warn(`[platform] ${what}`, err);
    return undefined;
  }
}

/** Called once as the game starts. The SDK is a deferred script: if it is not there yet, wait for the page to load. */
export function startPlatform(): void {
  const begin = (): void => {
    if (ready || !(window as unknown as { BearkoGames?: Sdk }).BearkoGames) return;
    ready = true;
    // The chat: the game fills the whole width, so the dock on the right is not used. Its own button is not shown
    // either (every corner of the shop holds something): it is opened from the title and from Settings.
    // Notices come at the top, clear of the shelf.
    guard('init', (api) => api.init({ game: GAME, version, chat: { layout: 'float', button: false }, toast: 'top', toastOffset: 8 }));
    for (const [step, id] of waiting) guard('tutorialStep', (api) => api.tutorialStep(step, id));
    waiting.length = 0;
  };
  begin();
  if (!ready) window.addEventListener('load', begin, { once: true });
}

/** True once the SDK is there (the chat can be offered). */
export const platformOn = (): boolean => ready;

export function openChat(): void {
  guard('chat.open', (api) => api.chat.open());
}

// ---------------------------------------------------------------- the first days, step by step

/**
 * The steps of the guided first days (docs/GAME_DESIGN.md 1c has the table). Once published, a number and its id
 * are never changed: a new step takes a free number.
 */
export const STEPS = {
  start: 0,
  intro_done: 2,
  first_buy: 4,
  first_sale: 6,
  first_close: 8,
  sleep: 10,
  mchc: 15,
  shop: 20,
  case: 25,
  pot: 30,
  loupe: 35,
  hot: 40,
  rent: 45,
  phone: 50,
  houses: 55,
  quest: 60,
  first_rent: 70,
  done: 90,
} as const;

const sent = new Set<string>();
const waiting: [number, string][] = [];

function step(id: keyof typeof STEPS): void {
  if (sent.has(id)) return;
  sent.add(id);
  if (!ready) waiting.push([STEPS[id], id]);
  else guard('tutorialStep', (api) => api.tutorialStep(STEPS[id], id));
}

/**
 * Looks at the game as it stands and reports the steps reached (called on every redraw; each is sent once).
 * Only a guided game counts: an old save, a test or a bot has no `taught` and reports nothing.
 */
export function trackGuide(g: GameState | null, introOver: boolean): void {
  if (!g || !g.taught) return;
  step('start');
  if (!introOver) return;
  step('intro_done');
  if (g.totals.bought > 0) step('first_buy');
  if (g.totals.sold > 0) step('first_sale');
  if (g.day > 1 || g.phase === 'evening') step('first_close');
  for (const lesson of LESSONS) if (g.taught.includes(lesson.id) && g.memoOut !== lesson.id) step(lesson.id);
  // (the first rent is behind: the eighth day has come and the shop still stands)
  if (g.day > 7 && g.phase !== 'lost') step('first_rent');
  if (LESSONS.every((lesson) => g.taught!.includes(lesson.id)) && !g.memoOut) step('done');
}

// ---------------------------------------------------------------- achievements, total score, RTA
// (the doors only: what to send is settled with the platform first — see docs/GAME_DESIGN.md 1d)

export function unlockTrophy(name: string): void {
  guard('unlockTrophy', (api) => api.unlockTrophy(`${GAME}.${name}`));
}

export function submitScore(metrics: Record<string, unknown>, quiet = false): void {
  guard('submitScore', (api) => api.submitScore(metrics, { quiet }));
}

export const rta = {
  start: (regulation: string): void => void guard('rta.start', (api) => api.rta.start({ regulation })),
  checkpoint: (id: string, igtMs?: number): void => void guard('rta.checkpoint', (api) => api.rta.checkpoint(id, { igtMs })),
  abort: (): void => void guard('rta.abort', (api) => api.rta.abort()),
};
