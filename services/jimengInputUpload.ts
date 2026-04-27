import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const BUCKET = 'buildings';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function makeObjectId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `jimeng-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileExt(file: File): string {
  const byName = file.name.split('.').pop()?.trim().toLowerCase();
  if (byName) return byName.slice(0, 8);
  const byMime = (file.type || 'image/jpeg').split('/')[1]?.trim().toLowerCase();
  return byMime ? byMime.slice(0, 8) : 'jpg';
}

export async function uploadImageAndCreateJimengUrl(file: File): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('即梦 4.6 需要已配置的 Supabase Storage。');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) {
    throw new Error('使用即梦 4.6 前请先登录，以便上传参考图并生成临时访问链接。');
  }

  const objectPath = `${user.id}/jimeng-inputs/${makeObjectId()}.${fileExt(file)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
    upsert: false,
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
  });
  if (uploadError) throw uploadError;

  const { data, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (signedError) throw signedError;
  if (!data?.signedUrl) {
    throw new Error('未能为即梦 4.6 生成图片访问链接。');
  }
  return data.signedUrl;
}
