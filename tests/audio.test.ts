import { describe, expect, it } from 'vitest';
import { audio, audioStatus, BGM_NAMES, haptic, hapticSettings, SFX_NAMES, type BgmName, type SfxName } from '../src/ui/audio';

// These run without a browser: no window, no AudioContext, no localStorage.
// The promise of the sound module is that the game can call it anywhere, at any time, and nothing breaks.
describe('sound without a browser', () => {
  it('never throws, whatever is called and in whatever order', () => {
    expect(() => {
      audio.sfx('tap');
      audio.bgm('day');
      audio.unlock();
      audio.unlock();
      for (const name of SFX_NAMES) audio.sfx(name, { pitch: 1.2, volume: 0.5, delay: 0.1 });
      for (const name of BGM_NAMES) audio.bgm(name);
      audio.bgm(null);
      audio.sfx('no-such-sound' as SfxName, { pitch: Number.NaN, volume: -1, delay: -1 });
      audio.bgm('no-such-track' as BgmName);
      audio.setVolume('nothing' as 'se', 2);
      for (const strength of ['light', 'medium', 'heavy', 'double'] as const) haptic(strength);
    }).not.toThrow();
  });

  it('remembers the music asked for before the first gesture', () => {
    audio.bgm('night');
    expect(audioStatus()).toMatchObject({ context: 'locked', wanted: 'night', playing: null });
    audio.bgm(null);
    expect(audioStatus().wanted).toBeNull();
  });

  it('keeps the volumes between 0 and 1', () => {
    audio.setVolume('bgm', 3);
    audio.setVolume('se', -2);
    expect(audio.settings).toEqual({ bgm: 1, se: 0 });
    audio.setVolume('bgm', Number.NaN);
    expect(audio.settings.bgm).toBe(0);
    audio.setVolume('bgm', 0.6);
    audio.setVolume('se', 0.8);
    expect(audio.settings).toEqual({ bgm: 0.6, se: 0.8 });
    // a copy: changing it does not change the setting
    audio.settings.se = 0;
    expect(audio.settings.se).toBe(0.8);
  });

  it('turns vibration on and off', () => {
    expect(hapticSettings.enabled).toBe(true);
    hapticSettings.set(false);
    expect(hapticSettings.enabled).toBe(false);
    hapticSettings.set(true);
    expect(hapticSettings.enabled).toBe(true);
  });

  it('has a sound for every name in the feedback table and a track for every scene', () => {
    expect(new Set(SFX_NAMES).size).toBe(41);
    expect([...BGM_NAMES].sort()).toEqual(['battle', 'boss', 'day', 'dungeon', 'ending', 'night', 'shop', 'title']);
  });
});
