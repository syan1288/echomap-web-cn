# EchoMap CN 部署说明

这个目录是从原 `Vercel` 版本单独复制出来的大陆友好版本，目标是：

- 保留当前 Web 交互体验
- 支持部署到国内云服务器 / 容器 / 宝塔 + Nginx
- 通过 `PWA` 先获得“可安装到手机桌面”的体验
- 后续再平滑封装为原生 `APP`

## 推荐部署路径

### 方案 A：最快上线

- 前端：部署 `dist/` 到阿里云 ECS、腾讯云 Lighthouse、华为云 Flexus 或任意国内 Linux 主机
- 静态服务：`Nginx` 或本仓库里的 `Dockerfile`
- API：先继续复用现有独立 API 域名，前端用 `VITE_API_BASE_URL` 指过去

### 方案 B：更完整的大陆版本

- 前端：同上
- AI 生成接口：单独放在国内服务器或函数计算
- 地图/地理编码：切换到高德或腾讯位置服务，再把对应 URL 配到 `.env`
- 数据存储：优先换成国内对象存储 + 数据库
  - 对象存储：阿里云 OSS / 腾讯云 COS
  - 数据库：阿里云 RDS / 腾讯云 MySQL / PostgreSQL
  - 用户体系：后续可换手机号登录或微信体系

## 当前已做的大陆版准备

- 新增运行时配置层，可替换：
  - 地图瓦片地址
  - 地点搜索接口
  - 逆地理编码接口
  - IP 定位接口
- 新增 `manifest.webmanifest` 和 `service worker`
- 新增 `Dockerfile` 和 `deploy/nginx.conf`

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

## 构建

```bash
npm run build
```

构建后产物在 `dist/`。

## Docker 部署

```bash
docker build -t echomap-web-cn .
docker run -d --name echomap-web-cn -p 8080:80 echomap-web-cn
```

如果你准备按“同域部署”上线，推荐直接用项目内脚本：

```bash
chmod +x deploy/deploy-frontend.sh
./deploy/deploy-frontend.sh
```

脚本会：

- 构建前端镜像
- 删除旧容器
- 把新容器启动到 `127.0.0.1:8080`

## 很重要：当前 Dockerfile 只包含前端

这份项目现在的 `Dockerfile` 只打包静态前端，不会把 `/api/generate`、`/api/geocode` 一起跑起来。

更适合你的上线结构是：

- 用户访问同一个正式域名
- `Nginx` 把 `/` 反代到前端容器
- `Nginx` 再把 `/api/` 反代到独立 API 服务

## 同域 API 部署

仓库现在提供了一个常驻 Node API 入口：

```bash
npm run api:start
```

默认监听：

- `HOST=127.0.0.1`
- `PORT=3001`

可用接口：

- `GET /api/echo-health`
- `POST /api/geocode`
- `POST /api/generate`

### 推荐线上方式：systemd

仓库已附带示例服务文件：

- [deploy/echomap-api.service.example](/Users/athena.xu/data-project/design/echomap-web-cn/deploy/echomap-api.service.example:1)
- [deploy/deploy-api.sh](/Users/athena.xu/data-project/design/echomap-web-cn/deploy/deploy-api.sh:1)

服务器上可以按这个流程启用：

```bash
cd /home/ubuntu/apps/echomap-web-cn
npm install

sudo cp deploy/echomap-api.service.example /etc/systemd/system/echomap-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now echomap-api
sudo systemctl status echomap-api
```

或者直接：

```bash
chmod +x deploy/deploy-api.sh
./deploy/deploy-api.sh
```

确认健康检查：

```bash
curl http://127.0.0.1:3001/api/echo-health
```

只要你的 Nginx 里已有：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3001;
}
```

就能把正式域名下的 `/api/*` 接通。

可以参考：

- [deploy/nginx.conf](/Users/athena.xu/data-project/design/echomap-web-cn/deploy/nginx.conf:1)
- [deploy/nginx.same-domain.example.conf](/Users/athena.xu/data-project/design/echomap-web-cn/deploy/nginx.same-domain.example.conf:1)

## 建议的大陆环境变量

`.env` 里优先关注这些：

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=
# 可选；默认 chatgpt-image-latest
OPENAI_IMAGE_MODEL=chatgpt-image-latest
# 可选；默认省钱档 1024x1024 + medium
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=medium
# APIMart gpt-image-2 默认分辨率档位
OPENAI_IMAGE_RESOLUTION=1k
JIMENG_ACCESS_KEY_ID=your_jimeng_access_key_id
JIMENG_SECRET_ACCESS_KEY=your_jimeng_secret_access_key
GEMINI_API_KEY=your_gemini_key

VITE_APP_VARIANT=cn
VITE_AMAP_WEB_KEY=your_amap_key
VITE_AMAP_JS_KEY=your_amap_js_key
VITE_AMAP_MAP_STYLE=
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
VITE_MAPBOX_STYLE=mapbox://styles/mapbox/standard
# 只有当前端与 API 分域部署时才填写；同域 Nginx 反代可以留空
# VITE_API_BASE_URL=https://your-api-domain.com

# 切到 cn 模式后，下面这些默认会自动切成高德版本
# 如需自定义再覆盖
# VITE_MAP_TILE_URL=
# VITE_MAP_TILE_ATTRIBUTION=
# VITE_MAP_TILE_SUBDOMAINS=
# VITE_PLACE_SEARCH_TEMPLATE=
# VITE_REVERSE_GEOCODE_TEMPLATE=
# VITE_IP_GEO_URL=
```

- 当前产品默认出图 provider 仍是 **即梦**；OpenAI 的 `ChatGPT 图像 2.0` 会作为可选模型保留在侧边栏里。
- 填入 `OPENAI_API_KEY` 后，侧边栏的 `ChatGPT 图像 2.0` 会直接走 `/api/generate -> OpenAI images/edits` 这条现有链路。
- 若你用 APIMart 这类 OpenAI 兼容网关，额外填写 `OPENAI_BASE_URL=https://api.apimart.ai/v1`。
- 若 `OPENAI_BASE_URL=https://api.apimart.ai/v1`，后端会自动把同一个 `ChatGPT 图像 2.0` 入口切到 APIMart 的 `gpt-image-2` 异步任务流，默认固定 `size=1:1`、`resolution=1k`、`n=1`，图生图继续传 `image_urls`，并保留现有建筑风格 prompt。
- 若前端和 API 分离部署，记得把这些 AI 环境变量配在独立 API 服务上，而不是只配在静态前端机器上。

## 当前高德版行为

- `VITE_APP_VARIANT=cn` 时，前端默认切换为高德风格配置
- 若提供 `VITE_AMAP_JS_KEY`，底图可走高德 JS SDK，并支持官方 `mapStyle`
- 搜索建议：优先按高德输入提示响应解析
- 逆地理：兼容高德 `regeo` 响应结构
- IP 兜底：兼容高德 IP 定位返回的 `rectangle`
- 底图：当前已支持切到高德 JS SDK，便于后续使用官方浅灰样式或自定义样式

## 当前推荐的底图组合

- 搜索 / 逆地理 / IP 定位：继续用高德
- 视觉底图：改为 Mapbox Standard，并在运行时压成更接近杂志地图的极简风格
- 这样能兼顾大陆地理服务可用性和更干净的视觉表达

## 下一步建议

如果你要真正面向大陆用户上线，下一步最值得做的是：

1. 把搜索 / 逆地理 / IP 定位换成国内接口
2. 把 Supabase 存储替换为 OSS / COS
3. 增加 PWA 安装提示页和离线兜底页
4. 再做 Android 包装

### APP 路线建议

- 第一阶段：PWA
- 第二阶段：Capacitor 打包 Android
- 第三阶段：接入推送、文件上传、相册权限等原生能力
