export interface PersistedUiSettings {
  text: string;
  durationSec: number;
  fontSize: number;
  textYRatio: number;
  speedMultiplier: number;
  paletteName: string;
  backgroundColor: string;
  stripeColor: string;
  backgroundZoom: number;
}

interface PersistedUiSettingsPayload extends PersistedUiSettings {
  version: 1;
}

export const UI_SETTINGS_STORAGE_KEY = 'titre-ckc.ui-settings';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const readNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const loadPersistedUiSettings = (
  storage: Pick<Storage, 'getItem'> | undefined,
  defaults: PersistedUiSettings,
  validPaletteNames: readonly string[],
): PersistedUiSettings => {
  if (!storage) {
    return defaults;
  }

  try {
    const raw = storage.getItem(UI_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return defaults;
    }

    const paletteName = readString(parsed.paletteName, defaults.paletteName);

    return {
      text: readString(parsed.text, defaults.text),
      durationSec: readNumber(parsed.durationSec, defaults.durationSec),
      fontSize: readNumber(parsed.fontSize, defaults.fontSize),
      textYRatio: readNumber(parsed.textYRatio, defaults.textYRatio),
      speedMultiplier: readNumber(parsed.speedMultiplier, defaults.speedMultiplier),
      paletteName: validPaletteNames.includes(paletteName) ? paletteName : defaults.paletteName,
      backgroundColor: readString(parsed.backgroundColor, defaults.backgroundColor),
      stripeColor: readString(parsed.stripeColor, defaults.stripeColor),
      backgroundZoom: readNumber(parsed.backgroundZoom, defaults.backgroundZoom),
    };
  } catch {
    return defaults;
  }
};

export const savePersistedUiSettings = (
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: PersistedUiSettings,
): void => {
  if (!storage) {
    return;
  }

  const payload: PersistedUiSettingsPayload = {
    version: 1,
    ...settings,
  };

  storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
};
