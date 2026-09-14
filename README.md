# MWMD

> 本地优先的 **Markdown → 微信公众号** 排版工具。把 Markdown 写成排版精美、可**一键复制**并直接粘贴进微信公众号编辑器的图文。

[![Release](https://github.com/sandinsnow/MWMD/actions/workflows/release.yml/badge.svg)](https://github.com/sandinsnow/MWMD/actions/workflows/release.yml)

MWMD 是一款 **Windows 桌面、以 Rust 为主**（Tauri v2 + React）的**纯本地、离线**单一功能应用。它**不对接任何公众号 API**——没有 access_token、没有素材/草稿/发布、没有图床上传、不联网（唯一的联网行为是手动「检查更新」）。所有内容都在你本机处理，文章与图片绝不外传。

---

## 为什么是「内联样式 + 占位块」

微信公众号编辑器会**剥离 class、只保留内联 `style`**。因此 MWMD 的渲染核心把每个 Markdown 节点序列化为**全内联样式 HTML**，并通过 Windows `CF_HTML` 剪贴板格式写出——粘贴进公众号即可**完整保留排版**（表格、代码块着色、引用、标题层级等，保真度已实测验证）。

图片、公式、图表等微信不原生支持的内容，统一渲染为**编号占位块**（`【此处插入图片 N】`）。复制排版后，按编号在公众号里补上对应图片即可——占位文案固定中文，不随界面语言变化。

---

## 特性

- **实时分栏预览**：左编辑（CodeMirror 6）右预览，所见即所得。
- **一键复制到公众号**：`CF_HTML` 剪贴板，粘贴即保真。
- **17 套内置主题**：8 套配色主题 + 9 套出版风格（商务/学术/科研/科技/职场/报告/论文/杂志/书籍），主题之间**不仅换色、版式结构也不同**。
- **可视化主题编辑器**：暴露标题/引用/表格/分隔线版式、首行缩进、行距与 12 项调色板；可基于任一预设载入、**实时预览**、保存为自定义主题。
- **六级标题独立版式**：H1–H6 字号/字重/颜色/装饰逐级递减，层级清晰。
- **代码块语法高亮**：Rust 侧 `syntect` 输出内联着色 span，按代码块底色明暗自适应配色，无语言时回退纯文本。
- **导出单文件 HTML / PDF**：同一份渲染结果包成带打印 CSS 的完整文档；PDF 复用系统 WebView2 的 `PrintToPdf` 静默生成（无打印对话框、零额外体积）。
- **内容级全文搜索**：侧栏「文件名 / 内容」双模式，内容模式遍历工作区所有 `.md`，返回文件 + 行号 + 片段。
- **微信深色模式预览**：独立开关，对预览做 mp-darkmode 风格 HSL 颜色映射——**仅影响预览展示，绝不改变复制/导出的 HTML**。
- **工作区与树形文件管理**：多工作区根、目录变化热刷新、新建/重命名/删除。
- **全局排版参数**：字体 / 正文字号 / 对齐作为文章级参数追加为内联样式，**不改动 `.md` 源文件**。
- **中英双语界面**：多语言只作用于软件界面，不影响文章内容。
- **无边框自定义标题栏**：菜单栏整合进标题栏，全局深/浅色外观。
- **便携单文件**：免安装绿色 exe，放任意目录双击即用。

---

## 下载使用（Windows）

1. 到 [Releases](https://github.com/sandinsnow/MWMD/releases) 下载最新的 `MWMD.exe`。
2. 放到任意目录，双击运行。无需安装、无需管理员权限。
3. 首次使用：菜单 **文件 ▸ 打开文件夹** 选择你的写作目录 → 写 Markdown → **复制到公众号** → 粘贴进公众号编辑器 → 按占位编号补图。

> **运行前提**：目标机器需已安装 **WebView2 Runtime**（Windows 11 内置；部分 Windows 10 需单独安装，微软官方 Evergreen 版即可）。为坚持「单文件」，本应用不内嵌体积庞大的固定版 WebView2。
>
> **未签名提示**：本期 exe 未做代码签名，首次运行可能触发 SmartScreen 警告，选择「更多信息 → 仍要运行」即可。

应用内 **帮助 ▸ 检查更新** 会查询 GitHub Releases 的最新版本：若有新版，弹出版本号与下载链接，一键打开下载页。

---

## 从源码构建

### 环境要求

- **Windows 10/11**
- **Rust**（MSVC 工具链，host `x86_64-pc-windows-msvc`）
- **Node.js 20+** 与 **pnpm 10**
- **WebView2 Runtime**（开发调试同样需要）

### 命令

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm tauri dev

# 类型检查
pnpm typecheck

# 构建便携单文件 exe（跳过安装器打包）
pnpm tauri build --no-bundle
```

构建产物：`src-tauri/target/release/wxmd.exe`（已内嵌前端资源与图标，重命名后即可作为 `MWMD.exe` 分发）。

### 运行测试

```bash
cd src-tauri
cargo test
```

---

## 发布流程

推送 `v*` 标签（如 `v0.1.0`）即触发 [`.github/workflows/release.yml`](.github/workflows/release.yml)：在 `windows-latest` 上构建便携 exe、计算 SHA256、生成 `latest.json`，并把 `MWMD.exe`、`MWMD.exe.sha256`、`latest.json` 发布到 GitHub Releases。

> **自动更新现状**：当前为「检查更新 + 提示 + 打开下载页」的 MVP。完整的「下载 → 校验 → 自替换重启」与 minisign 更新签名仍在路线图上（详见 [`SPEC.md`](SPEC.md) §7）。

---

## 项目结构

```
src/                  # React 前端（界面 chrome、编辑器、预览、主题编辑器）
  components/         # MenuBar / Editor / FileTree / ThemeEditor / Modal / HelpModal / Icon
  app-icon.svg        # 应用图标单一源（界面与打包图标同源于此）
  update.ts           # 检查更新（GitHub API + 版本比对）
  wxDark.ts           # 微信深色预览的颜色映射
  i18n.ts             # 内置中英双语字典
src-tauri/            # Rust 核心
  src/render/         # pulldown-cmark 序列化 + 主题 + syntect 高亮（全内联样式）
  src/clipboard/      # CF_HTML 剪贴板写入
  src/pdf.rs          # WebView2 PrintToPdf 静默导出
  src/workspace/      # 文件树、目录监听、全文搜索
scripts/              # CI 辅助（latest.json 生成）
SPEC.md               # 完整产品与技术规格
WEIMD-COMPARISON.md   # 竞品对比与取舍记录
```

---

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Tauri v2（Rust + WebView2） |
| 前端 | React 18、CodeMirror 6、Vite、TypeScript |
| Markdown 渲染 | pulldown-cmark（自定义序列化，全内联样式） |
| 代码高亮 | syntect（`regex-fancy` 纯 Rust 后端，免 C 依赖） |
| 剪贴板 | Windows `CF_HTML`（winapi） |
| PDF 导出 | 系统 WebView2 `PrintToPdf` |

---

## 明确的非目标

为坚守「纯本地、离线、单一功能」，以下能力**一律不做**：

- ❌ 图床 / 图片上传（官方微信、七牛、阿里云、腾讯云等）
- ❌ LaTeX / 公式与图表的原生渲染（统一降级为编号占位块）
- ❌ 任何联网业务能力 / 微信公众号 API
- ❌ 跨平台 Web 部署 / Electron（锁定 Tauri + Windows 便携单文件）

跨平台（macOS / Linux）为后期路线图，详见 [`SPEC.md`](SPEC.md) §7.3。

---

## 许可证

暂未添加许可证（待定）。
