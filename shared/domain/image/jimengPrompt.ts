export const JIMENG_PROMPT_MAX_CHARS = 800;

const IMMUTABLE_BUILDING_RULES =
  '保留建筑主体轮廓、屋顶、体块与地标识别度；去除背景、人物、车辆、天空、地面等。仅输出一个独立建筑立绘，透明或纯白背景，PNG。';

function takeWithinLimit(value: string, remaining: number): string {
  if (remaining <= 0) return '';
  return value.trim().slice(0, remaining);
}

export function buildJimengPrompt(args: {
  buildingName?: string;
  stylePrompt?: string;
  userPrompt?: string;
}): string {
  const sections = [`固定建筑规则：${IMMUTABLE_BUILDING_RULES}`];
  const name = args.buildingName?.trim();
  if (name) sections.push(`建筑名称参考：${name}`);

  const prefix = `${sections.join(' ')} 风格要求：`;
  const remaining = JIMENG_PROMPT_MAX_CHARS - prefix.length;
  const style = takeWithinLimit(args.stylePrompt || '', Math.max(0, remaining));
  let prompt = `${prefix}${style}`;

  if (args.userPrompt?.trim()) {
    const editPrefix = `${prompt} 补充指令：`;
    prompt = `${editPrefix}${takeWithinLimit(
      args.userPrompt,
      Math.max(0, JIMENG_PROMPT_MAX_CHARS - editPrefix.length)
    )}`;
  }

  return prompt.slice(0, JIMENG_PROMPT_MAX_CHARS);
}
