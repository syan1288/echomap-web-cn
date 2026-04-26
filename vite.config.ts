import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { echoApiPlugin } from './vite-plugin-echo-api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 始终从本文件所在目录（echomap-web）读 .env，避免在上一级目录执行 npm run 时读不到变量 */
const envDir = path.resolve(__dirname);

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, envDir, '');
  /** 终端里 export 的变量也生效（并覆盖同名 .env，便于临时调试） */
  const env = {
    ...loaded,
    API_KEY: process.env.API_KEY ?? loaded.API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? loaded.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? loaded.OPENAI_API_KEY,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL ?? loaded.OPENAI_IMAGE_MODEL,
    JIMENG_ACCESS_KEY_ID: process.env.JIMENG_ACCESS_KEY_ID ?? loaded.JIMENG_ACCESS_KEY_ID,
    JIMENG_SECRET_ACCESS_KEY:
      process.env.JIMENG_SECRET_ACCESS_KEY ?? loaded.JIMENG_SECRET_ACCESS_KEY,
    JIMENG_BASE_URL: process.env.JIMENG_BASE_URL ?? loaded.JIMENG_BASE_URL,
    JIMENG_REQ_KEY: process.env.JIMENG_REQ_KEY ?? loaded.JIMENG_REQ_KEY,
    JIMENG_REGION: process.env.JIMENG_REGION ?? loaded.JIMENG_REGION,
    JIMENG_SERVICE: process.env.JIMENG_SERVICE ?? loaded.JIMENG_SERVICE,
    ARK_API_KEY: process.env.ARK_API_KEY ?? loaded.ARK_API_KEY,
    ARK_BASE_URL: process.env.ARK_BASE_URL ?? loaded.ARK_BASE_URL,
    JIMENG_API_KEY: process.env.JIMENG_API_KEY ?? loaded.JIMENG_API_KEY,
    JIMENG_API_BASE_URL: process.env.JIMENG_API_BASE_URL ?? loaded.JIMENG_API_BASE_URL,
    JIMENG_IMAGE_MODEL: process.env.JIMENG_IMAGE_MODEL ?? loaded.JIMENG_IMAGE_MODEL,
    JIMENG_SIZE: process.env.JIMENG_SIZE ?? loaded.JIMENG_SIZE,
    JIMENG_SCALE: process.env.JIMENG_SCALE ?? loaded.JIMENG_SCALE,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ?? loaded.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION ?? loaded.GOOGLE_CLOUD_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS:
      process.env.GOOGLE_APPLICATION_CREDENTIALS ?? loaded.GOOGLE_APPLICATION_CREDENTIALS,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL ?? loaded.GEMINI_IMAGE_MODEL,
    ECHO_IMAGE_MODEL: process.env.ECHO_IMAGE_MODEL ?? loaded.ECHO_IMAGE_MODEL,
    ECHO_PREFER_API_KEY: process.env.ECHO_PREFER_API_KEY ?? loaded.ECHO_PREFER_API_KEY,
  };
  return {
    plugins: [echoApiPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
