# BTR Desktop macOS 版

这是 [BTR Desktop](https://github.com/MrTangLuyao/Bilibili-thread-ripper-desktop) 的非官方 macOS 移植。复用上游下载核心，在官方 Electron 客户端中接入多线程视频下载。

## 支持情况

- 已针对 macOS 官方哔哩哔哩客户端 1.17.3 的应用结构完成安装、补丁和签名验证。
- Mac 版尚需实际播放验证；播放器结构变化后加速可能失效。
- 不支持上游 Windows 的客户端内自动更新、卸载按钮和后台守护程序。更新 Mac 版时重新执行安装流程。

## 安装

需要 macOS、Node.js 18 或更高版本，以及从官方渠道安装的 `/Applications/哔哩哔哩.app`。先退出哔哩哔哩，再在本仓库目录执行：

```sh
node macos/cli.cjs install
```

默认复制到 `~/Applications/哔哩哔哩 BTR.app`。官方应用不会被修改。也可以指定路径：

```sh
node macos/cli.cjs install '/Applications/哔哩哔哩.app' '/path/to/哔哩哔哩 BTR.app'
```

安装器会检查官方应用签名、复制应用、修改副本的 `app.asar`、更新 `Info.plist` 的 ASAR 完整性哈希，并给副本签名。请从 BTR 应用的具体路径启动副本，避免与原版客户端同时运行。副本与原版可能共用客户端账号和缓存目录；首次启动可能需要重新登录或确认钥匙串访问。BTR 设置位于客户端「设置」页面顶部、登录区域下方。

## 检查和卸载

```sh
node macos/cli.cjs status
node macos/cli.cjs remove
```

`remove` 只删除带 BTR macOS 安装标记的应用副本，不删除官方应用或账号数据。指定安装路径时，检查和卸载也要传入该路径。更新时先退出并卸载旧副本，再从官方应用重新安装。

## 工作方式

安装器只把 BTR 的 Electron preload 加入应用副本。preload 只在 `bilipc.bilibili.com` 的首页和播放器页面加载脚本。播放和界面仍由官方客户端负责；下载请求由 BTR 接管。客户端内的 BTR 设置支持 CDN 模式、线程数和调试选项。

这个副本使用临时签名，无法保留哔哩哔哩官方签名身份，也不保证官方自动更新流程可用。官方客户端升级后，应先在新版客户端上重新验证适配。
