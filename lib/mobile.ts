import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';

type NativeImageSource = 'camera' | 'photos';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

async function blobFromPhoto(photo: {
  webPath?: string;
  dataUrl?: string;
  base64String?: string;
  format?: string;
}): Promise<Blob> {
  if (photo.webPath) {
    const res = await fetch(photo.webPath);
    if (!res.ok) throw new Error(`Unable to read selected photo (${res.status})`);
    return await res.blob();
  }

  if (photo.dataUrl) {
    const res = await fetch(photo.dataUrl);
    if (!res.ok) throw new Error(`Unable to decode selected photo (${res.status})`);
    return await res.blob();
  }

  if (photo.base64String) {
    const mime = `image/${photo.format || 'jpeg'}`;
    const res = await fetch(`data:${mime};base64,${photo.base64String}`);
    if (!res.ok) throw new Error(`Unable to decode selected photo (${res.status})`);
    return await res.blob();
  }

  throw new Error('No image data returned from native picker');
}

export async function pickImageAsFile(
  source: NativeImageSource,
  fileNamePrefix = 'upload'
): Promise<File | null> {
  if (!isNativeApp()) return null;

  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
  });

  const blob = await blobFromPhoto(photo);
  const ext = photo.format || 'jpeg';
  const fileName = `${fileNamePrefix}-${Date.now()}.${ext}`;
  return new File([blob], fileName, { type: blob.type || `image/${ext}` });
}

export async function getNetworkStatus(): Promise<{ connected: boolean; connectionType?: string }> {
  if (!isNativeApp()) {
    return { connected: typeof navigator === 'undefined' ? true : navigator.onLine };
  }
  const status = await Network.getStatus();
  return { connected: status.connected, connectionType: status.connectionType };
}

export async function persistKV(key: string, value: string): Promise<void> {
  await Preferences.set({ key, value });
}

export async function loadKV(key: string): Promise<string | null> {
  const res = await Preferences.get({ key });
  return res.value ?? null;
}

