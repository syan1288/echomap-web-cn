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
  '仅针对图中主体建筑，创建单体建筑立绘。构图为干净的等距/3D 视角，建筑主体完整，透明背景，无地面、无天空、无人物、无植被、无阴影、无边框，输出 png。整体必须像可收藏的旅行地标建筑插画，而不是儿童画、玩具、贴纸、Q版摆件或卡通表情。颜色克制，避免高饱和霓虹糖果色，避免幼态、廉价、花哨。';

/**
 * Vertex `systemInstruction`：仅通用约束（不含风格）。
 * 风格通过 user prompt（buildInitialUserPrompt / buildEditUserPrompt）传递。
 */
export function buildEchoImageSystemInstruction(_style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  switch (_style) {
    case 'pixel':
      return `${ECHO_SYSTEM_BASE_CN} 风格额外约束：像素风必须是真正的像素建筑立绘，边缘清晰，像素块明确，限制色盘，避免平滑渐变、模糊、发光特效和手游儿童皮肤感。`;
    case 'ink':
      return `${ECHO_SYSTEM_BASE_CN} 风格额外约束：水墨风必须保留建筑结构识别度，以白描线稿和低饱和墨色/淡彩为主，留白克制，避免鲜艳儿童插画配色。`;
    case 'healing':
      return `${ECHO_SYSTEM_BASE_CN} 风格额外约束：治愈绘本风应安静、成熟、柔和，像旅行随笔插画，不要幼儿园绘本、卡通吉祥物或高饱和可爱风。`;
    case 'flat':
    default:
      return `${ECHO_SYSTEM_BASE_CN} 风格额外约束：扁平插画风应更像编辑插画/品牌插画，几何块面清晰，颜色克制，不要儿童简笔画、廉价卡通或高饱和贴纸风。`;
  }
}
