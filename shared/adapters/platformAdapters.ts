export type PlatformTarget = 'web' | 'mobile';

export interface PortableFile {
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  lastModified?: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyMeters?: number;
}

export type MediaSource = 'camera' | 'photos' | 'files';

export interface MediaPickerAdapter {
  pickImage(source: MediaSource): Promise<PortableFile | null>;
}

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
  files?: PortableFile[];
}

export interface ShareAdapter {
  canShare(payload?: SharePayload): Promise<boolean>;
  share(payload: SharePayload): Promise<void>;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface NetworkStatus {
  connected: boolean;
  connectionType?: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
}

export interface NetworkAdapter {
  getStatus(): Promise<NetworkStatus>;
}

export interface LocationAdapter {
  getCurrentPosition(): Promise<GeoPoint | null>;
}

export interface ClipboardAdapter {
  writeText(text: string): Promise<void>;
}

export interface FileExportAdapter {
  saveFile(file: PortableFile): Promise<void>;
}

export interface PermissionAdapter {
  request(permission: 'camera' | 'photos' | 'location' | 'microphone'): Promise<'granted' | 'denied' | 'prompt' | 'unknown'>;
}

export interface PlatformAdapters {
  target: PlatformTarget;
  mediaPicker: MediaPickerAdapter;
  share: ShareAdapter;
  storage: StorageAdapter;
  network: NetworkAdapter;
  location: LocationAdapter;
  clipboard: ClipboardAdapter;
  fileExport: FileExportAdapter;
  permissions: PermissionAdapter;
}

