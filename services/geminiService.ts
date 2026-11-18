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

  const imageBase64 = await fileToBase64(imageFile);
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
      mimeType: imageFile.type || 'image/jpeg',
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
    const message = data.error || `Generate failed (${res.status})`;
    throw new Error(data.requestId ? `${message} (Request ID: ${data.requestId})` : message);
  }
  if (!data.imageUrl) {
    throw new Error(data.error || 'No imageUrl in response');
  }

  return { imageUrl: data.imageUrl, text: null };
};

export { MAX_UPLOAD_BYTES };
