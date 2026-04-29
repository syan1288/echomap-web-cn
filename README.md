# Echo Map (web prototype)

Interactive prototype that **reuses the Pixel Travel Map stack** (React + Leaflet + Carto light tiles + multi-provider image generation) inside the **Echo Map** layout from `docs/echo-map-unified-description.md`.

## Run locally

```bash
cd echomap-web
npm install
cp .env.example .env   # optional — create and set one of the image provider keys
npm run dev
```

- **Gemini**: Set `GEMINI_API_KEY` in `.env` for Google API Key mode, or Vertex credentials for Vertex mode.
- **Default provider**: The app defaults to **Jimeng** for image generation; OpenAI remains available as an optional model switch when `OPENAI_API_KEY` is configured.
- **ChatGPT 图像 2.0**: Set `OPENAI_API_KEY` in `.env`; the sidebar model switch uses the OpenAI image edit path wired through `/api/generate`, with `OPENAI_IMAGE_MODEL=chatgpt-image-latest` by default. Cost-friendly defaults are `OPENAI_IMAGE_SIZE=1024x1024` and `OPENAI_IMAGE_QUALITY=medium`. For OpenAI-compatible gateways like APIMart, also set `OPENAI_BASE_URL` (for APIMart: `https://api.apimart.ai/v1`).
- **APIMart defaults**: When `OPENAI_BASE_URL=https://api.apimart.ai/v1`, the backend automatically switches the same `chatgpt-image` entry to APIMart `gpt-image-2`, using fixed defaults `size=1:1`, `resolution=1k`, `n=1`, and `image_urls` for image-to-image requests while preserving the existing building-style prompt.
- **Jimeng**: Set `JIMENG_ACCESS_KEY_ID` and `JIMENG_SECRET_ACCESS_KEY` in `.env`; image reference uploads still require Supabase login/storage.
- **Standalone API**: `npm run api:start` now auto-loads `.env` and `.env.local` from the repo root.
- **Demo buildings**: Two **locked** sample markers load by default (`App.tsx` → `ECHO_SEED_DEMO_BUILDINGS`). Set to `false` for an empty map and the `ECHO MAP` empty state.

## What’s implemented

- **Home**: 30% / 70% layout, Echo sidebar (Home / Gallery), map chrome (zoom + `PIXEL TRAVEL MAP` label + `?` + language), centered search, Hammer / Camera FABs, import/export/reset as secondary links, cream “Scroll for more / Travel gallery” band, olive **Gallery** section with wave divider.
- **Building states**: Same as upstream: **unlocked** → toolbar + Remix; **locked** → idle until selected; **locked + selected** → dashed ring + fan actions + lock to unlock. Demo assets are **locked + unselected** by default.
- **Modals**: M01 (add building), M02 (travel log / Book), M03/M04 (gallery detail flow).

## Assets

Reference PNGs live under `public/assets/` (figures M01–M04 and numbered screenshots).
