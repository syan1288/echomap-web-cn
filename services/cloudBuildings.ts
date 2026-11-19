import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { apiUrl } from '../lib/apiBase';
import type { AudioEntry, ProcessedImage, PhotoData, LogData } from '../web/app/webMemoryTypes';
import { normalizeLog } from '../shared/domain/memory/normalizeLog';
import { DEFAULT_BUILDING_STYLE, isBuildingStyleId, type BuildingStyleId } from '../shared/domain/building-style/buildingStyle';

export { isSupabaseConfigured };

export type BuildingRow = {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  width: number;
  height: number;
  flipped_horizontally: boolean;
  is_locked: boolean;
  building_style: string | null;
  content_bounds: { x: number; y: number; width: number; height: number };
  log: Record<string, unknown>;
  processed_image_path: string | null;
  photos: Array<{ path: string; name?: string; photo_id?: string; createdAt?: string }>;
};

type StoredAudioEntry = {
  id: string;
  kind: 'audio' | 'music';
  title: string;
  createdAt: string;
  source: 'recording' | 'upload' | 'builtin';
  path?: string;
  url?: string;
  name?: string;
};

const BUCKET = 'buildings';

type UsageDelta = {
  landmarkCountDelta: number;
  photoCountDelta: number;
  storageBytesDelta: number;
};

const EMPTY_USAGE: UsageDelta = {
  landmarkCountDelta: 0,
  photoCountDelta: 0,
  storageBytesDelta: 0,
};

function hasPositiveUsage(delta: UsageDelta): boolean {
  return delta.landmarkCountDelta > 0 || delta.photoCountDelta > 0 || delta.storageBytesDelta > 0;
}

function positiveUsageDiff(next: UsageDelta, previous: UsageDelta): UsageDelta {
  return {
    landmarkCountDelta: Math.max(0, next.landmarkCountDelta - previous.landmarkCountDelta),
    photoCountDelta: Math.max(0, next.photoCountDelta - previous.photoCountDelta),
    storageBytesDelta: Math.max(0, next.storageBytesDelta - previous.storageBytesDelta),
  };
}

function numberFromLog(log: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = log?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function usageFromRow(row: Pick<BuildingRow, 'photos' | 'log'> | null | undefined): UsageDelta {
  if (!row) return EMPTY_USAGE;
  const log = row.log as Record<string, unknown> | undefined;
  const photoCount = numberFromLog(log, 'usage_photo_count') ?? row.photos?.length ?? 0;
  return {
    landmarkCountDelta: numberFromLog(log, 'usage_landmark_count') ?? 1,
    photoCountDelta: photoCount,
    storageBytesDelta: numberFromLog(log, 'usage_storage_bytes') ?? 0,
  };
}

async function loadStoredUsage(cloudId: string | undefined, userId: string): Promise<UsageDelta> {
  if (!supabase || !cloudId) return EMPTY_USAGE;
  const { data, error } = await supabase
    .from('buildings')
    .select('photos, log')
    .eq('id', cloudId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return EMPTY_USAGE;
  return usageFromRow(data as Pick<BuildingRow, 'photos' | 'log'>);
}

function currentUsageForImage(img: ProcessedImage, processedBlob: Blob): UsageDelta {
  const photoBytes = img.photos.reduce((sum, photo) => sum + Math.max(0, photo.file.size || 0), 0);
  const audioBytes = img.audioEntries.reduce((sum, entry) => sum + Math.max(0, entry.file?.size || 0), 0);
  return {
    landmarkCountDelta: 1,
    photoCountDelta: img.photos.length,
    storageBytesDelta: processedBlob.size + photoBytes + audioBytes,
  };
}

async function postUsageQuota(action: 'consume' | 'release', delta: UsageDelta): Promise<void> {
  if (!hasPositiveUsage(delta)) return;
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const response = await fetch(apiUrl('/api/usage-quota'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...delta }),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; exhausted?: Array<{ kind?: string }> };
  if (!response.ok) {
    const exhausted = body.exhausted?.map((item) => item.kind).filter(Boolean).join(', ');
    throw new Error(body.error || (exhausted ? `Usage quota exhausted: ${exhausted}` : `Usage quota failed (${response.status})`));
  }
}

/**
 * 从 Blob 得到可展示的 HTMLImageElement。
 * 注意：不能在上屏前 revokeObjectURL——Image 的 src 仍指向该 blob 时 revoke 会导致裂图/空白。
 */
async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  if (!blob.size) throw new Error('empty image blob');
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
  if (typeof img.decode === 'function') {
    try {
      await img.decode();
    } catch {
      /* decode 失败时仍保留 onload 后的像素，部分浏览器可忽略 */
    }
  }
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    URL.revokeObjectURL(url);
    throw new Error('image has zero dimensions');
  }
  return img;
}

async function imageElementToPngBlob(el: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = el.naturalWidth;
  canvas.height = el.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(el, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('toBlob failed');
  return blob;
}

/** 列出当前用户的云端建筑并还原为 ProcessedImage。RLS 仍是实际访问控制边界。 */
export async function loadAllCloudBuildings(
  nextLocalId: () => number,
  userId: string
): Promise<ProcessedImage[]> {
  if (!supabase) return [];

  const queryStartedAt = Date.now();
  const { data: rows, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  console.info('[cloud] buildings query complete', {
    elapsedMs: Date.now() - queryStartedAt,
    rowCount: rows?.length ?? 0,
  });
  if (!rows?.length) return [];

  const cloudRows = rows as BuildingRow[];
  const localIds = cloudRows.map(() => nextLocalId());
  return mapWithConcurrency(cloudRows, 3, async (raw, rowIndex) => {
    const rowStartedAt = Date.now();
    const localId = localIds[rowIndex];
    let processedImage: HTMLImageElement | null = null;
    if (raw.processed_image_path) {
      const { data: blob, error: dl } = await supabase.storage.from(BUCKET).download(raw.processed_image_path);
      if (dl) {
        console.warn('[cloud] processed download failed', dl.message);
      } else if (blob) {
        try {
          processedImage = await blobToImage(blob);
        } catch (e) {
          console.warn('[cloud] processed decode failed', e);
          processedImage = null;
        }
      }
    }

    const photos: PhotoData[] = [];
    for (let i = 0; i < (raw.photos?.length ?? 0); i++) {
      const meta = raw.photos[i];
      if (!meta?.path) continue;
      const { data: pb, error: pe } = await supabase.storage.from(BUCKET).download(meta.path);
      if (pe || !pb) {
        console.warn('[cloud] photo download failed', pe?.message);
        continue;
      }
      if (!pb.size) continue;
      const file = new File([pb], meta.name || `photo-${i}.jpg`, { type: pb.type || 'image/jpeg' });
      const url = URL.createObjectURL(file);
      photos.push({
        file,
        url,
        createdAt: meta.createdAt,
        photo_id:
          meta.photo_id ??
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${localId}-${i}`),
      });
    }

    const rawAudioEntries = Array.isArray((raw.log as Record<string, unknown>)?.audio_entries)
      ? ((raw.log as Record<string, unknown>).audio_entries as StoredAudioEntry[])
      : [];
    const audioEntries: AudioEntry[] = [];
    for (let i = 0; i < rawAudioEntries.length; i++) {
      const entry = rawAudioEntries[i];
      if (!entry?.id || !entry?.kind || !entry?.title) continue;
      if (entry.source === 'builtin' && entry.url) {
        audioEntries.push({
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          createdAt: entry.createdAt,
          source: entry.source,
          url: entry.url,
        });
        continue;
      }
      if (!entry.path) continue;
      const { data: ab, error: ae } = await supabase.storage.from(BUCKET).download(entry.path);
      if (ae || !ab || !ab.size) {
        console.warn('[cloud] audio download failed', ae?.message);
        continue;
      }
      const file = new File([ab], entry.name || `audio-${i}.webm`, { type: ab.type || 'audio/webm' });
      const url = URL.createObjectURL(file);
      audioEntries.push({
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        createdAt: entry.createdAt,
        source: entry.source,
        url,
        file,
      });
    }

    /** 抠图加载失败时，用第一张照片顶一张占位图，避免地图上裂图 */
    if (!processedImage && photos[0]) {
      try {
        processedImage = await blobToImage(photos[0].file);
      } catch {
        processedImage = null;
      }
    }

    const style: BuildingStyleId | undefined =
      raw.building_style && isBuildingStyleId(raw.building_style) ? raw.building_style : undefined;

    const log = normalizeLog({
      ...(raw.log as LogData),
      landmark_id: localId,
    });

    const building: ProcessedImage = {
      id: localId,
      cloudId: raw.id,
      processedImage,
      lat: raw.lat,
      lng: raw.lng,
      width: raw.width,
      height: raw.height,
      isGenerating: false,
      contentBounds: raw.content_bounds,
      flippedHorizontally: raw.flipped_horizontally,
      isLocked: raw.is_locked,
      buildingStyle: style ?? DEFAULT_BUILDING_STYLE,
      photos,
      audioEntries,
      log,
      sourceFile: photos[0]?.file,
    };
    console.info('[cloud] building media loaded', {
      rowIndex: rowIndex + 1,
      rowCount: rows.length,
      elapsedMs: Date.now() - rowStartedAt,
      hasProcessedImage: Boolean(processedImage),
      photoCount: photos.length,
      audioCount: audioEntries.length,
    });
    return building;
  });
}

/** 生成完成后的建筑写入 Storage + buildings 表；返回 cloudId（uuid） */
export async function saveBuildingToCloud(img: ProcessedImage, userId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');
  if (!img.processedImage || img.isGenerating) throw new Error('nothing to save');

  const cloudId = img.cloudId ?? crypto.randomUUID();
  const base = `${userId}/${cloudId}`;

  const procPath = `${base}/processed.png`;
  const procBlob = await imageElementToPngBlob(img.processedImage);
  const previousUsage = await loadStoredUsage(img.cloudId, userId);
  const nextUsage = currentUsageForImage(img, procBlob);
  const consumeDelta = positiveUsageDiff(nextUsage, previousUsage);
  const releaseDelta = positiveUsageDiff(previousUsage, nextUsage);
  await postUsageQuota('consume', consumeDelta);

  let saved = false;
  try {
    const { error: upProc } = await supabase.storage.from(BUCKET).upload(procPath, procBlob, {
      upsert: true,
      contentType: 'image/png',
    });
    if (upProc) throw upProc;

    const photoMeta: Array<{ path: string; name?: string; photo_id?: string; createdAt?: string }> = [];
    for (let i = 0; i < img.photos.length; i++) {
      const p = img.photos[i];
      const ext = (p.file.name.split('.').pop() || 'jpg').slice(0, 8);
      const path = `${base}/photo_${i}.${ext}`;
      const { error: upPh } = await supabase.storage.from(BUCKET).upload(path, p.file, {
        upsert: true,
        contentType: p.file.type || 'image/jpeg',
      });
      if (upPh) throw upPh;
      photoMeta.push({ path, name: p.file.name, photo_id: p.photo_id, createdAt: p.createdAt });
    }

    const audioMeta: StoredAudioEntry[] = [];
    for (let i = 0; i < img.audioEntries.length; i++) {
      const entry = img.audioEntries[i];
      if (entry.source === 'builtin') {
        audioMeta.push({
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          createdAt: entry.createdAt,
          source: entry.source,
          url: entry.url,
        });
        continue;
      }
      if (!entry.file) continue;
      const ext = (entry.file.name.split('.').pop() || 'webm').slice(0, 8);
      const path = `${base}/audio_${i}.${ext}`;
      const { error: upAudio } = await supabase.storage.from(BUCKET).upload(path, entry.file, {
        upsert: true,
        contentType: entry.file.type || 'audio/webm',
      });
      if (upAudio) throw upAudio;
      audioMeta.push({
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        createdAt: entry.createdAt,
        source: entry.source,
        path,
        name: entry.file.name,
      });
    }

    const row = {
      id: cloudId,
      user_id: userId,
      lat: img.lat,
      lng: img.lng,
      width: img.width,
      height: img.height,
      flipped_horizontally: Boolean(img.flippedHorizontally),
      is_locked: Boolean(img.isLocked),
      building_style: img.buildingStyle ?? DEFAULT_BUILDING_STYLE,
      content_bounds: img.contentBounds,
      log: {
        ...img.log,
        landmark_id: img.id,
        audio_entries: audioMeta,
        usage_landmark_count: nextUsage.landmarkCountDelta,
        usage_photo_count: nextUsage.photoCountDelta,
        usage_storage_bytes: nextUsage.storageBytesDelta,
      } as unknown as Record<string, unknown>,
      processed_image_path: procPath,
      photos: photoMeta,
    };

    const { error: dbErr } = await supabase.from('buildings').upsert(row, { onConflict: 'id' });
    if (dbErr) throw dbErr;
    saved = true;
  } finally {
    if (!saved && hasPositiveUsage(consumeDelta)) {
      await postUsageQuota('release', consumeDelta).catch((error) => {
        console.warn('[cloud] usage quota rollback failed', error);
      });
    }
  }

  if (hasPositiveUsage(releaseDelta)) {
    await postUsageQuota('release', releaseDelta).catch((error) => {
      console.warn('[cloud] usage quota release failed', error);
    });
  }

  return cloudId;
}

export async function deleteBuildingFromCloud(cloudId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const usage = await loadStoredUsage(cloudId, userId);
  const prefix = `${userId}/${cloudId}`;
  const { data: list } = await supabase.storage.from(BUCKET).list(prefix);
  if (list?.length) {
    const paths = list.map((o) => `${prefix}/${o.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }
  const { error } = await supabase.from('buildings').delete().eq('id', cloudId).eq('user_id', userId);
  if (error) throw error;
  await postUsageQuota('release', usage).catch((releaseError) => {
    console.warn('[cloud] usage quota release failed', releaseError);
  });
}
