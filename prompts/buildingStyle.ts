/**
 * 建筑生成风格：与 AddBuildingModal、Vertex systemInstruction 对齐。
 */

export const BUILDING_STYLE_IDS = ['flat', 'pixel', 'ink', 'healing'] as const;
export type BuildingStyleId = (typeof BUILDING_STYLE_IDS)[number];

export const DEFAULT_BUILDING_STYLE: BuildingStyleId = 'flat';

export const BUILDING_STYLE_OPTIONS: { id: BuildingStyleId; label: string }[] = [
  { id: 'flat', label: 'Flat illustration art' },
  { id: 'pixel', label: 'Pixel art' },
  { id: 'ink', label: 'Ink painting art' },
  { id: 'healing', label: 'Healing illustration art' },
];

export function isBuildingStyleId(s: string | undefined | null): s is BuildingStyleId {
  return s != null && (BUILDING_STYLE_IDS as readonly string[]).includes(s);
}

const ECHO_SYSTEM_BASE_CN =
  '仅针对图中主体建筑，创建一个3D 等距视角建筑。建筑应被单独分离，无任何背景，无阴影，png。';

/**
 * Vertex `systemInstruction`：仅通用约束（不含风格）。
 * 风格通过 user prompt（buildInitialUserPrompt / buildEditUserPrompt）传递。
 */
export function buildEchoImageSystemInstruction(_style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  return ECHO_SYSTEM_BASE_CN;
}
