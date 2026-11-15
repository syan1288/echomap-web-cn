# EchoMap Android 发布清单（可直接执行）

适用仓库：`echomap-web-cn`  
当前结论：iOS 先用 Web/PWA，Android 先正式发布。

## 1) 一次性准备

1. 确认 JDK 17 可用（Android Gradle Plugin 8.x 推荐）。
2. 确认 Android SDK 已安装（可通过 Android Studio 安装）。
3. 安装依赖：

```bash
npm install
```

## 2) 版本与包信息

编辑 [`android/app/build.gradle`](/Users/athena.xu/data-project/design/echomap-web-cn/android/app/build.gradle)：

1. `applicationId`：正式包名（例如 `com.echomap.app`）。
2. `versionCode`：每次发版必须递增（整数）。
3. `versionName`：展示版本（例如 `1.0.1`）。

## 3) 配置 Release 签名

本仓库已支持可选签名配置（读取 `android/keystore.properties`）。

推荐直接使用自动脚本（会生成 keystore 并写入 `keystore.properties`）：

```bash
export ECHOMAP_KEYSTORE_PASSWORD='your-strong-password'
export ECHOMAP_KEY_PASSWORD='your-strong-password'   # 可选，默认同上
export ECHOMAP_KEY_ALIAS='echomap'                   # 可选
npm run android:setup-signing:local
```

你也可以手工方式：

1. 复制模板：

```bash
cp android/keystore.properties.example android/keystore.properties
```

2. 填入真实值（不要提交到 git）：

```properties
storeFile=keystore/echomap-release.jks
storePassword=***
keyAlias=echomap
keyPassword=***
```

3. 生成 keystore（若尚未生成）：

```bash
keytool -genkeypair -v -keystore android/keystore/echomap-release.jks -alias echomap -keyalg RSA -keysize 2048 -validity 10000
```

## 4) 环境变量（生产）

Android 包内前端依然使用 Vite 构建，正式包建议使用 HTTPS API：

- `VITE_API_BASE_URL=https://你的域名`
- 不建议继续使用 `http://IP` 作为移动端正式接口

建议将 Android 生产环境写入 `.env.production` 后再构建。

## 5) 构建命令

仓库已提供脚本：

1. 同步 Web 资源到 Android：

```bash
npm run android:sync
```

2. 打 release AAB（用于 Google Play）：

```bash
npm run android:bundle:release
```

3. 打 release APK（用于内测分发）：

```bash
npm run android:apk:release
```

如果你和当前机器一样没有系统 Java，可直接用仓库本地 JDK 21：

```bash
npm run android:bundle:release:local
npm run android:apk:release:local
```

产物目录：

- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- APK（已签名）: `android/app/build/outputs/apk/release/app-release.apk`
- APK（未签名）: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

## 6) 发布前检查（建议）

1. 登录流程：首次登录、退出、重进恢复。
2. 上传流程：相机拍照、相册选择、弱网重试。
3. 地图流程：缩放、拖拽、点击落点不卡死。
4. 生成流程：即梦生成失败有明确提示和重试。
5. 安全策略：API 走 HTTPS，密钥不落包、不进仓库。

## 7) 常见问题

1. `No installed build tools found`：安装 Android SDK Build-Tools。
2. `Keystore was tampered with`：密码或 alias 不匹配。
3. `Cleartext HTTP traffic not permitted`：改成 HTTPS 域名。
4. `versionCode already used`：递增 `versionCode` 后重打包。
5. `无效的源发行版：21`：改用 JDK 21（例如执行 `android:*:release:local` 脚本）。
