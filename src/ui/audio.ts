/**
 * Sound. Screens call only this API (docs/UI_DIRECTION.md §6).
 * STUB: the signatures are the contract; the implementation is replaced by the audio work.
 */
export type SfxName =
  | 'tap' | 'confirm' | 'cancel' | 'open' | 'close' | 'error'
  | 'pick' | 'drop' | 'dropBad' | 'rotate'
  | 'shutterUp' | 'shutterDown' | 'step' | 'voice' | 'bell' | 'door'
  | 'buy' | 'coin' | 'coinBig' | 'haggleOk' | 'refuse' | 'angry'
  | 'receipt' | 'stamp' | 'rent' | 'event' | 'equip'
  | 'stairs' | 'found' | 'encounter' | 'hit' | 'hitBig' | 'heal' | 'buff' | 'debuff' | 'status' | 'run' | 'miss'
  | 'win' | 'lose' | 'fanfare';

export type BgmName = 'title' | 'day' | 'night' | 'shop' | 'dungeon' | 'battle' | 'boss' | 'ending';

export interface AudioSettings {
  /** 0–1 */
  bgm: number;
  /** 0–1 */
  se: number;
}

export interface SfxOptions {
  /** playback rate / pitch multiplier (1 = normal). `voice` uses this for a customer's temper */
  pitch?: number;
  /** 0–1, multiplied with the SE volume */
  volume?: number;
  /** seconds to wait before playing */
  delay?: number;
}

export const audio = {
  /** Call on the first pointer / key event: browsers allow sound only after a gesture. Safe to call often. */
  unlock(): void {},
  /** Plays a sound effect. Never throws; silent until unlocked. */
  sfx(_name: SfxName, _opts?: SfxOptions): void {},
  /** Switches the music with a 600ms crossfade. Null fades to silence. The same track again is a no-op. */
  bgm(_track: BgmName | null): void {},
  /** Current volumes (kept in localStorage). */
  get settings(): AudioSettings {
    return { bgm: 0.6, se: 0.8 };
  },
  setVolume(_kind: 'bgm' | 'se', _value: number): void {},
};

/** Vibration on phones that have it (docs/UI_DIRECTION.md §6). Off when the setting is off. */
export function haptic(_strength: 'light' | 'medium' | 'heavy' | 'double'): void {}
export const hapticSettings = {
  get enabled(): boolean {
    return true;
  },
  set(_on: boolean): void {},
};
