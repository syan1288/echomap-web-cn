import {
  DEFAULT_BUILDING_STYLE_PROMPTS,
  getBuiltinBuildingStyles,
  MAX_STYLE_PROMPT_LENGTH,
  type BuildingStyleDefinition,
} from './buildingStyle';

const STORAGE_PREFIX = 'echomap:building-styles:';
const ANONYMOUS_KEY = 'anonymous';

export function getBuildingStyleStorageKey(userId?: string | null): string {
  return `${STORAGE_PREFIX}${userId?.trim() || ANONYMOUS_KEY}`;
}

export function loadBuildingStyles(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  userId?: string | null
): BuildingStyleDefinition[] {
  const builtins = getBuiltinBuildingStyles();
  if (!storage) return builtins;
  try {
    const raw = storage.getItem(getBuildingStyleStorageKey(userId));
    if (!raw) return builtins;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return builtins;
    const byId = new Map(builtins.map((style) => [style.id, style]));
    parsed.forEach((value) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Partial<BuildingStyleDefinition>;
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.prompt !== 'string') return [];
      if (!item.prompt.trim() || item.prompt.length > MAX_STYLE_PROMPT_LENGTH) return [];
      const style: BuildingStyleDefinition = {
        id: item.id,
        name: item.name.trim(),
        prompt: item.prompt.trim(),
        builtin: item.id in DEFAULT_BUILDING_STYLE_PROMPTS || item.builtin === true,
      };
      if (!style.name) return [];
      byId.set(style.id, style);
    });
    return [...builtins.map((style) => byId.get(style.id) || style), ...[...byId.values()].filter((style) => !style.builtin)];
  } catch {
    return builtins;
  }
}

export function saveBuildingStyles(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  styles: BuildingStyleDefinition[],
  userId?: string | null
): void {
  storage?.setItem(getBuildingStyleStorageKey(userId), JSON.stringify(styles));
}

export function upsertBuildingStyle(
  styles: BuildingStyleDefinition[],
  next: Pick<BuildingStyleDefinition, 'id' | 'name' | 'prompt' | 'builtin'>
): BuildingStyleDefinition[] {
  const name = next.name.trim();
  const prompt = next.prompt.trim();
  if (!name) throw new Error('STYLE_NAME_REQUIRED');
  if (!prompt) throw new Error('STYLE_PROMPT_REQUIRED');
  if (prompt.length > MAX_STYLE_PROMPT_LENGTH) throw new Error('STYLE_PROMPT_TOO_LONG');
  const item = { ...next, name, prompt };
  const index = styles.findIndex((style) => style.id === item.id);
  if (index < 0) return [...styles, item];
  return styles.map((style, position) => (position === index ? item : style));
}

export function deleteCustomBuildingStyle(styles: BuildingStyleDefinition[], id: string): BuildingStyleDefinition[] {
  return styles.filter((style) => style.id !== id || style.builtin);
}
