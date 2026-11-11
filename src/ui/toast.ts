import { audio, haptic } from './audio';
import { layer } from './motion';

/** A short note under the HUD (no room, not allowed, done …). It leaves by itself. */
export function note(text: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
  const host = layer();
  for (const old of host.querySelectorAll('.toast')) old.remove();
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', 'status');
  el.textContent = text;
  host.appendChild(el);
  if (tone === 'bad') {
    audio.sfx('error');
    haptic('double');
  }
  window.setTimeout(() => el.classList.add('out'), 1700);
  window.setTimeout(() => el.remove(), 2000);
}
