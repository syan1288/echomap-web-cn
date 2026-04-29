/**
 * Echo Map 建筑图生图：user 侧文案；system 侧见 `buildingStyle.ts` 的 buildEchoImageSystemInstruction。
 */

import {
  buildEchoImageSystemInstruction,
  DEFAULT_BUILDING_STYLE,
  type BuildingStyleId,
} from './buildingStyle.js';

export { buildEchoImageSystemInstruction, DEFAULT_BUILDING_STYLE, type BuildingStyleId };

function buildUserStyleReminder(style: BuildingStyleId): string {
  switch (style) {
    case 'pixel':
      return '精致等距像素建筑风。像素块必须清晰可见，结构规整，限制色盘，偏旅行游戏地图资产质感。禁止平滑渐变、模糊、厚涂、Q版玩具感、荧光高饱和儿童手游皮肤风。';
    case 'ink':
      return '水墨白描建筑风。以墨线、淡墨、极低饱和矿物淡彩为主，强调建筑轮廓、屋顶、窗洞和体块关系，气质克制安静。禁止高饱和儿童插画配色、可爱卡通脸、贴纸感。';
    case 'healing':
      return '治愈旅行绘本插画风。柔和、低饱和、纸面质感，像成熟旅行手账或杂志插画；可以有轻微彩铅/蜡笔/水粉肌理，但建筑结构要准。禁止幼态儿童画、糖果色、玩具摆件感。';
    case 'flat':
    default:
      return '高级扁平建筑插画风。几何块面清晰、边缘干净、配色克制偏杂志编辑插画，适合地图地标收藏。禁止儿童简笔画、过亮高饱和、表情贴纸、廉价卡通风。';
  }
}

export function buildInitialUserPrompt(buildingName?: string, style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const trimmed = buildingName?.trim();
  return trimmed
    ? `建筑名称参考：${trimmed}。请保留原建筑的核心轮廓、体块、屋顶和可识别地标特征，只重绘风格，不要改造成完全陌生的幻想建筑。风格要求：${buildUserStyleReminder(style)}`
    : `请保留原建筑的核心轮廓、体块、屋顶和可识别地标特征，只重绘风格，不要改造成完全陌生的幻想建筑。风格要求：${buildUserStyleReminder(style)}`;
}

/** 编辑 / 重生成：用户已有一句自然语言修改指令 */
export function buildEditUserPrompt(
  editInstruction: string,
  buildingName?: string,
  style: BuildingStyleId = DEFAULT_BUILDING_STYLE
): string {
  const base = editInstruction.trim();
  const extra = buildingName?.trim() ? ` 建筑名称参考：${buildingName.trim()}。` : '';
  return `${base}${extra} 请保留原建筑的可识别地标特征，只在现有结构上调整。风格要求：${buildUserStyleReminder(style)}`.trim();
}
