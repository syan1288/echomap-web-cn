import { assertFileSizeOk, MAX_UPLOAD_BYTES } from '../shared/domain/uploads/uploadLimits';
import { apiUrl } from '../lib/apiBase';
import { supabase } from '../lib/supabaseClient';
import type { BuildingStyleId } from '../shared/domain/building-style/buildingStyle';
import { uploadImageAndCreateJimengUrl } from './jimengInputUpload';
export type PreferredImageModel = 'gemini' | 'jimeng' | 'chatgpt-image';

/** 与后端 POST 路径一致；本地由 Vite 插件提供，生产由 VITE_API_BASE_URL 指向的服务提供 */
function generateEndpoint(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    throw new Error(
      'Cannot call /api/generate from file://. Run: cd echomap-web && npm run dev, then open the printed http://localhost:… URL.'
    );
  }
  return apiUrl('/api/generate');
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Vercel Serverless Functions reject request bodies around 4.5 MB. JSON
// Base64 adds roughly 33%, so keep the encoded source comfortably below that
// limit while retaining enough resolution for building recognition.
const MAX_GENERATION_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_GENERATION_IMAGE_DIMENSION = 2048;

const prepareImageForGeneration = async (file: File): Promise<File> => {
  if (file.size <= MAX_GENERATION_IMAGE_BYTES && file.type !== 'image/png') return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to read the selected image.'));
      image.src = objectUrl;
    });
    const scale = Math.min(
      1,
      MAX_GENERATION_IMAGE_DIMENSION / Math.max(source.naturalWidth, source.naturalHeight)
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the selected image.');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    let quality = 0.86;
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    while (blob && blob.size > MAX_GENERATION_IMAGE_BYTES && quality > 0.58) {
      quality -= 0.08;
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }
    if (!blob || blob.size > MAX_GENERATION_IMAGE_BYTES) {
      throw new Error('The selected image is too large to send. Please choose a smaller photo.');
    }
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'upload'}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export interface GenerateImageOptions {
  /** M01 或 geocode 得到的建筑名，用于补充知名地标信息 */
  buildingName?: string;
  /** 编辑/重混时的自然语言指令（与 buildingName 可同时存在） */
  userPrompt?: string;
  /** 与 AddBuildingModal 一致，决定 Vertex systemInstruction 风格 */
  buildingStyle?: BuildingStyleId;
  /** 预留给多模型路由：gemini | 即梦 | chatgpt-image */
  preferredModel?: PreferredImageModel;
}

export const checkGenerationQuota = async (): Promise<void> => {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const res = await fetch(apiUrl('/api/generation-quota'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'check' }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };

  if (!res.ok) {
    if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
      throw new Error('请先登录后再生成 3D 建筑。');
    }
    if (res.status === 402 || data.code === 'GENERATION_QUOTA_EXHAUSTED') {
      throw new Error('免费额度已用完，请购买额度解锁。');
    }
    throw new Error(data.error || `Quota check failed (${res.status})`);
  }
};

/** POST /api/generate：开发时由 Vite 插件转发 Vertex；生产需部署等价接口 */
export const generateImageWithPrompt = async (
  imageFile: File,
  options: GenerateImageOptions = {}
): Promise<{ imageUrl: string | null; text: string | null }> => {
  const sizeCheck = assertFileSizeOk(imageFile);
  if (sizeCheck.ok === false) {
    throw new Error(sizeCheck.message);
  }

  const generationFile = await prepareImageForGeneration(imageFile);
  const imageBase64 = await fileToBase64(generationFile);
  const jimengImageUrls =
    options.preferredModel === 'jimeng' ? [await uploadImageAndCreateJimengUrl(imageFile)] : undefined;
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const res = await fetch(generateEndpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      imageBase64,
      imageUrls: jimengImageUrls,
      mimeType: generationFile.type || 'image/jpeg',
      buildingName: options.buildingName?.trim() || undefined,
      userPrompt: options.userPrompt?.trim() || undefined,
      buildingStyle: options.buildingStyle || undefined,
      preferredModel: options.preferredModel || undefined,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    imageUrl?: string;
    error?: string;
    model?: string;
    requestedModel?: PreferredImageModel;
    backend?: string;
    code?: string;
    requestId?: string;
  };

  if (!res.ok) {
    if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
      throw new Error('请先登录后再生成 3D 建筑。');
    }
    if (res.status === 402 || data.code === 'GENERATION_QUOTA_EXHAUSTED' || data.code === 'API_CALL_QUOTA_EXHAUSTED') {
      throw new Error('免费额度已用完，请购买额度解锁。');
    }
    if (res.status === 404) {
      throw new Error(
        data.error ||
          'POST /api/generate returned 404. Start the app with `npm run dev` or `npm run preview` in echomap-web (static file hosting has no API unless you deploy a backend).'
      );
    }
    if (res.status === 413) {
      throw new Error('图片太大，已超过服务端请求限制。请换一张较小的照片。');
    }
    const message = data.error || `Generate failed (${res.status})`;
    throw new Error(data.requestId ? `${message} (Request ID: ${data.requestId})` : message);
  }
  if (!data.imageUrl) {
    throw new Error(data.error || 'No imageUrl in response');
  }

  return { imageUrl: data.imageUrl, text: null };
};

export { MAX_UPLOAD_BYTES };
