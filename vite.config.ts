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
    SUPABASE_URL: process.env.SUPABASE_URL ?? loaded.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? loaded.SUPABASE_ANON_KEY,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? loaded.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? loaded.VITE_SUPABASE_ANON_KEY,
    ECHO_GENERATION_QUOTA_ENABLED:
      process.env.ECHO_GENERATION_QUOTA_ENABLED ?? loaded.ECHO_GENERATION_QUOTA_ENABLED,
    ECHO_ENTITLEMENTS_STORE_PATH:
      process.env.ECHO_ENTITLEMENTS_STORE_PATH ?? loaded.ECHO_ENTITLEMENTS_STORE_PATH,
    ECHO_FREE_STARTER_GENERATIONS:
      process.env.ECHO_FREE_STARTER_GENERATIONS ?? loaded.ECHO_FREE_STARTER_GENERATIONS,
    ECHO_FREE_MONTHLY_GENERATIONS:
      process.env.ECHO_FREE_MONTHLY_GENERATIONS ?? loaded.ECHO_FREE_MONTHLY_GENERATIONS,
    ECHO_PLUS_MONTHLY_GENERATIONS:
      process.env.ECHO_PLUS_MONTHLY_GENERATIONS ?? loaded.ECHO_PLUS_MONTHLY_GENERATIONS,
    ECHO_PRO_MONTHLY_GENERATIONS:
      process.env.ECHO_PRO_MONTHLY_GENERATIONS ?? loaded.ECHO_PRO_MONTHLY_GENERATIONS,
    ECHO_INITIAL_EXTRA_CREDITS:
      process.env.ECHO_INITIAL_EXTRA_CREDITS ?? loaded.ECHO_INITIAL_EXTRA_CREDITS,
    ECHO_PAYMENT_ORDERS_PATH: process.env.ECHO_PAYMENT_ORDERS_PATH ?? loaded.ECHO_PAYMENT_ORDERS_PATH,
    ECHO_PLUS_PAYMENT_URL: process.env.ECHO_PLUS_PAYMENT_URL ?? loaded.ECHO_PLUS_PAYMENT_URL,
    ECHO_PRO_PAYMENT_URL: process.env.ECHO_PRO_PAYMENT_URL ?? loaded.ECHO_PRO_PAYMENT_URL,
    ECHO_PLUS_PAYMENT_AMOUNT_CNY:
      process.env.ECHO_PLUS_PAYMENT_AMOUNT_CNY ?? loaded.ECHO_PLUS_PAYMENT_AMOUNT_CNY,
    ECHO_PRO_PAYMENT_AMOUNT_CNY:
      process.env.ECHO_PRO_PAYMENT_AMOUNT_CNY ?? loaded.ECHO_PRO_PAYMENT_AMOUNT_CNY,
    ECHO_PLUS_PAYMENT_CREDITS: process.env.ECHO_PLUS_PAYMENT_CREDITS ?? loaded.ECHO_PLUS_PAYMENT_CREDITS,
    ECHO_PRO_PAYMENT_CREDITS: process.env.ECHO_PRO_PAYMENT_CREDITS ?? loaded.ECHO_PRO_PAYMENT_CREDITS,
    ECHO_PLUS_PAYMENT_INSTRUCTIONS:
      process.env.ECHO_PLUS_PAYMENT_INSTRUCTIONS ?? loaded.ECHO_PLUS_PAYMENT_INSTRUCTIONS,
    ECHO_PRO_PAYMENT_INSTRUCTIONS:
      process.env.ECHO_PRO_PAYMENT_INSTRUCTIONS ?? loaded.ECHO_PRO_PAYMENT_INSTRUCTIONS,
  };
  return {
    plugins: [echoApiPlugin(env)],
    build: {
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/@supabase/')) return 'vendor-supabase';
            if (id.includes('/mapbox-gl/')) return 'vendor-mapbox';
            if (id.includes('/tone/')) return 'vendor-audio';
            if (id.includes('/@google/genai/')) return 'vendor-ai';
            return 'vendor';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
