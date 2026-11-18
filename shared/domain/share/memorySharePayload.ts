export type MemorySharePlatform = 'system' | 'wechat' | 'xiaohongshu';

export type MemorySharePayload = {
  ok: true;
  version: 1;
  platform: MemorySharePlatform;
  target: {
    kind: MemorySharePlatform;
    label: string;
    actionLabel: string;
  };
  content: {
    buildingName: string;
    note: string;
    title: string;
    text: string;
    url: string;
    hashtags: string[];
    photoUrls: string[];
    selectedCount: number;
  };
  nativeShare: {
    title: string;
    text: string;
    url: string;
  };
  clipboardText: string;
  handoff: {
    type: 'web-share' | 'clipboard';
    instruction: string;
  };
  createdAt: string;
  shareTitle: string;
  shareText: string;
  shareUrl: string;
  hashtags: string[];
  hint: string;
};

export type MemorySharePayloadResult =
  | { ok: true; payload: MemorySharePayload }
  | { ok: false; status: number; error: string };

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePlatform(value: unknown): MemorySharePlatform | null {
  return value === 'system' || value === 'wechat' || value === 'xiaohongshu' ? value : null;
}

function normalizePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 9);
}

function buildTarget(platform: MemorySharePlatform): MemorySharePayload['target'] {
  if (platform === 'wechat') {
    return {
      kind: platform,
      label: '微信朋友圈',
      actionLabel: 'Share to WeChat Moments',
    };
  }
  if (platform === 'xiaohongshu') {
    return {
      kind: platform,
      label: '小红书',
      actionLabel: 'Share to Xiaohongshu',
    };
  }
  return {
    kind: platform,
    label: '系统分享',
    actionLabel: 'Share via system',
  };
}

export function buildMemorySharePayload(body: Record<string, unknown> | null): MemorySharePayloadResult {
  if (!body) {
    return { ok: false, status: 400, error: 'invalid json body' };
  }

  const platform = normalizePlatform(body.platform);
  if (!platform) {
    return { ok: false, status: 400, error: 'unsupported share platform' };
  }

  const buildingName = cleanText(body.buildingName, 'Echo Map memory');
  const photoUrls = normalizePhotoUrls(body.photoUrls);
  const selectedCount = photoUrls.length;
  const note = cleanText(
    body.note,
    selectedCount > 0
      ? `Sharing ${selectedCount} memory photo${selectedCount > 1 ? 's' : ''} from ${buildingName}.`
      : `Sharing a memory from ${buildingName}.`
  );
  const compactBuilding = buildingName.replace(/\s+/g, '');
  const hashtags =
    platform === 'xiaohongshu'
      ? ['#EchoMap', '#旅行记忆', `#${compactBuilding}`]
      : ['#EchoMap', `#${compactBuilding}`];
  const shareTitle = `${buildingName} · Echo Map`;
  const shareText = [note, hashtags.join(' ')].filter(Boolean).join('\n');
  const shareUrl = photoUrls[0] ?? '';
  const target = buildTarget(platform);
  const clipboardText = [shareTitle, shareText, shareUrl].filter(Boolean).join('\n');
  const handoff =
    platform === 'system'
      ? {
          type: 'web-share' as const,
          instruction: 'Use navigator.share when available; otherwise copy the prepared share text.',
        }
      : {
          type: 'clipboard' as const,
          instruction: `Copy prepared text for ${target.label}; native app handoff can be added later.`,
        };
  const hint =
    platform === 'system'
      ? 'Prepared system share payload.'
      : platform === 'wechat'
        ? 'Prepared WeChat Moments share copy.'
        : 'Prepared Xiaohongshu share copy.';

  return {
    ok: true,
    payload: {
      ok: true,
      version: 1,
      platform,
      target,
      content: {
        buildingName,
        note,
        title: shareTitle,
        text: shareText,
        url: shareUrl,
        hashtags,
        photoUrls,
        selectedCount,
      },
      nativeShare: {
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      },
      clipboardText,
      handoff,
      createdAt: new Date().toISOString(),
      shareTitle,
      shareText,
      shareUrl,
      hashtags,
      hint,
    },
  };
}

