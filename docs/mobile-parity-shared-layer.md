# EchoMap Mobile Parity 共享层目录方案

目标：Web 保留当前桌面表达，Mobile 单独建设手机 UI 壳；业务逻辑、API、数据模型、状态管理尽量共用，让后续 Web 主功能改动能同步沉淀到 Mobile。

## 1. 分层边界

```text
shared/
  adapters/        平台能力契约，不直接实现浏览器或原生能力
  api/             API client、DTO、请求/响应整理
  domain/          业务模型、纯函数、规则、校验、转换
  state/           平台无关状态与 action/use-case
  components/      平台无关、无布局假设的展示组件

web/
  app/             Web 入口、桌面布局装配
  components/      侧栏、大屏地图交互、桌面专属弹窗和工具栏
  adapters/        Web 实现：file input、navigator.share、localStorage、Web Audio 等

mobile/
  app/             Mobile 入口、底部 Tab、页面壳
  components/      手机页面、底部面板、移动端弹窗和手势交互
  adapters/        Capacitor 实现：Camera、Preferences、Network、Share、权限等
```

核心依赖方向：

```text
web/*    -> shared/*
mobile/* -> shared/*
shared/* -> shared/*
```

禁止方向：

```text
shared/* -> web/*
shared/* -> mobile/*
shared/* -> window/document/navigator/localStorage/Capacitor/Camera/Mapbox/Tone
web/*    -> mobile/*
mobile/* -> web/*
```

## 2. 当前仓库落点

现状主逻辑集中在 `App.tsx`，UI、服务和工具目录在根级并列。建议不要一次性搬迁所有文件，先按“先契约、再业务、最后 UI”的顺序迁移。

第一阶段保留现有 `App.tsx` 作为 Web 桌面入口，新建目录只承接新增共享代码和逐步抽出的模块。

| 当前文件/目录 | 目标层 | 说明 |
| --- | --- | --- |
| `types/memory.ts` | `shared/domain/memory/` | 数据模型，先消除对 `App.tsx` 的反向类型导入 |
| `constants/uploadLimits.ts` | `shared/domain/uploads/` | 纯校验规则 |
| `utils/normalizeLog.ts` | `shared/domain/memory/` | 纯数据整理 |
| `utils/geoStats.ts`、`utils/geoFromBuildingName.ts` | `shared/domain/geo/` | 地理纯规则 |
| `utils/galleryFilter.ts`、`utils/travelHeatmapData.ts` | `shared/domain/gallery/` | Gallery 业务规则 |
| `prompts/buildingStyle.ts` | `shared/domain/building-style/` | 风格枚举与校验 |
| `services/geminiService.ts` | `shared/api/generation/` | API client；文件读取能力通过 adapter 注入 |
| `services/cloudBuildings.ts` | `shared/api/buildings/` | Supabase 数据同步；图片/Canvas 处理拆到 adapter |
| `services/memoryShare.ts`、`lib/memorySharePayload.ts` | `shared/domain/share/` + `shared/api/share/` | 分享 payload 纯逻辑进 domain，请求进 api |
| `services/sessionGeo.ts`、`lib/locationAdapters.ts` | `shared/api/geo/` + `shared/domain/geo/` | `navigator.geolocation` 走 location adapter |
| `context/AuthContext.tsx` | `shared/state/auth/` | 状态可共用，Supabase storage 通过 adapter 注入 |
| `context/LocalizationContext.tsx`、`localization/translations.ts` | `shared/state/i18n/` | Web/Mobile 共用 |
| `components/MoonFaceAvatar.tsx`、`MoonEmojiBox.tsx` | `shared/components/` | 无桌面布局依赖，可共享 |
| `components/ImageMarker.tsx`、`PoiDotMarker.tsx`、`BuildingConnectionsOverlay.tsx` | `shared/components/map/` 或暂留 `web/` | 取决于 Mobile 是否复用同一地图表达 |
| `components/EchoSidebar.tsx`、`Toolbar.tsx`、`SearchControl.tsx` | `web/components/` | 桌面布局和大屏交互 |
| `lib/mapboxAdapter.ts`、`lib/mapboxLoader.ts`、`lib/amapAdapter.ts`、`lib/amapLoader.ts` | `web/adapters/map/` | 地图 SDK 适配，shared 只保留 map port 类型 |
| `lib/mobile.ts` | `mobile/adapters/` | Capacitor 能力实现 |
| `lib/registerServiceWorker.ts` | `web/adapters/pwa/` | Web/PWA 专属 |

## 3. Adapter 契约

`shared/adapters` 只定义能力接口，不引用具体平台 SDK。Web 和 Mobile 分别实现这些接口，入口装配时注入给 shared use-case。

建议先覆盖这些能力：

| 能力 | shared port | Web adapter | Mobile adapter |
| --- | --- | --- | --- |
| 图片选择/拍照 | `MediaPickerAdapter` | `<input type=file>`、`capture` | Capacitor Camera |
| 分享 | `ShareAdapter` | `navigator.share` / clipboard fallback | Capacitor Share 或系统分享 |
| 定位 | `LocationAdapter` | `navigator.geolocation` | Capacitor Geolocation |
| KV 持久化 | `StorageAdapter` | `localStorage`/IndexedDB | Capacitor Preferences |
| 网络状态 | `NetworkAdapter` | `navigator.onLine` | Capacitor Network |
| 文件保存/导出 | `FileExportAdapter` | `<a download>` | Filesystem / Share |
| 权限 | `PermissionAdapter` | Web permission/query fallback | Capacitor permissions |
| 音频录制 | `AudioRecorderAdapter` | `mediaDevices.getUserMedia` | 原生录音插件或 WebView fallback |

新增的接口文件已放在 `shared/adapters/platformAdapters.ts`，后续所有平台能力先在这里补 port，再到 `web/adapters` 或 `mobile/adapters` 实现。

## 4. 入口装配

目标入口：

```text
index.tsx
  -> web/app/WebApp.tsx

mobile/index.tsx 或构建参数 VITE_APP_TARGET=mobile
  -> mobile/app/MobileApp.tsx
```

`shared` 不直接知道当前运行在 Web 还是 Mobile。入口负责选择 adapter：

```ts
const adapters = isMobileTarget ? createMobileAdapters() : createWebAdapters();

root.render(
  <AppProviders adapters={adapters}>
    {isMobileTarget ? <MobileApp /> : <WebApp />}
  </AppProviders>
);
```

短期可以继续让 `index.tsx` 渲染现有 `App.tsx`，Mobile 新入口先并行接入共享 state/use-case。等共享层稳定后，再把 `App.tsx` 改名为 `web/app/WebApp.tsx`。

## 5. 状态与业务用例拆法

不要把 `App.tsx` 的 UI 状态原样塞进 shared。shared 只放跨端一致的业务状态和动作：

- buildings：增删改、锁定、翻转、风格、坐标、云端同步状态
- generation：上传、生成、重试、失败原因、任务状态
- gallery：筛选、标签建议、旅行热力图数据
- memory：日志、照片、音频、分享 payload
- auth：登录态、用户资料、云端权限判断
- geo：搜索建议、反向地理编码、会话锚点

Web/Mobile 自己保留：

- 当前 Tab、侧栏展开、底部 sheet 高度
- hover、右键、键盘快捷键
- 大屏滚动区和桌面浮层位置
- 移动端手势、底部导航、原生权限提示

## 6. 推荐迁移顺序

### Phase 0：建立边界

1. 保留现有 Web 表达不动。
2. 新建 `shared/`、`web/`、`mobile/` 目录和 adapter port。
3. 新代码禁止从 `shared` 引入 `web/mobile`。

### Phase 1：抽纯逻辑

1. 迁移 `types/memory.ts` 到 `shared/domain/memory`。
2. 迁移 `normalizeLog`、`geoStats`、`geoFromBuildingName`、`galleryFilter`、`travelHeatmapData`。
3. 修正组件里 `import type { ProcessedImage } from '../App'`，统一从 shared model 引入。

这一步风险最低，也是 mobile parity 的最大收益点。

### Phase 2：抽 API 与 use-case

1. 把 `generateImageWithPrompt` 改成 shared API client。
2. 把 FileReader、Canvas、Image 相关逻辑拆到 adapter 或 `web/adapters/imageProcessing`。
3. 把云端建筑 CRUD、分享请求、地理编码请求放到 `shared/api`。
4. 将 `App.tsx` 中的生成、同步、导入导出流程整理为 `shared/state` action。

### Phase 3：拆 Web Shell

1. `App.tsx` 改名为 `web/app/WebApp.tsx`。
2. `EchoSidebar`、`Toolbar`、桌面地图交互迁到 `web/components`。
3. 根入口 `index.tsx` 只负责 provider 和 Web app 装配。

### Phase 4：并行 Mobile Shell

1. 建 `mobile/app/MobileApp.tsx`。
2. Mobile 只消费 shared state/action，自己实现底部 Tab、底部 sheet、拍照/权限/分享。
3. Capacitor 能力全部落在 `mobile/adapters`，不得从 shared 直接 import。

## 7. 文件命名规范

建议使用 feature-first 命名，避免 shared 变成杂物间：

```text
shared/domain/memory/memoryTypes.ts
shared/domain/memory/normalizeLog.ts
shared/domain/gallery/galleryFilter.ts
shared/api/generation/generationClient.ts
shared/state/buildings/buildingsStore.ts
shared/adapters/platformAdapters.ts
web/adapters/media/webMediaPicker.ts
mobile/adapters/media/capacitorMediaPicker.ts
```

组件迁移时遵守：

- `shared/components` 只能有展示 props，不能自己读平台能力。
- 需要弹窗、定位、下载、分享的组件，接收 callback 或 adapter action。
- 桌面布局组件留 `web/components`。
- 手机布局组件留 `mobile/components`。

## 8. 代码守则

`shared` 可用：

- TypeScript 类型、纯函数、React hook、fetch API client
- 通过参数注入的 adapter
- 平台无关的错误码、状态机、DTO

`shared` 不可用：

- `window`、`document`、`navigator`
- `localStorage`、`sessionStorage`
- `HTMLImageElement`、`Image()`、`canvas`
- `@capacitor/*`
- Mapbox/AMap SDK
- Tone/Web Audio、Service Worker

如果某段逻辑必须碰这些 API，它应该被拆成 adapter，并由 Web/Mobile 入口注入。

## 9. 短期交付建议

最小可执行路线：

1. 先修类型边界：所有组件停止从 `App.tsx` 导入 `ProcessedImage/PhotoData/LogData`。
2. 把 `lib/mobile.ts` 移到 `mobile/adapters/capacitorCapabilities.ts`，并用 shared port 包一层。
3. 新建 `web/app/WebApp.tsx` 包住现有 `App.tsx`，保持桌面行为不变。
4. 新建 `mobile/app/MobileApp.tsx`，先复用 shared auth/i18n/gallery 数据，UI 只做底部 Tab 和基础列表。
5. 生成链路最后迁，因为它混有 FileReader、Canvas、Image、API 请求和云端同步，适合等 adapter port 稳定后再拆。

