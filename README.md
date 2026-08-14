# 这是江湖智能体

这是一个面向中文 MUD 游戏的跨平台客户端，在传统文字游戏界面上集成了 AI Agent、可复用游戏脚本、多模型配置和界面定制能力。

项目使用 uni-app + Vue 3 构建移动端界面，同时提供 Electron Windows 桌面版。客户端不依赖 WebSocket 代理，可以通过原生 TCP 直接连接兼容的 MUD 服务端，并处理 GBK/GB2312 编码及项目约定的游戏协议。

## 主要功能

### MUD 游戏客户端

- 通过 TCP 直连游戏服务器，支持自定义服务器地址和端口。
- 支持 GBK/GB2312 收发、粘包/拆包处理和按行协议解析。
- 展示主输出、聊天、房间标题、出口、场景对象、状态栏、动作按钮和交互弹窗。
- 支持文本指令、快捷操作、自定义按钮、角色创建和断线状态处理。
- 支持自动登录、详细网络日志和最多 8 组常用登录配置。
- Android 端支持后台连接、唤醒锁以及原生 TCP 插件。

### AI 智能体

- 支持 OpenAI Chat Completions 和 OpenAI Responses 兼容协议。
- 支持配置多个模型服务，包括 API Key、Base URL、模型 ID、上下文窗口和最大输出 Token。
- AI 可以读取游戏区域、观察事件、执行界面动作和发送游戏指令。
- 每个 AI 任务拥有独立对话上下文，并支持任务历史恢复。
- 上下文达到阈值时自动生成摘要，保留近期对话继续执行。
- 支持指令黑名单，限制 AI 发送危险或不希望执行的游戏命令。

### Skills 与游戏脚本

- 内置按需加载的 AI Skills，避免无关工具长期占用模型上下文。
- 支持导入、启停和删除自定义 `SKILL.md`。
- AI 可以创建、保存、运行、查询和取消受限的 JavaScript 游戏脚本。
- 脚本运行在隔离容器中，不能访问 Node.js、DOM、网络、存储或任意系统 API。
- 支持事件监听、等待游戏区域变化和非阻塞脚本任务。

### 外观与跨端体验

- 支持暗色、亮色主题及语义化界面样式。
- 可定制颜色、字体、间距、圆角、阴影、透明度和面板背景。
- 背景支持图片或安全 SVG，并可分别配置页面、顶栏、面板、弹窗和按钮区域。
- 样式配置支持 JSON 文件导入、导出和一键还原。
- 同一套页面同时适配 Android 与 Electron 桌面窗口。

### 版本与公告

- 内置轻量级 Node.js 发布信息服务。
- 客户端可以查询最新版本和公告。
- 发布数据使用 JSON 文件维护，修改内容后不需要重启服务。

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | Vue 3、uni-app |
| 构建工具 | Vite 5、DCloud uni-app CLI |
| 桌面端 | Electron 41、Electron Builder、NSIS |
| Android 网络 | uni-app 原生插件、`plus.android`、Java Socket |
| 网络协议 | TCP、HTTP、GBK/GB2312、自定义 MUD 行协议 |
| AI Agent | `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` |
| Schema | TypeBox |
| 服务端 | Node.js 原生 HTTP Server |
| 测试 | Node.js Test Runner |
| 配置 | `.env`、Vite 环境变量、本地运行时配置 |

## 适用范围

本项目适合以下场景：

- 连接使用相同或兼容协议的中文 MUD 服务端。
- 为文字游戏增加 Android 或 Windows 图形客户端。
- 研究 AI Agent 对游戏状态的读取、规划和操作。
- 编写可复用的游戏辅助脚本、监听器和自动化流程。
- 学习 uni-app 与 Electron 共用业务代码和界面的工程结构。
- 作为私有 MUD 客户端的二次开发基础。

本项目不是通用 Telnet 客户端。不同 MUD 服务端在握手、登录格式、编码和控制协议上可能完全不同，接入其他服务端时通常需要调整协议解析逻辑。

## 平台支持

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| Android App | 主要支持 | 使用 HBuilderX 运行或打包；推荐集成本地 TCP 原生插件 |
| Windows Electron | 主要支持 | 支持开发运行、免安装目录和 NSIS 安装包 |
| 浏览器 H5 | 仅作为渲染层 | 浏览器不能直接建立普通 TCP 连接，不能独立完成游戏连接 |
| iOS/小程序 | 未完整验证 | 原始 TCP 和本地文件能力受平台限制，需要额外适配 |

## 环境要求

基础开发环境：

- Node.js 20 或更高版本。
- npm。
- Git。

开发 Android 版本还需要：

- HBuilderX。
- Android 真机或模拟器。
- 制作包含 `MudAgent-TCP` 本地插件的自定义调试基座，或使用云端打包。

重新编译 Android TCP 插件还需要：

- JDK 8 或更高版本，并确保 `javac`、`jar` 可从命令行调用。

TCP 插件 JAR 属于构建产物，不提交到 Git。首次制作 Android 自定义基座或云端打包前，需要先执行插件构建脚本。

构建 Windows 安装包需要 Windows 环境。Electron Builder 会使用项目中已安装的 Electron，并生成 x64 NSIS 安装程序。

## 安装依赖

克隆项目后进入项目目录：

```bash
git clone <你的仓库地址>
cd mud-agent
npm install
```

`npm install` 会执行项目的 `postinstall` 脚本。请保留完整的安装日志，以便排查依赖补丁或二进制下载问题。

## 配置环境变量

复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

Linux 或 macOS 可以执行：

```bash
cp .env.example .env
```

然后编辑 `.env`，填写实际运行环境的配置。每个变量的用途、是否必填和取值范围都写在 `.env.example` 的中文注释中。

主要配置包括：

| 配置 | 用途 |
| --- | --- |
| `VITE_GAME_DEFAULT_HOST` | 游戏 TCP 默认服务器地址 |
| `VITE_GAME_DEFAULT_PORT` | 游戏 TCP 默认端口 |
| `VITE_GAME_HANDSHAKE_TOKEN` | 服务端约定的握手参数 |
| `VITE_GAME_LOGIN_CLIENT_TAG` | 登录协议中的客户端标识 |
| `VITE_RELEASE_API_BASE_URL` | 客户端访问的版本和公告 API 地址 |
| `VITE_AI_DEFAULT_BASE_URL` | 新建 AI 模型配置时的默认 API 地址 |
| `VITE_AI_DEFAULT_MODEL` | 新建 AI 模型配置时的默认模型 ID |
| `HOST`、`PORT` | 发布信息服务的监听地址和端口 |

`.env` 已被 Git 忽略，不应提交到公开仓库。仓库只应提交脱敏的 `.env.example`。

> 所有 `VITE_` 变量都会在构建时进入客户端安装包。环境变量可以避免真实值出现在开源仓库中，但不能防止最终用户从安装包中提取这些值。真正的长期秘密应由服务端保存或动态签发。

## 运行项目

### Windows Electron 开发运行

安装依赖并配置 `.env` 后执行：

```bash
npm run electron:dev
```

该命令会先把 uni-app 页面编译成 Electron renderer，然后启动桌面客户端。关闭窗口后命令结束。

### 构建 Electron 免安装目录

```bash
npm run build:electron:dir
```

输出目录：

```text
release/electron/win-unpacked/
```

### 构建 Windows 安装程序

```bash
npm run build:electron
```

安装程序生成在 `release/electron/`，文件名由产品名、版本号和系统架构组成。

### Android 开发运行

1. 安装依赖并配置 `.env`。
2. 使用 HBuilderX 打开项目根目录。
3. 确认 `manifest.json` 中已经启用 `MudAgent-TCP` 本地原生插件。
4. 制作并安装包含该插件的自定义调试基座，或者选择云端打包。
5. 在 HBuilderX 中选择“运行到 Android App 基座”。
6. 在登录页确认服务器地址和端口，输入账号信息后连接游戏。

如果基座中没有本地插件，Android 端会尝试回退到 `plus.android` Socket 实现。为了获得稳定的阻塞读取和更低的 JS/Java 跨桥开销，推荐使用原生插件。

### 重新编译 Android TCP 插件

修改 `nativeplugins/MudAgent-TCP` 下的 Java 源码后，在 PowerShell 中执行：

```powershell
.\build-tcp-plugin.ps1
```

生成文件：

```text
nativeplugins/MudAgent-TCP/android/libs/mudagent-tcp.jar
```

重新生成 JAR 后，需要重新制作调试基座或重新打包 App；已经安装的旧基座不会自动加载新的原生插件。

### 运行发布信息服务

```bash
npm run server
```

服务读取 `.env` 或系统环境变量中的 `HOST`、`PORT`，并提供以下接口：

| 接口 | 用途 |
| --- | --- |
| `GET /health` | 健康检查 |
| `GET /api/version/latest` | 获取最新版本信息 |
| `GET /api/announcements/latest` | 获取最新公告 |

版本和公告内容保存在 `server/release-data.json`。服务会在每次请求时读取该文件，因此修改发布内容后不需要重启。

生产环境建议在发布服务前配置 HTTPS 反向代理，并根据部署范围设置防火墙和访问策略。

## AI 模型配置

登录游戏后可以从 AI 面板进入“模型设置”：

1. 新建模型配置。
2. 填写 API Key、Base URL 和模型 ID。
3. 选择 OpenAI Chat Completions 或 OpenAI Responses 协议。
4. 根据服务商文档填写上下文窗口和最大输出 Token。
5. 保存并选用该配置。

项目允许保存多组模型配置并快速切换。API Key 只应填写在模型设置中，不要发送到聊天、Issue、截图或调试日志。

当前 API Key、登录密码和验证码会保存到应用本地存储，但尚未接入 Windows Credential Manager、Android Keystore 等平台安全凭据库。请仅在可信设备上使用自动登录和持久化模型配置。

## 项目结构

```text
mud-agent/
├── components/                 # 富文本和游戏弹窗组件
├── electron/                   # Electron 主进程与 preload
├── nativeplugins/MudAgent-TCP/ # Android TCP 原生插件
├── pages/                      # 登录、游戏、AI 设置、Skills、脚本和教程页面
├── scripts/                    # Electron 构建及生成脚本
├── server/                     # 版本与公告服务
├── skills/                     # 内置 AI Skills 源文件
├── static/icons/               # Android、iOS 与 Electron 应用图标源文件
├── test/                       # Node.js 自动化测试
├── utils/                      # 协议、网络、平台适配、AI 和样式模块
├── .env.example               # 脱敏环境变量模板
├── THIRD_PARTY_NOTICES.md      # 第三方组件版权与许可声明
├── manifest.json              # uni-app 应用与 Android 打包配置
├── electron-builder.config.cjs # Electron Builder 配置
└── package.json               # 依赖与 npm scripts
```

关键模块：

- `utils/config.js`：客户端环境配置统一入口。
- `utils/net.js`：TCP 连接、收发、GBK 编解码和消息分帧。
- `utils/proto.js`：游戏协议解析与状态更新。
- `utils/platform/`：uni-app 与 Electron 运行时适配。
- `utils/ai/controller.js`：AI Agent 生命周期、模型调用和任务管理。
- `utils/ai/gameBridge.js`：AI 读取和操作游戏的工具桥接。
- `server/index.js`：版本与公告 HTTP 服务。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖并执行安装后处理 |
| `npm test` | 运行全部自动化测试 |
| `npm run electron:dev` | 编译并启动 Electron 开发版 |
| `npm run build:electron:dir` | 生成 Windows 免安装目录 |
| `npm run build:electron` | 生成 Windows NSIS 安装程序 |
| `npm run test:electron:quick` | 对已生成的 Electron renderer 执行快速冒烟测试 |
| `npm run server` | 启动版本与公告服务 |
| `npm run generate:skills` | 根据 Skills 源文件重新生成内置 Skill 数据 |
| `npm run check:skills` | 检查生成的内置 Skill 数据是否最新 |

## 测试

运行全部测试：

```bash
npm test
```

测试覆盖协议解析、命令黑名单、登录配置、平台适配、模型配置、AI Skills、游戏脚本、Markdown、样式配置和发布信息服务等模块。

提交代码前建议至少执行：

```bash
npm test
npm run check:skills
```

涉及 Electron 构建链时，再执行：

```bash
npm run build:electron:dir
```

`npm run test:electron:quick` 会读取 `dist/electron-app/renderer/`，因此应先执行一次 Electron 构建或开发运行命令。

## 日志与排障

登录页可以开启“详细日志”。常用日志标签包括：

- `[NET]`：连接生命周期和网络错误。
- `[TCP]`：数据发送、接收和连接性能。
- `[PROTO]`：协议解析和状态切换。
- `[LOGIN]`：登录流程。
- `[GAME]`：游戏页面状态。
- `[DIALOG]`：服务端响应、协议处理和 Vue 渲染耗时。
- `[RELEASE]`：版本与公告请求。

日志会对登录密码和验证码进行脱敏。即便如此，也不建议在公开 Issue 中直接粘贴完整调试日志；发布前应再次检查其中是否包含服务器地址、账号或游戏内容。

## 已知限制与安全说明

- 本项目依赖特定 MUD 协议，不保证可以直接连接其他 Telnet/MUD 服务。
- 浏览器环境不能直接建立普通 TCP 连接，H5 版本不能作为完整独立客户端使用。
- Android 当前允许明文网络流量，以支持现有 TCP/HTTP 服务；生产部署应尽量使用 TLS/HTTPS。
- `VITE_` 环境变量不是秘密，构建后可以从客户端资源中提取。
- 登录密码、验证码和 AI API Key 当前保存在本地存储中，不是平台安全凭据库。
- 客户端内置的固定握手参数不能抵抗逆向分析；高安全要求应改为服务端动态认证。
- `release/`、`dist/`、`unpackage/` 是生成目录，不应直接修改其中的代码。
- `build/` 和原生插件 JAR 同样属于可重新生成的构建产物，已从 Git 跟踪中排除。

## 开源发布建议

公开仓库前建议完成以下检查：

- 确认 `.env`、签名文件、证书和私钥没有被 Git 跟踪。
- 使用 `.env.example` 提供脱敏配置示例。
- 轮换曾经提交到 Git 历史中的服务器凭据或握手参数。
- 清理 Git 历史中的敏感值，或者从当前干净工作树创建新仓库。
- 检查 `server/release-data.json` 中的下载地址和公告内容。
- 统一 `manifest.json`、Electron 安装包和发布服务中的版本号。
- 根据发布方式补充合适的 `LICENSE` 文件。

更完整的配置审计和安全建议见 `CONFIGURATION_AUDIT_REPORT.md`。

第三方代码和数据的版权、来源及许可声明见 `THIRD_PARTY_NOTICES.md`。

## 贡献

欢迎通过 Issue 或 Pull Request 提交问题和改进。涉及网络协议兼容性时，请说明目标平台、服务端协议差异、复现步骤和已脱敏的日志片段。

提交前请确保测试通过，不要提交真实服务器凭据、账号、密码、API Key、签名材料或本地 `.env`。

## AI 开发声明

本项目在设计、编码、重构、文档编写和问题排查过程中使用了 GPT 与 DeepSeek 进行混合辅助开发。AI 生成或建议的内容由项目维护者结合实际需求进行审阅、修改和测试，最终代码质量、安全性及发布内容仍由项目维护者负责。
