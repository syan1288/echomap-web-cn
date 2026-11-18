# EchoMap Mobile Parity Current Status

Updated: 2026-05-13

## Current Branch

- Branch: `codex/mobile-parity`
- Base commit: `96d55f8 Add Gemini token probe to health check`
- The branch currently points to the same commit as `main` / `origin/main`.
- All mobile-parity work is still local and uncommitted.

## What Is Running

Mobile dev server is running with the mobile target:

```bash
VITE_APP_TARGET=mobile npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

The in-app browser may display this as `http://localhost:5173/`; both point to the same local app.

## Verified Builds

Both web and mobile Vite builds have passed in the current workspace.

Web:

```bash
npm run build
```

Mobile build check:

```bash
VITE_APP_TARGET=mobile /Applications/Codex.app/Contents/Resources/node ./node_modules/vite/bin/vite.js build --outDir /private/tmp/echomap-mobile-build-check --emptyOutDir
```

Latest mobile check output was written under:

```text
/private/tmp/echomap-mobile-build-check
```

## Android State

Android project files exist under `android/`, and release artifacts exist:

```text
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
android/keystore/echomap-release.jks
```

Important: those APK/AAB artifacts are dated 2026-04-28, so they are not confirmed to include the latest mobile UI and shared-layer work. Before sharing an install package, run a fresh Android release build.

Relevant scripts:

```bash
npm run android:sync
npm run android:apk:release:local
npm run android:bundle:release:local
```

## Main Local Work Completed

- Added `shared/`, `web/`, and `mobile/` directory structure for the mobile-parity split.
- Added `mobile/app/MobileApp.tsx` and `mobile/components/MobileShell.tsx`.
- Added mobile bottom-tab shell, gallery, settings sheet, map view, and login flow.
- Moved platform-independent domain logic toward `shared/domain/*`.
- Added shared adapter contract in `shared/adapters/platformAdapters.ts`.
- Added share payload and memory share service scaffolding.
- Added Capacitor config and Android project scaffolding.
- Updated Vite config and package scripts for mobile target and Android build flow.

## Recent UI Work

Recent mobile UI changes include:

- Home uses Echo brand illustration in compact mobile layout.
- Bottom navigation uses white idle orbs and subtler active/hover glow.
- Settings opens as a bottom sheet and can be closed.
- Gallery detail modal supports photo selection, share actions, delete confirmation, and immersive photo review.
- Mobile map memory cards have safer vertical placement near selected markers.
- Gallery immersive close control is icon-only.

## Current Git Shape

The working tree is intentionally large because this branch includes shared-layer extraction, mobile shell work, and Android scaffolding in one pass.

Recommended commit split:

1. `shared/` domain and adapter extraction.
2. `web/` desktop wrapper and import boundary cleanup.
3. `mobile/` app shell and UI.
4. Gallery/share interaction changes.
5. Capacitor and Android build scaffolding.
6. Documentation and release playbook updates.

Do not split this into separate repositories now. The product goal is shared business logic with separate Web and Mobile shells; separate repos would make parity harder.

## Cleanup Notes

Safe cleanup candidates:

```text
/private/tmp/echomap-mobile-build-check
android/app/build
```

Keep for now:

```text
tools/
node_modules/
android/keystore/
```

`tools/` contains local Android/JDK tooling used by the existing release scripts. It is large but useful for repeatable local builds.

## Recommended Next Steps

1. Review the mobile app visually at `http://127.0.0.1:5173/`.
2. Fix any obvious mobile layout issues before Android packaging.
3. Run `npm run build` and the mobile build check again after UI edits.
4. Run `npm run android:sync`.
5. Produce a fresh APK or AAB with the local release script.
6. Commit the work in the split listed above.

