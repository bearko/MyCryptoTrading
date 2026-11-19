/**
 * Installing the game as an app (PC only, for now: the phone screens are a simple version still).
 * The browser tells us when it can be installed; the title then shows a button that opens the browser's own prompt.
 */
import { ctx, isWide } from './core';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallEvent | null = null;

/** The browser has offered to install the game, and this is the PC layout. */
export const canInstall = (): boolean => !!offer && isWide();

/** Opens the browser's install prompt. Resolves true when the player accepted. */
export async function install(): Promise<boolean> {
  const event = offer;
  if (!event) return false;
  offer = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  ctx.render();
  return outcome === 'accepted';
}

export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // (the browser's own banner is held back: the title offers it instead)
    event.preventDefault();
    offer = event as InstallEvent;
    ctx.render();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    ctx.render();
  });
}
