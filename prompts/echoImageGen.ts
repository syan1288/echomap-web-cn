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
      return '32-bit pixel art, featuring chunky square pixels with clear edges. Use clearly visible chunky 32 px blocks. Strictly flat color blocks: no blur, no outlines, no gradients on pixel objects.';
    case 'ink':
      return 'ink wash，baimiao, highly detailed，vibrant but elegant colors';
    case 'healing':
      return '治愈绘本插画风，线条随性松散，marker sketch+ charcoal 质感';
    case 'flat':
    default:
      return '扁平插画风，svg（300dpi），细节清晰';
  }
}

export function buildInitialUserPrompt(buildingName?: string, style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const trimmed = buildingName?.trim();
  return trimmed
    ? `建筑名称参考：${trimmed}。风格要求：${buildUserStyleReminder(style)}`
    : `风格要求：${buildUserStyleReminder(style)}`;
}

/** 编辑 / 重生成：用户已有一句自然语言修改指令 */
export function buildEditUserPrompt(
  editInstruction: string,
  buildingName?: string,
  style: BuildingStyleId = DEFAULT_BUILDING_STYLE
): string {
  const base = editInstruction.trim();
  const extra = buildingName?.trim() ? ` 建筑名称参考：${buildingName.trim()}。` : '';
  return `${base}${extra} 风格要求：${buildUserStyleReminder(style)}`.trim();
}
