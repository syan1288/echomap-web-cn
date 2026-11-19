# EchoMap 手机端接入方案（Capacitor 优先）

本文基于当前仓库 `echomap-web-cn` 现状设计，目标是以最短路径交付可安装 APP，并为后续原生化预留空间。

## 1. 路线结论（最短路径上线）

推荐顺序：

1. `Capacitor`（推荐）
2. `PWA`（可并行做安装入口，但不作为终局）
3. `WebView 简包`（仅应急，不建议长期）
4. `React Native / Flutter`（中长期重构路线，不适合当前“最快上线”目标）

原因（结合当前代码）：

- 前端主逻辑集中在 [`App.tsx`](/Users/athena.xu/data-project/design/echomap-web-cn/App.tsx:340) 与 `components/`，可整体复用。
- 上传与拍照目前基于 `<input type="file" capture="environment">`，见 [`AddBuildingModal.tsx`](/Users/athena.xu/data-project/design/echomap-web-cn/components/AddBuildingModal.tsx:90) 和 [`MemoryPhotoModal.tsx`](/Users/athena.xu/data-project/design/echomap-web-cn/components/MemoryPhotoModal.tsx:66)，天然适合先 Web 兼容、再替换为 Capacitor Camera。
- 生成链路已统一走 `/api/generate`，见 [`geminiService.ts`](/Users/athena.xu/data-project/design/echomap-web-cn/services/geminiService.ts:39)，移动端只需保证 API 基址、网络与重试体验。
- 登录态已用 Supabase 封装，见 [`AuthContext.tsx`](/Users/athena.xu/data-project/design/echomap-web-cn/context/AuthContext.tsx:28)，可先复用，再增强持久化与恢复策略。

## 2. 接入目标架构

```text
React/Vite Web (现有)
  -> build dist
  -> Capacitor Shell (iOS/Android)
      -> Camera / Photos / Filesystem / Preferences / Network / App
  -> 同域 API (/api/*) 或独立 HTTPS API (VITE_API_BASE_URL)
```

关键原则：

- 业务逻辑尽量留在 Web 层，避免一上来拆成双端代码。
- 原生只补“能力层”（权限、拍照、缓存、前后台恢复、网络状态）。
- API 生产必须使用 HTTPS 域名（不建议继续以裸 IP + HTTP 作为移动端正式环境）。

## 3. Phase 1（最快可交付，2-3 周）

目标：Android 先出内测安装包，完整跑通「登录 -> 上传/拍照 -> 地图落点 -> 即梦生成 -> 结果查看」。

### 3.1 初始化命令（在仓库根目录）

```bash
npm i @capacitor/core
npm i -D @capacitor/cli
npx cap init echomap-web-cn com.echomap.app --web-dir=dist
npx cap add android
npx cap add ios
```

建议补充 scripts（手工写入 `package.json`）：

```json
{
  "scripts": {
    "build:mobile": "vite build",
    "cap:sync": "npx cap sync",
    "cap:android": "npx cap open android",
    "cap:ios": "npx cap open ios"
  }
}
```

### 3.2 Capacitor 配置建议（`capacitor.config.ts`）

```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.echomap.app',
  appName: 'EchoMap',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
};

export default config;
```

### 3.3 本阶段最小改造点（按文件）

1. 设备能力探测层（新增）
- 新建 `lib/mobile.ts`，封装：
  - `isNativeApp()`（`Capacitor.isNativePlatform()`）
  - `pickImageFromCameraOrGallery()`
  - `getNetworkStatus()`
  - `persistKV()/loadKV()`（先用 Preferences）

2. 上传入口适配
- 在 [`AddBuildingModal.tsx`](/Users/athena.xu/data-project/design/echomap-web-cn/components/AddBuildingModal.tsx:55) 与 [`MemoryPhotoModal.tsx`](/Users/athena.xu/data-project/design/echomap-web-cn/components/MemoryPhotoModal.tsx:34)：
  - 保留当前 `input file` 作为 H5 fallback
  - Native 下优先走 Camera/Photos Picker，返回 `File` 后复用现有 `applyFile`

3. 生成任务状态体验
- 在 [`App.tsx`](/Users/athena.xu/data-project/design/echomap-web-cn/App.tsx:694)：
  - `isGenerating` 基础上补“排队中/上传中/生成中/失败可重试”
  - `setToastMessage` 错误文案拆成可操作项（重试按钮）

4. API 基址策略
- 继续复用 [`apiBase.ts`](/Users/athena.xu/data-project/design/echomap-web-cn/lib/apiBase.ts:7)
- 生产 APP 环境填 `VITE_API_BASE_URL=https://你的域名`，避免 APP 内 `http://IP` 带来的 ATS/明文流量问题

5. 登录态
- 先沿用 Supabase 默认持久化（兼容最快上线）
- 增加“启动恢复中”UI，避免冷启动闪登出

### 3.4 Phase 1 验收

1. Android 真机 4G/弱网下连续完成 20 次上传生成，成功率 >= 90%。
2. 前后台切换后任务状态可恢复，不出现白屏。
3. 相机、相册、定位权限被拒绝时有明确引导文案和重试入口。

## 4. Phase 2（增强移动体验，3-5 周）

目标：可灰度放量，降低弱网和中断场景失败率。

实施项：

1. 上传与任务韧性
- 上传前压缩（长边、质量分级）
- 超时与指数退避重试
- 本地持久化任务队列（pending/running/failed/success）

2. 地图交互专项
- 优化地图与页面滚动手势冲突（单手操作）
- 针对移动端调整 marker 点击热区与底部面板高度
- 聚合与重绘性能优化（减少频繁 setState）

3. 文件缓存
- 生成图写入本地缓存目录（Filesystem）
- Gallery 优先读本地缩略图，失败回源
- 缓存淘汰策略（如 300MB 或 30 天）

4. 错误可观测性
- 统一错误码：`NETWORK_TIMEOUT`/`UPLOAD_TOO_LARGE`/`GENERATION_FAILED`/`AUTH_EXPIRED`
- 埋点指标：上传成功率、生成成功率、P95 耗时、重试后成功率

## 5. Phase 3（原生化，持续）

目标：从“可用”到“好用”。

实施项：

1. 推送通知：生成完成通知、失败通知、点击回跳任务详情
2. 原生分享：系统分享面板（微信/QQ/相册）
3. 高价值原生模块逐步替换：
- 图片预处理（压缩/裁剪）原生化
- 大图加载与缓存策略优化
- 复杂地图交互组件局部原生化（如必要）

## 6. 关键风险与规避

1. 明文 HTTP API 风险
- 风险：iOS ATS / Android network security policy / 中间人攻击
- 规避：尽快启用 HTTPS 域名（建议独立 `api.` 子域）

2. 地图与移动手势冲突
- 风险：滑动误触、拖拽不稳定
- 规避：地图容器手势策略 + 底部面板触控区分离

3. 生成接口高时延导致“像卡死”
- 风险：用户误以为失败、重复提交
- 规避：显式任务状态、倒计时提示、重试与取消机制

## 7. 本周可直接开工的任务单（建议）

1. 初始化 Capacitor 工程并生成 Android 包体。
2. 增加 `lib/mobile.ts` 能力层（Camera/Preferences/Network）。
3. 把两个上传弹窗改成“Native 优先 + Web fallback”。
4. 为生成链路补任务状态与重试。
5. 准备 HTTPS API 域名并配置 `VITE_API_BASE_URL`。

如果按以上顺序推进，通常可以在 2-3 周内交付可安装、可演示、可灰度的移动端版本。

