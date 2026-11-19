import type { BuildingStyleId } from '../building-style/buildingStyle';

export interface MemoryFileLike {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
}

export interface MemoryImageLike {
  src: string;
}

export interface LogData {
  location: string;
  /** 添加建筑时用户输入的名称（与 geocode 后的城市/地址 location 分开存） */
  buildingName?: string;
  date: string;
  partner: string;
  moon: string;
  musings: string;
  avatarVariant?: number;
  memory_id?: string;
  /** 与 ProcessedImage.id 一致，随笔与建筑绑定 */
  landmark_id?: number;
}

export interface PhotoData<TFile extends MemoryFileLike = MemoryFileLike> {
  url: string;
  file: TFile;
  photo_id?: string;
  createdAt?: string;
}

export interface AudioEntry<TFile extends MemoryFileLike = MemoryFileLike> {
  id: string;
  kind: 'audio' | 'music';
  title: string;
  url: string;
  createdAt: string;
  source: 'recording' | 'upload' | 'builtin';
  file?: TFile;
}

export interface ProcessedImage<
  TFile extends MemoryFileLike = MemoryFileLike,
  TImage extends MemoryImageLike = MemoryImageLike,
> {
  id: number;
  /** Supabase public.buildings.id（uuid），有则更新云端，无则首次插入 */
  cloudId?: string;
  sourceFile?: TFile;
  sourceText?: string;
  processedImage: TImage | null;
  showOriginal?: boolean;
  lat: number;
  lng: number;
  width: number;
  height: number;
  isGenerating: boolean;
  contentBounds: { x: number; y: number; width: number; height: number };
  flippedHorizontally?: boolean;
  isLocked?: boolean;
  photos: PhotoData<TFile>[];
  audioEntries: AudioEntry<TFile>[];
  log: LogData;
  /** 生成时使用的建筑风格，用于再生成时沿用 */
  buildingStyle?: BuildingStyleId;
}
