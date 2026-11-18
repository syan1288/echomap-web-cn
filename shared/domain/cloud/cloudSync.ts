import type { ProcessedImage } from '../memory/memoryTypes';
import { DEFAULT_BUILDING_STYLE } from '../building-style/buildingStyle';

export type CloudSaveErrorKind = 'auth' | 'quota' | 'generic';

export function cloudSyncSignature(img: ProcessedImage): string | null {
  if (!img.processedImage || img.isGenerating) return null;
  return JSON.stringify({
    lat: img.lat,
    lng: img.lng,
    width: img.width,
    height: img.height,
    flippedHorizontally: Boolean(img.flippedHorizontally),
    isLocked: Boolean(img.isLocked),
    buildingStyle: img.buildingStyle ?? DEFAULT_BUILDING_STYLE,
    contentBounds: img.contentBounds,
    sourceFileName: img.sourceFile?.name ?? null,
    photos: img.photos.map((photo) => ({
      name: photo.file.name,
      size: photo.file.size,
      type: photo.file.type,
      createdAt: photo.createdAt ?? null,
      photo_id: photo.photo_id ?? null,
    })),
    audioEntries: img.audioEntries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      createdAt: entry.createdAt,
      source: entry.source,
      fileName: entry.file?.name ?? null,
      fileSize: entry.file?.size ?? null,
      url: entry.source === 'builtin' ? entry.url : null,
    })),
    log: img.log,
  });
}

export function isCloudSaveEligible(img: ProcessedImage): boolean {
  return Boolean(img.isLocked && !img.isGenerating && img.processedImage);
}

export function findLockedUnsyncedCloudSaveCandidates<T extends ProcessedImage>(
  images: T[],
  attemptedSignatures: ReadonlyMap<number, string>
): T[] {
  return images.filter((img) => {
    if (img.cloudId || !isCloudSaveEligible(img)) return false;
    const signature = cloudSyncSignature(img);
    if (!signature) return false;
    return attemptedSignatures.get(img.id) !== signature;
  });
}

export function mergeCloudLoadedImages<T extends ProcessedImage>(
  currentImages: T[],
  loadedImages: T[]
): T[] {
  if (currentImages.length === 0) return loadedImages;
  const localDrafts = currentImages.filter((img) => !img.cloudId);
  return localDrafts.length > 0 ? [...loadedImages, ...localDrafts] : loadedImages;
}

export function cloudSaveErrorReason(error: unknown, maxLength = 180): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  const normalized = raw.trim() || 'Unknown error';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}...`;
}

export function cloudSaveErrorKind(error: unknown): CloudSaveErrorKind {
  const reason = cloudSaveErrorReason(error).toLowerCase();
  if (
    reason.includes('login required') ||
    reason.includes('auth_required') ||
    /\b401\b/.test(reason)
  ) {
    return 'auth';
  }
  if (
    reason.includes('quota') ||
    reason.includes('limit') ||
    /\b402\b/.test(reason)
  ) {
    return 'quota';
  }
  return 'generic';
}
