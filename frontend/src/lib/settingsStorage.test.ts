import { describe, expect, it, vi } from 'vitest';
import {
  loadPersistedUiSettings,
  savePersistedUiSettings,
  UI_SETTINGS_STORAGE_KEY,
  type PersistedUiSettings,
} from './settingsStorage';

const defaults: PersistedUiSettings = {
  text: 'Texte par defaut',
  durationSec: 8,
  fontSize: 155,
  textYRatio: 0.5,
  speedMultiplier: 1,
  paletteName: 'PurpleBlue',
  backgroundColor: '#1f2036',
  stripeColor: '#8f6ad4',
  backgroundZoom: 1,
};

describe('settingsStorage', () => {
  it('loads persisted settings when payload is valid', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        version: 1,
        text: 'Mon texte',
        durationSec: 12,
        fontSize: 180,
        textYRatio: 0.62,
        speedMultiplier: 1.3,
        paletteName: 'Sunset',
        backgroundColor: '#111111',
        stripeColor: '#222222',
        backgroundZoom: 1.4,
      })),
    };

    expect(loadPersistedUiSettings(storage, defaults, ['PurpleBlue', 'Sunset'])).toEqual({
      text: 'Mon texte',
      durationSec: 12,
      fontSize: 180,
      textYRatio: 0.62,
      speedMultiplier: 1.3,
      paletteName: 'Sunset',
      backgroundColor: '#111111',
      stripeColor: '#222222',
      backgroundZoom: 1.4,
    });
  });

  it('falls back to defaults for invalid storage payloads', () => {
    const storage = {
      getItem: vi.fn(() => '{invalid json'),
    };

    expect(loadPersistedUiSettings(storage, defaults, ['PurpleBlue', 'Sunset'])).toEqual(defaults);
  });

  it('falls back per field when a value is invalid', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        version: 1,
        text: 'Mon texte',
        durationSec: '12',
        fontSize: 180,
        textYRatio: 0.62,
        speedMultiplier: 1.3,
        paletteName: 'Inconnue',
        backgroundColor: '#111111',
        stripeColor: '#222222',
        backgroundZoom: null,
      })),
    };

    expect(loadPersistedUiSettings(storage, defaults, ['PurpleBlue', 'Sunset'])).toEqual({
      text: 'Mon texte',
      durationSec: defaults.durationSec,
      fontSize: 180,
      textYRatio: 0.62,
      speedMultiplier: 1.3,
      paletteName: defaults.paletteName,
      backgroundColor: '#111111',
      stripeColor: '#222222',
      backgroundZoom: defaults.backgroundZoom,
    });
  });

  it('writes the current settings to storage', () => {
    const storage = {
      setItem: vi.fn(),
    };

    savePersistedUiSettings(storage, defaults);

    expect(storage.setItem).toHaveBeenCalledWith(
      UI_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        ...defaults,
      }),
    );
  });
});
