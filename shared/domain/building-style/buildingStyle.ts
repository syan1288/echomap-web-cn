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

export interface BuildingStyleDefinition {
  id: string;
  name: string;
  prompt: string;
  builtin: boolean;
}

export const MAX_STYLE_PROMPT_LENGTH = 2_000;

export const DEFAULT_BUILDING_STYLE_PROMPTS: Record<BuildingStyleId, string> = {
  flat:
    '高级扁平建筑插画风。几何块面清晰、边缘干净、配色克制偏杂志编辑插画，适合地图地标收藏。禁止儿童简笔画、过亮高饱和、表情贴纸、廉价卡通风。',
  pixel:
    '精致等距像素建筑风。像素块必须清晰可见，结构规整，限制色盘，偏旅行游戏地图资产质感。禁止平滑渐变、模糊、厚涂、Q版玩具感、荧光高饱和儿童手游皮肤风。',
  ink:
    '水墨白描建筑风。以墨线、淡墨、极低饱和矿物淡彩为主，强调建筑轮廓、屋顶、窗洞和体块关系，气质克制安静。禁止高饱和儿童插画配色、可爱卡通脸、贴纸感。',
  healing:
    '治愈旅行绘本插画风。柔和、低饱和、纸面质感，像成熟旅行手账或杂志插画；可以有轻微彩铅、蜡笔或水粉肌理，但建筑结构要准。禁止幼态儿童画、糖果色、玩具摆件感。',
};

export function getBuiltinBuildingStyles(): BuildingStyleDefinition[] {
  return BUILDING_STYLE_OPTIONS.map(({ id, label }) => ({
    id,
    name: label,
    prompt: DEFAULT_BUILDING_STYLE_PROMPTS[id],
    builtin: true,
  }));
}

export function isBuildingStyleId(s: string | undefined | null): s is BuildingStyleId {
  return s != null && (BUILDING_STYLE_IDS as readonly string[]).includes(s);
}

const ECHO_SYSTEM_BASE_CN =
  '输入照片只作为建筑结构参考，不要保留、拼接或复刻原照片的整张画面。先定位主体建筑的真实像素范围，只针对主体建筑本身创建一个完整、独立的地标建筑立绘；忽略并彻底删除建筑以外的所有内容。输入图中的棋盘格透明预览、白色背景、天空、地面、人物、游客、车辆、植被、招牌、文字、聊天窗口、评论区、按钮、应用界面、截图边框、虚线、圆弧、标记、Logo、水印和任何其他 UI 残片都不是建筑内容，绝对不能出现在输出中。必须从屋顶最高点一直完整呈现到地基、底座或台阶，包含建筑的完整主体、屋顶、墙体、立面、支撑结构、入口和底部轮廓；不得裁切顶部、底部、左右两侧，不得只生成局部立面、门窗、屋顶或建筑碎片，不得让任何 UI、卡片、图标或物体遮挡建筑。即使输入照片有遮挡，也要根据可见结构合理补全被遮挡的建筑部分，保持比例、透视和结构连续，不能输出半透明、褪色、幽灵化或悬空的建筑。建筑应居中完整地放在画布中，四周保留约 8%–12% 的透明安全边距，主体占画布高度约 65%–85%，确保完整轮廓清楚可见。必须抠出建筑轮廓并重绘为单体建筑资产，边缘干净、无背景残留、无光晕、无阴影、无外框；输出画布除建筑主体像素外全部为真正透明区域，禁止白色、彩色或灰色背景，优先输出带 alpha 通道的透明 PNG，不要绘制棋盘格来模拟透明。只输出一张完整建筑图，不要输出解释、文字、场景拼贴或多个对象。构图为干净的等距/3D 视角，保留建筑主体轮廓、屋顶、体块和地标识别度。整体必须像可收藏的旅行地标建筑插画，而不是照片拼贴、儿童画、玩具、贴纸、Q版摆件或卡通表情。颜色克制，避免高饱和霓虹糖果色，避免幼态、廉价、花哨。';

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
