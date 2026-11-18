import type {
  AudioEntry as SharedAudioEntry,
  LogData,
  PhotoData as SharedPhotoData,
  ProcessedImage as SharedProcessedImage,
} from '../../shared/domain/memory/memoryTypes';

export type { LogData };

export type PhotoData = SharedPhotoData<File>;
export type AudioEntry = SharedAudioEntry<File>;
export type ProcessedImage = SharedProcessedImage<File, HTMLImageElement>;

