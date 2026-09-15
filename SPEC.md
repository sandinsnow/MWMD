# MWMD · 微信公众号 Markdown 排版工具 — 产品与技术规格（SPEC）

> 产品名 **MWMD**（仅在「关于」弹窗与本规格文件中展示；界面标题栏以图标呈现，不显示文字名）。
> 版本 v1.11（**定稿**，可进入实现）· 最后更新 2026-09-15
> 定位：一款 **Windows 桌面、以 Rust 为主** 的**纯本地**单一功能应用——把 Markdown 写成排版精美、可**一键复制**并粘贴进微信公众号编辑器的图文。**不对接任何公众号 API**，图片以**编号占位块**处理。
>
> 变更记录
> - v0.2：移除全部微信联网能力（API/素材/草稿/发布/图片转存/密钥/IP 白名单），变为纯离线。
> - v0.3：锁定 React；.md 文件存储 + 工作区 + 左侧树形文件管理器；编号占位块；公式/图表降级为占位；无边框标题栏；代码签名 + 自动更新；中英双语。
> - v1.0：自动更新托管 **GitHub Releases**；本期去掉代码签名（未签名包）；图片与降级公式/图表共用编号序列；需求收口。
> - v1.1：**最终打包形态确定为便携单文件 exe**；据此调整打包与自动更新策略（改为**自替换式更新**，不再产出安装器）。
> - v1.2：产品定名 **MWMD**；菜单栏并入标题栏（图标替代文字名）；文章主题扩充至 **10 套**；**全局深色主题**（整个界面 chrome 同步，预览画布保持白底忠实输出）；工具栏标题改为 **正文/H1–H6 下拉**、字体列表补充常用 web 字体；编辑/预览分区加标题【Markdown】【实时预览】；左侧树与预览区**可折叠到边缘**。
> - v1.3：**预览画布改为随界面外观切换**——深色下用 CSS `invert` 自动反相（复制出的 HTML 不变），**反转 v1.2「预览始终白底」**；工具栏图标**按功能分组**（行内/块级/插入/样式）；产出 `WEIMD-COMPARISON.md` 竞品对比报告；规划**跨平台**（macOS / deb / rpm）为后期路线图（见 §7/§8）。
> - v1.4：**六级标题 H1–H6 各自独立版式**（此前 H4–H6 复用 H3、层级不清）；**10 套主题引入 5 种标题版式**（竖条/下划线/色块/胶囊/双线），主题之间**不仅换色、版式结构也不同**（参考 WeiMD）；标题仅套全局字体族、不被全局字号/对齐覆盖（见 §4.4）。
> - v1.5：**编辑器自动换行**（`EditorView.lineWrapping` + 分栏 `min-width:0`，修复长文档把预览挤出可视窗）；**帮助菜单**（Markdown 基本语法对照，中英双语）；**主题版式模型扩展**——在标题版式之外新增**引用/表格/分隔线**三类版式与**首行缩进/行距**旋钮，使每个 Markdown 板块都随主题呈现结构性差异；主题扩充至 **17 套**并分**配色（8）/出版风格（9）**两类（新增商务/学术/科研/科技/职场/报告/论文/杂志/书籍），视图菜单按类别分组（见 §4.4）。
> - v1.6：**代码块语法高亮**（对比报告 §3.2 / M4-A）——Rust 侧用 **syntect**（纯 Rust `regex-fancy` 后端，免 oniguruma C 依赖）把围栏代码块渲染为**内联颜色 span**（微信剥离 class，必须内联）；按代码块底色亮度自动选**暗/亮**配色（浅底主题如 minimal 也可读），无语言/无法识别时回退为转义纯文本；语法集与配色集进程内 `OnceLock` 缓存（见 §4.4）。
> - v1.7：**导出单文件 HTML 与 PDF**——同一份渲染结果包成带打印 CSS 的完整文档（`render::standalone_document`）；「导出 HTML」走 `rfd` 保存对话框落盘，「导出 PDF」用系统 **WebView2 运行时的 `PrintToPdf` 静默生成**（隐藏离屏窗口载入文档→直接写 PDF，无打印对话框）。**纯离线**：不内置浏览器内核，复用系统自带 WebView2（见 §4.12）。
> - v1.8：**内容级全文搜索**（对比报告 §3.3 / P2）——侧栏搜索框加「文件名 / 内容」双模式切换；内容模式下 Rust 侧 `search_content` 遍历工作区所有 .md（跳过隐藏项）、大小写不敏感逐行匹配，返回「文件 + 行号 + 片段」（上限 500 条），前端防抖 250ms 触发、结果列表点击直达文档。纯本地离线（见 §4.13）。
> - v1.9：**微信深色模式预览 · 进阶版**（对比报告 §3.1）——新增**独立**「微信深色预览」开关（与全局界面外观解耦、各自持久化，首次启动默认跟随外观以保留 v1.3 直觉）。开启时前端对预览 HTML 的内联颜色做 **mp-darkmode 风格 HSL 映射**（前景色深→翻亮/浅→保持，背景色浅→压暗/深→再压暗不翻亮），替换 v1.3 的整块 CSS `invert` 反相。**仅作用于预览展示**：复制/导出始终由 Rust 从 md 重新渲染，绝不经过该映射，故输出 HTML 不受任何影响（见 §4.14）。
> - v1.10：**可视化主题编辑器**（对比报告 §3.4 / P3）——视图菜单新增「主题编辑器…」，弹窗暴露 `Spec` 全部旋钮（标题/引用/表格/分隔线版式、首行缩进、行距、12 项调色板），可**基于任一预设载入**再改，**实时反映到右侧主预览**，保存为**自定义主题**（持久化于 `Config.custom_themes`，以 `custom:<id>` 前缀选用，出现在视图菜单「自定义主题」分组）。自定义主题与预设走**同一 Rust 渲染管线**（`resolve_theme`），输出仍是纯内联样式、微信安全（见 §4.15）。**Logo 单一源**：`src/app-icon.svg` 既作标题栏左上角图标（Vite `<img>` 导入），又经 `pnpm tauri icon` 栅格化为打包图标集，确保界面显示与应用图标一致（见 §4.8）。**M4-B 便携打包 + 发布 CI + 检查更新 MVP**：`tauri build --no-bundle` 出免安装单 exe；`.github/workflows/release.yml` + `scripts/make-latest-json.mjs` 在 `v*` 标签构建、算 SHA256、生成 `latest.json` 并发布到 `sandinsnow/MWMD` Releases；帮助菜单「检查更新…」前端 fetch GitHub API 比对版本、提示并打开下载页。完整自替换更新（下载/校验/替换）+ minisign 签名待联网构建环境补齐（见 §7）。**编辑器 ⇄ 预览联动滚动**：以「主面板」模型（记录用户最后交互的面板，仅由主面板按滚动比例镜像驱动另一侧、忽略程序化回波）实现双向同步且无反馈抖动（见 §4.3）。
> - v1.11：**发布版本 0.1.1**——应用版本号由 `0.1.0` 提升到 `0.1.1`（同步于 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`；「关于」弹窗经 `getVersion()` 自动显示），打附注标签 `v0.1.1` 推送以触发 `.github/workflows/release.yml` 构建并发布便携单 exe 到 `sandinsnow/MWMD` Releases。本次发布内容 = **编辑器 ⇄ 预览联动滚动**（v1.10 记录，见 §4.3）。注：SPEC **文档版本（v1.x）** 与应用 **发布版本（0.1.x）** 是两套独立编号——前者描述规格演进，后者对应实际可下载构建。

---

## 1. 目标与非目标

### 1.1 产品目标
- **分栏 Markdown 编辑器 + 实时预览**，写作流畅、低延迟。
- **主题 / 排版设计**，渲染结果严格符合微信公众号约束（**内联样式**）。
- **一键复制**为微信富文本（CF_HTML），粘贴进 mp.weixin.qq.com 即保留排版。
- 图片 / 公式 / 图表统一以**编号占位块**呈现，方便在微信编辑器内逐个替换或删除。
- **本地工作区 + 树形文件管理器**：用户指定一个文件夹为根，按子文件夹分类浏览/管理 .md 文档。
- **精美、低占用、高效、纯离线**：无边框标题栏、冷启动快、内存低、包体小、无遥测。
- **中英双语**界面；**便携单文件 exe** 分发（未签名），带自动更新（GitHub Releases）。

### 1.2 MVP 范围（第一版）
1. 首次启动引导：选择工作区根文件夹
2. 左侧**树形文件管理器**（按文件夹分类，新建/打开/重命名/删除/搜索 .md）
3. 分栏编辑器（源码 + 实时预览）
4. 主题排版（内置预设 + 基础自定义）
5. 一键复制为微信富文本（CF_HTML，内联样式）
6. **编号图片占位块**（预览与复制输出一致）
7. 公式/图表 → 占位降级（与图片共用编号序列）
8. **无边框自定义标题栏**
9. **中英双语** i18n
10. 文档以 .md + frontmatter 文件存储，自动保存

> 自动更新与便携单文件打包属**发布硬化**（§7、§8）；代码签名本期不做。

### 1.3 非目标（明确不做）
- ❌ 微信公众号 API 直连（token/素材/草稿箱/发布）、AppSecret 存储、IP 白名单
- ❌ 图片下载/上传/嵌入、外链图处理（仅占位）
- ❌ 云同步、多账号、任何联网业务功能（自动更新除外）
- ❌ 代码签名（Authenticode）；NSIS/MSI 安装器（改为便携单文件）
- （WYSIWYG 单栏、可视化主题编辑器、多平台导出、原生公式渲染 → §8 可选增强）

---

## 2. 目标用户与核心场景
- **用户**：个人公众号作者 / 小团队运营，追求排版质量与效率，偏好本地、轻量、无账号绑定、免安装的工具。
- **核心场景**：双击便携 exe 打开 → 选工作区 → 树形目录里选/建一篇 .md → 写稿 → 选主题 → 实时预览 → 点「复制到公众号」→ 粘贴进微信编辑器 → 按占位编号逐个补图 → 完成。

---

## 3. 技术选型与架构

### 3.1 总体技术栈
| 层 | 选型 | 理由 |
|---|---|---|
| 桌面外壳 | **Tauri v2** | Rust 核心 + 系统 WebView2；release 二进制内嵌前端资源，天然是单文件；契合「Rust 为主」 |
| 核心 / 业务逻辑 | **Rust** | 渲染、剪贴板、工作区文件管理、i18n 文案全在 Rust |
| Markdown 渲染 | **pulldown-cmark**（事件流自定义序列化器） | 逐节点注入**内联样式**，保证预览==复制输出 |
| 代码高亮 | **syntect** | 输出内联着色 span，兼容微信 |
| 富文本剪贴板 | **clipboard-win**（写 CF_HTML） | 微信粘贴需 `HTML Format`（§4.5、§5） |
| 工作区/文件 | Rust `std::fs` + **notify**（目录监听，已实现） | 直接读写 .md，扫描目录树；自定义 command 不受 fs 插件 scope 限制 |
| 文件夹选择 | **rfd**（Rust 原生对话框） | 首次启动选工作区根目录 |
| 自动更新 | **tauri-plugin-updater** + 便携自替换（托管 GitHub Releases） | 见 §7 |
| 前端框架 | **React 18 + Vite + TypeScript** | 已确认；生态成熟 |
| 编辑器组件 | **CodeMirror 6** | 轻量低内存、Markdown 支持好 |
| 前端 i18n | **i18next**（或 lingui） | 中英双语，语言可切换 |
| 树形组件 | 轻量自绘 / react-arborist | 大目录虚拟化、懒加载 |

> 已移除：reqwest、keyring、微信/图片管线依赖。

### 3.2 分层与数据流
```
┌────────────────────────── 前端 (WebView, 薄层) ──────────────────────────┐
│ 自定义标题栏 │ 树形文件管理器 │ CodeMirror 编辑器 │ 预览面板 │ 主题/语言设置 │
└──────▲───────────────▲────────────────▲──────────────────▲──────────────┘
       │ Tauri IPC (invoke / event)
┌──────▼───────────────▼────────────────▼──────────────────▼──────────────┐
│                            Rust 核心 (src-tauri)                          │
│  render  : md → 内联样式 HTML（主题 + syntect + 编号占位 + 公式/图表降级）  │
│  clip    : CF_HTML 富文本写剪贴板                                           │
│  workspc : 工作区扫描 / 读写 .md / 目录树 / 增删改查                         │
│  i18n    : 本地化文案（占位提示、错误信息），随 locale 输出                  │
│  window  : 无边框窗口控制（最小化/最大化/关闭）                              │
└───────────────────────────────────────────────────────────────────────────┘
                    （纯本地，无业务网络；仅自动更新访问 GitHub）
```

**实时预览数据流**：编辑内容变更 → 前端 debounce(~180ms) → `invoke('render_markdown', {md, themeId, locale})` → Rust 渲染内联样式 HTML（图片/公式→编号占位）→ 返回 → 前端 `preview.innerHTML = html`。**单一渲染源**保证「预览==复制输出」。

### 3.3 目录结构（Rust 为主）
```
D:\PROJECT\
├─ src-tauri\
│  ├─ src\
│  │  ├─ lib.rs / main.rs
│  │  ├─ commands\        # tauri command: render / copy / workspace / window
│  │  ├─ render\          # md→内联HTML、主题、代码高亮、占位/公式降级
│  │  ├─ clipboard\       # CF_HTML 写入
│  │  ├─ workspace\       # 目录扫描、.md 读写、frontmatter、增删改查
│  │  ├─ i18n\            # 中英资源（rust 侧文案）
│  │  └─ window\          # 无边框窗口控制
│  ├─ Cargo.toml
│  ├─ tauri.conf.json     # decorations:false、CSP、updater(GitHub Releases)
│  └─ capabilities\
├─ src\                   # React + Vite + TS + CodeMirror
│  ├─ components\         # Titlebar / FileTree / Editor / Preview / Settings
│  ├─ i18n\               # zh-CN / en-US 资源
│  └─ ...
├─ .github\workflows\     # CI: 构建 → updater 签名 → 发布单 exe + latest.json 到 GitHub Releases
├─ package.json
└─ SPEC.md
```

---

## 4. 功能规格

### 4.1 首次启动引导（Onboarding）
- 首次运行弹窗让用户**选择工作区根文件夹**（rfd 原生对话框）；选择后持久化到配置。
- 未设置工作区前，编辑/文件管理功能给出引导提示。
- 可在设置中**更换工作区根目录**。

### 4.2 工作区与树形文件管理器（左侧栏）
- 以工作区根目录为起点，**递归扫描** .md 文件与子文件夹，按**文件夹层级**在左侧渲染**树形结构**。
- 操作：新建文件/文件夹、打开、重命名、删除、（按文件名/内容）搜索、展开/折叠。
- 读写：直接操作磁盘 .md 文件（含 frontmatter），保证可用其它编辑器打开、可 Git 版本管理。
- 自动保存当前文档（防丢稿）；切换文档时落盘。
- 大目录性能：**懒加载 + 虚拟滚动**；非 .md 文件默认隐藏（可配置显示）。
- 便携形态下，**应用配置**（工作区路径、主题、语言等）存于用户目录（如 `%APPDATA%\<app>`），与被编辑的 .md 工作区分离，保证 exe 可随意移动。
- **文件监听（已实现，非 P2）**：`notify` 递归监听各工作区根目录，外部拖放/新建/重命名/删除触发 `fs-changed` 事件，前端 debounce(400ms) 后重扫目录树，及时显示外部改动。

### 4.3 Markdown 编辑与实时预览
- **编辑器**：CodeMirror 6，Markdown 高亮、行号、列表自动续行、Tab 缩进、查找替换、快捷键（Ctrl+S 保存、Ctrl+B/I 粗体/斜体、Ctrl+Shift+C 复制为微信富文本）。
- **支持语法**：CommonMark + GFM（表格、删除线、任务列表、围栏代码块）、脚注。
- **预览**：渲染 Rust 返回的内联样式 HTML。
- **编辑器 ⇄ 预览联动滚动**（v1.10）：采用「主面板」模型——记录用户最后交互的面板（监听 `wheel`/`touchstart`/`pointerdown`/`keydown`），仅由主面板按滚动比例（`scrollTop/(scrollHeight-clientHeight)`）镜像驱动另一侧，忽略非主面板的 `scroll` 事件（即程序化滚动回波），从根本上避免双向同步的反馈循环抖动。编辑器滚动容器为 CodeMirror 的 `.cm-scroller`（经 `Editor` 的 `scrollElementRef` 暴露），预览滚动容器为 `.preview`；切换文件或折叠/展开预览时重新绑定。

### 4.4 主题与排版（关键约束：微信只认内联样式）
- **核心约束**：公众号编辑器剥离 `<style>`/class/外部字体；**只有 `style="..."` 内联样式被保留**。主题不能用 CSS 类实现。
- **主题模型**：主题 = 「元素 → 内联样式串」映射（**h1/h2/h3/h4/h5/h6**/p/blockquote/code/pre/占位块/ul/ol/li/a/table/thead/th/**td/td_alt**/hr/strong/em 等）+ 代码高亮配色；序列化时逐节点注入 `style`。**六级标题各自独立样式**，字号/字重/颜色/装饰逐级递减形成清晰层级。**每个板块的版式随主题结构性变化**（v1.5）：标题、引用、表格、分隔线各有独立版式族，正文另有首行缩进与行距旋钮——避免「只换色、版式单调、层级不清」。
- **内置预设**（已实现 **17 套**，单一渲染源，预览==复制），分两类（`ThemeMeta.category`，视图菜单按类分组）：
  - **配色主题（`category=color`，8 套）**：`default` 活力橙 / `wechat` 微信绿(#07c160) / `minimal` 极简黑白 / `purple` 暗夜紫 / `teal` 清新青 / `crimson` 暖阳红 / `forest` 森林绿 / `morandi` 莫兰迪。
  - **出版风格主题（`category=publish`，9 套）**：`business` 商务 / `tech` 科技 / `academic` 学术 / `research` 科研 / `workplace` 职场 / `report` 报告 / `paper` 论文 / `magazine` 杂志 / `book` 书籍。论文/书籍正文**首行缩进 2em** + 大行距，学术/科研/论文表格用**三线表**。
  - 全部由 `build(Spec)` 生成，`Spec` = 标题版式 + 引用/表格/分隔线版式 + 缩进/行距 + 调色板，主题之间**不仅配色不同、版式（结构）也不同**（v1.4 起，v1.5 扩展到全板块；参考 WeiMD 多主题思路）：
  - **标题版式（`HeadStyle` 枚举，8 种）**：`Bar` 左侧竖色条逐级变细 · `Underline` 下划线递进 · `Block` 色块填充白字 · `Pill` 圆角胶囊柔和底 · `Bracket` 上下双线/角标 · `Academic` 居中主标题+底线小节+斜体三级 · `Magazine` 超大主标题+粗底线+左侧色条 · `Book` 居中+疏朗字距+斜体小节。
  - **引用版式（`QuoteStyle`）**：`Bar` 左色条+柔和底 · `Card` 描边卡片+斜体 · `Rule` 上下细线+居中斜体（学术/书籍）。
  - **表格版式（`TableStyle`）**：`Grid` 全网格描边 · `Striped` 表头强调+隔行斑马底（渲染器按 `body_row` 奇偶切换 `td`/`td_alt`）· `ThreeLine` 三线表（仅顶线/表头底线/底线，无竖线，学术规范）。
  - **分隔线版式（`RuleStyle`）**：`Solid` / `Dashed` / `Double`。
  - **形状语言**：圆角半径随标题版式统一（色块/胶囊圆润 r=10、书籍 r=6、竖条/双线/杂志方正 r=4、下划线/学术利落 r=2），作用于代码块/引用/占位块。
  - 参数化项：标题/引用/表格/分隔线版式 + 缩进/行距 + 强调色/标题色/柔和底/链接色/代码块与占位块配色。
- **全局排版参数（文章级，非逐块）**：字体（无衬线/衬线/等宽/楷体/宋体/黑体/仿宋/微软雅黑/苹方 + Arial/Georgia/Times New Roman/Verdana/Tahoma/Trebuchet MS/Courier New/Consolas/Cambria 等常用 web 字体）、正文字号（14–20px）、对齐（左/中/右/两端）。这些**不是 Markdown 原生能力**，实现方式为：以预设主题为基，把参数对应的 `font-family`/`font-size`/`text-align` **追加**到相关元素的内联样式串（内联 CSS 后声明者胜），随主题一起持久化。**不做逐块 HTML 覆盖**，以免污染 .md 并破坏单一渲染源（用户确认）。字体切换**只影响预览/复制输出，不改动 Markdown 源文件**。**标题（h1–h6）仅套用全局字体族**，其字号阶梯与对齐属于**主题版式设计**，不被全局字号/对齐覆盖（v1.4）。
- **文章主题 ≠ 界面外观 ≠ 微信深色预览（三者各自独立持久化）**：文章主题决定预览/复制输出；界面外观（浅色/深色）为独立的**全局**设置——切换深色时整个软件 chrome（标题栏/菜单/侧栏/工具栏/弹窗等）同步变暗，相关配色经 CSS 变量统一调整。**预览深色另有独立「微信深色预览」开关**（v1.9，与界面外观解耦）：开启时对预览 HTML 的内联颜色做 **mp-darkmode 风格 HSL 映射**（替换 v1.3 的整块 CSS `invert` 反相），预览容器加深色底；首次启动默认跟随界面外观以保留直觉，此后完全独立。**该映射只作用于前端预览展示，复制/导出始终由 Rust 从 md 重新渲染、输出内联样式 HTML 不变**（详见 §4.14）。
- **代码块语法高亮（v1.6 已实现）**：围栏代码块由 **syntect** 在 Rust 侧逐行高亮为**内联颜色 span**（`styled_line_to_highlighted_html` + `IncludeBackground::No`，故只产出前景色，背景仍由主题 `pre` 决定）。语言取自围栏 info 串首个 token（`find_syntax_by_token` → 回退 `find_syntax_by_extension`）。**配色随代码块底色明暗自适应**：`Theme.code_dark`（由 `code_bg` 相对亮度判定）→ 暗底用 `base16-ocean.dark`、浅底用 `base16-ocean.light`，保证 minimal 等浅底主题也可读。**无语言 / 无法识别 / 高亮出错时回退为转义纯文本**，保留主题自身 `code`/`pre` 配色。`SyntaxSet`/`ThemeSet` 体积大，用 `std::sync::OnceLock` 进程内缓存一次（实时预览每次按键防抖重渲染，不可每次重载）。依赖用 `default-features=false` + `regex-fancy`（纯 Rust，免 oniguruma C 库，利于 Windows 单文件分发）。微信深色预览开启时，高亮 span 的前景 `color` 一并经 §4.14 的 HSL 映射（深→翻亮），代码块 `pre` 背景按背景规则压暗不翻亮，配色不失真。

### 4.5 一键复制为微信富文本
- 「复制到公众号」→ Rust 用当前主题渲染**内联样式 HTML**（图片/公式为编号占位块）→ 写系统剪贴板。
- **Windows 需写 `CF_HTML`（HTML Format）** + 附 `CF_UNICODETEXT` 兜底，粘贴进 mp.weixin.qq.com 才保留排版。
- 反馈：成功 toast，并提示「图片为编号占位，请在微信编辑器中按编号替换或删除」。
- ⚠ 技术风险点，Phase 0 spike 验证（§5）。

### 4.6 编号占位块（图片 / 公式 / 图表统一）
- 文中图片（远程 URL / 本地路径）**不下载、不上传、不嵌入**，统一渲染为**占位块**。
- **共用编号序列**：图片、以及降级为图片的公式/图表，**按全文出现顺序共用同一编号** 1,2,3…（已确认）。
- **占位块规格**：
  - 文案：**固定中文** `【此处插入图片 N】`（面向公众号读者，**不随界面语言变化**；用户确认——多语言只针对软件本身，与文章内容无关）。
  - 样式：**醒目边框 + 底色**、居中、与正文明显区分；内联样式实现（微信可保留）。
  - 辅助小字（默认开启，可在设置关闭）：图片显示 `alt`/文件名；公式/图表显示原始源码（LaTeX/Mermaid）。
- **一致性**：预览与复制输出使用**同一编号与样式**（渲染器内维护全局计数器），所见即所得。
- 设计目的：粘到微信后能**按编号快速定位**每个占位，逐个替换或删除。

### 4.7 公式与图表降级
- 原则：**以微信公众号能支持的程度为准**；不支持则**降级为图片，按占位逻辑处理**。
- 数学公式（`$...$` / `$$...$$`）与 Mermaid 等图表：微信无法原生渲染、本期不嵌入图片 → 统一降级为 §4.6 的**编号占位块**（共用同一序列），并在辅助小字附**原始源码**，方便用户外部出图后手动插入。
- MVP 只做「识别 + 降级为占位」；任何微信兼容的原生渲染尝试列入 P2 评估。

### 4.8 无边框自定义标题栏（整合菜单栏）
- `tauri.conf.json` 设 `decorations: false`；前端自定义标题栏**同一行**内依次放置：**应用图标（Logo，替代文字应用名）** → **菜单栏**（文件/视图/关于）→ 可拖拽空白区 → 操作区（复制到公众号）→ 窗口按钮（最小化/最大化-还原/关闭）。
- 应用名 **MWMD** 不在标题栏显示，仅出现在「关于」弹窗与本规格文件（用户要求）。
- 拖拽移动：图标区与中部空白区加 `data-tauri-drag-region`；双击最大化/还原。菜单按钮不拦截拖拽。
- 窗口控制经窗口 API 执行；无边框下保证可缩放、可拖拽、Aero Snap 正常。
- 视觉：与整体风格统一，深浅色随**全局外观**（见 §4.4）同步。
- **Logo 单一源（v1.10）**：标题栏左上角图标是 `src/app-icon.svg`（Vite `<img>` 导入），与 `pnpm tauri icon` 从同一 SVG 栅格化出的**打包应用图标**天然一致；改 Logo 须同步重跑 `pnpm tauri icon`（见决策 #42）。

### 4.9 国际化（中英双语，仅软件界面）
- **范围**：多语言**只作用于软件界面本身**（菜单/工具栏/树/弹窗/toast/占位提示等 chrome），**不改变文章内容**（用户确认）。因此文章内的图片/公式占位文案固定中文（见 §4.6），渲染命令**不再接收 locale**。
- **实现**：前端用**轻量内置字典**（`src/i18n.ts`，零第三方依赖）管理 zh/en，替代原计划的 i18next——本应用文案量小，果断做减法（用户认可最简范围）。默认跟随系统、可在「视图 ▸ 界面语言」切换、持久化。
- **界面字体/字号（仅 chrome）**：「视图 ▸ 界面字体 / 界面字号」单选，经 CSS 变量 `--ui-font`/`--ui-size` 作用于菜单栏/树/工具栏/弹窗等界面元素，**不影响文章预览**（预览用 Rust 输出的内联样式，天然独立）。随 `ui_font_family`/`ui_font_size` 持久化。
- 布局兼容中英文长度差异。

### 4.10 菜单栏与常规操作（整合进标题栏）
- 菜单栏**内嵌于标题栏**（见 §4.8），不再单独占一行：**文件**（新建文件/新建文件夹/打开文件…/打开文件夹…/保存/复制到公众号/导出单文件 HTML/导出 PDF）、**视图**（文章主题 / 界面字体 / 界面字号 / 外观 / 界面语言，分组单选）、**关于**（顶层按钮，弹窗显示应用名 MWMD/说明/版本号）。
- 「视图 ▸ 外观」为**全局浅色/深色**切换（原「编辑器外观」升级，见 §4.4）。
- **打开文件…**：经 `pick_file` 选择任意 `.md`（可在工作区之外）直接编辑、保存到原路径；**打开文件夹…** = 新增工作区根。
- **关于**：版本号取自 Tauri `getVersion()`（`tauri.conf.json` 的 `version`）。
- 下拉为前端自绘（点击外部/Esc 关闭），不使用浏览器原生菜单。

### 4.11 图标、分区标题与视觉精修
- 工具栏/菜单/树/窗口按钮统一使用**内置线性 SVG 图标集**（`src/components/Icon.tsx`，零依赖，`currentColor` 描边），替代早期文字 glyph（用户要求更精致一致）。
- 编辑器工具栏分组：**标题下拉（正文 / H1–H6）**、文本样式（粗/斜/删除线/行内码/链接）、块结构（引用/有序/无序）、插入（代码块/表格/分隔线/图片），右侧为文章级排版控件（字体/字号/对齐）。标题下拉对当前行/选区去除既有 `#` 前缀后重设为所选级别（正文=清除标记）。
- **分区标题**：编辑区顶部标题【Markdown】、预览区顶部标题【实时预览】，明确两栏职责。
- **可折叠面板**：左侧树与右侧预览区各有折叠按钮，可收缩到边缘（留一条细边栏，点击展开）；折叠后编辑区自动占据更大空间。

### 4.12 导出单文件 HTML 与 PDF（v1.7）
- **单一渲染源**：复用 `render_markdown` + `themed` 的内联样式输出（与预览/复制完全一致），再经 `render::standalone_document(content, title)` 包成完整 `<!DOCTYPE html>` 文档；文档内嵌**打印 CSS**（`@page { margin:18mm }`、`print-color-adjust:exact` 强制保留底色、`pre` 自动换行、`img/pre/blockquote/table` 与标题的 `break-inside/break-after:avoid` 防跨页割裂）。标题取当前文件名（去 `.md`），无文件时为 `document`。
- **导出 HTML**：**异步**命令 `export_html(...)`（`async fn`）渲染后用 `rfd::AsyncFileDialog` 保存对话框（`.html/.htm` 过滤，预填文件名）落盘（写盘走 `spawn_blocking`），返回路径（取消则 `None`）；前端弹保存对话框选目标路径，期间显示忙碌遮罩，完成后 toast 提示路径。
- **导出 PDF（静默）**：**异步**命令 `export_pdf(...)`（`async fn`）渲染同一份文档后，复用系统已自带的 **WebView2 运行时**——建一个隐藏离屏 `WebviewWindow`，经 `ICoreWebView2::NavigateToString` 载入文档、注册 `NavigationCompleted` 回调，回调内再用 `ICoreWebView2_7::PrintToPdf` 直接写出 PDF（`CreatePrintSettings`：保留背景色 `ShouldPrintBackgrounds`、去页眉页脚、纵向、18mm 边距）。**全程无打印对话框**、**全事件驱动无嵌套消息泵**：`with_webview` 闭包内注册回调即返回，tao 主事件循环自然派发 `NavigationCompleted`/`PrintToPdfCompleted`，命令线程只在 `spawn_blocking` 内 `recv_timeout(30s)` 等结果，完成后销毁隐藏窗口。**为何异步 + 事件驱动**：Tauri 同步命令跑在主线程，若在其中嵌套消息泵（`wait_with_pump`/`wait_for_async_operation`）等待 WebView2 回调，回调不在该嵌套循环内派发就会永久卡死主线程→整个 UI 冻结（复制、按钮全失效）。改异步后主线程空闲、命令在 worker 线程等待，杜绝死锁。前端仅弹保存对话框选目标路径，期间显示忙碌遮罩，完成后 toast 提示。
- **为何用 WebView2 PrintToPdf**：纯离线 + 便携单文件约束下，静默生成 PDF 若走 wkhtmltopdf/Chromium 需打包浏览器内核（+100MB 量级），违背「单 exe、免安装、无网络」目标；而 **WebView2 是 Windows 上 Tauri 本就依赖的系统运行时**，`PrintToPdf` 复用它即零额外体积、且与预览**同一渲染引擎**→保真度天然一致。代价：仅 Windows（跨平台 PDF 留待 §8 Phase 3 抽象）；依赖 `webview2-com`/`windows`（均为 Tauri 既有传递依赖，版本对齐 0.38/0.61，不增加分发体积）。

### 4.13 内容级全文搜索（v1.8）
- **双模式**：侧栏搜索框下方加分段切换「文件名 / 内容」。**文件名**模式沿用前端 `filterTree` 即时过滤树（零延迟、纯前端）；**内容**模式改为后端全文检索。
- **后端 `workspace::search_content(roots, query, limit)`**：递归收集所有工作区根下的 `.md/.markdown`（复用 `scan` 同款隐藏项过滤），逐文件 `read_to_string` 后**大小写不敏感**逐行子串匹配，命中即产出 `SearchHit { name, path, line(1-based), snippet(去首尾空白、截断 160 字) }`；文件先排序保证结果稳定；总命中达 `limit`（命令层固定 500）即提前返回，避免大工作区返回海量数据。
- **命令 `search_content`**：`async fn` + `spawn_blocking`（遍历读盘可能较慢，不阻塞主线程）；前端在内容模式且关键词非空时**防抖 250ms** 触发，切换/清空即取消未决请求。
- **前端结果列表**：内容模式下树区替换为命中列表，每条显示文件名 + 行号 + 两行片段摘要，点击直达 `openDoc`；显示命中总数或「无匹配结果」。
- **约束**：纯本地离线、不联网；仅检索 .md（与树一致），不碰其它文件类型。

### 4.14 微信深色模式预览 · 进阶版（v1.9）
- **独立开关，与界面外观解耦**：预览区标题栏加「微信深色预览」切换按钮（日/月图标）。该开关是**独立的持久化偏好**（`Config.wx_dark`），不再由全局浅色/深色外观驱动；但**首次启动**（`wx_dark` 从未持久化）默认跟随当前外观，保留 v1.3「深色界面→深色预览」的直觉，此后两者完全独立。
- **mp-darkmode 风格 HSL 颜色映射**（替换 v1.3 整块 CSS `invert`）：开启时前端 `wxDark.ts` 用 `DOMParser` 解析预览 HTML 片段，遍历每个元素的**内联样式**：
  - **前景色**（`color` + 四向 `border-*-color`）：深色文字→翻亮（`l' = max(0.6, 1-l)`），本就浅色的文字→保持浅（`min(0.92, l)`），饱和度轻微下调（×0.9）。
  - **背景色**（`background-color`）：浅底→压暗到约 `l'≈0.12–0.28`，深色/强调底→进一步压暗（`l'=l×0.55+0.05`）但**绝不翻亮**（避免把深色代码块/强调块变成刺眼亮块），饱和度下调（×0.8）。
  - 预览容器同步加深色底（`.preview.wx-dark`），图片轻微降透明度。
- **关键安全约束——只影响预览，绝不改输出**：复制到剪贴板的 CF_HTML、导出的 HTML/PDF **始终由 Rust 从 `md` 源重新渲染**，与预览 DOM 完全独立；`toWxDark` 仅作用于前端预览的 HTML 字符串副本，**复制/导出路径根本不经过它**。故无论开关如何，输出 HTML 的内联样式 100% 不变——满足「微信深色预览只影响预览展示，永不改变复制/导出结果」的硬约束。
- **为何用 HSL 映射而非 CSS invert**：`invert` 是整块像素反相，会把图片/代码块底色一并反转、需二次抵消且强调色会失真；按属性做 HSL 明度映射能**逐元素**保持语义（文字仍清晰、强调色仍为强调色、深块不被翻亮），更接近微信客户端真实深色渲染。代价是仅作用于已知内联颜色属性（`color`/`border-*-color`/`background-color`），渐变等复杂背景不处理——预览用途下足够。
- **约束**：纯前端、离线；解析失败或无内联颜色时安全回退为原 HTML。

### 4.15 可视化主题编辑器（v1.10）
- **入口**：视图菜单「主题编辑器…」（调色板图标），位于「自定义主题」分组之后。弹出 `ThemeEditor.tsx`（复用 `.help-*` 弹窗视觉语言，宽 720px、双列可滚动）。
- **数据模型 = 可序列化 `ThemeSpec`**：Rust 侧把内部 `Spec<'a>`（布局枚举 + `&'a str` 颜色）暴露为 `render::ThemeSpec`（String 颜色 + 字符串枚举 token：`head`=bar/underline/block/pill/bracket/academic/magazine/book，`quote`=bar/card/rule，`table`=grid/striped/three_line，`rule`=solid/dashed/double，`indent:bool`，`lh:String` + 12 项调色板 accent/head_c/soft/link/border/code_bg/code_fg/inline_bg/inline_fg/ph_border/ph_bg/ph_fg）。命令 `get_preset_spec(id)` 返回任一预设的 spec 供「基于预设载入」。
- **生命周期泛型技巧**：`Spec<'a>` 同时容纳预设的 `&'static str` 字面量与用户编辑产生的 owned `String`，共用同一 `build()`——无需为自定义主题复制 17 套预设的字面量。`ThemeSpec::to_theme()` → `build` → `Theme`。
- **实时预览**：编辑中的草稿（`draft.spec`）覆盖 `activeSpec`，主预览pane即时反映未保存的修改（无需第二个预览组件）；`activeSpec` 优先取草稿，其次取 `custom:<id>` 命中的已存自定义主题，否则为 null（走预设 id）。
- **持久化与选用**：自定义主题存于 `Config.custom_themes: Vec<CustomTheme{id,name_zh,name_en,spec}>`，随偏好写盘；选用时主题 id 加前缀 `custom:`，视图菜单单列「自定义主题」分组。`resolve_theme(theme, spec, params)`：`spec=Some` 走 `themed_spec`，否则走预设 `themed`——**自定义主题与预设共用同一渲染管线**，故输出仍是纯内联样式、微信安全，全局字体/字号/对齐参数照常追加。
- **约束**：纯本地离线；颜色输入 `type="color"` 且以 `/^#[0-9a-f]{6}$/i` 守卫，非法值回退黑；不改动 .md 源。

---

## 5. 关键技术风险与预研（Phase 0 Spikes，先做再建 UI）
1. **CF_HTML 剪贴板 → 微信粘贴保真**：验证 Rust 写 `HTML Format` 后，粘贴进 mp.weixin.qq.com 完整保留内联样式（表格、代码块着色、**编号占位块**）。*备选*：前端 `navigator.clipboard.write(ClipboardItem{'text/html'})`（验证 WebView2 支持度）。
2. **渲染一致性**：pulldown-cmark 自定义序列化 + 主题内联样式，在微信端与预览端表现一致（表格/代码块/引用块/占位块/公式降级）。

> 两个 spike 通过即进入 MVP。无边框标题栏、文件树、i18n、占位、存储、便携打包、GitHub Releases 更新均为成熟方案，无预研风险。

---

## 6. 性能与资源目标
- 冷启动 < 1.5s；空闲内存 < 150MB；**便携单 exe 体积 < 15MB**。
- 长文（~1 万字）渲染 < 100ms；渲染 debounce，UI 不卡顿。
- 大型工作区：目录树懒加载 + 虚拟化，扫描不阻塞 UI（Rust 后台线程）。
- 纯本地、无网络等待。

---

## 7. Windows 打包与自动更新
- **构建**：MSVC 工具链 + WebView2 Runtime（系统已装）。
- **最终产物：便携单文件 exe（首选且唯一分发形态）**
  - Tauri v2 的 release 二进制**已内嵌前端资源**，配合系统 WebView2 即可独立运行——`target\release\<app>.exe` 本身就是免安装的单文件绿色程序。
  - 分发：直接发布该 exe（可选打 zip 附版本号/说明）。用户下载后放任意目录双击即用，无需安装、无需管理员权限。
  - **依赖前提**：目标机器需已装 **WebView2 Runtime**（Win11 内置；部分 Win10 需装）。为坚持「单文件」，**不内嵌**体积庞大的 Fixed-Version WebView2（~150MB+）；对极少数缺失运行时的机器，文档/首启给出官方 Evergreen 安装引导。
  - 本期**不再产出** NSIS/MSI 安装器。
- **代码签名：本期不做（未签名）**
  - 未签名 exe 首次运行会触发 SmartScreen 警告（「更多信息 → 仍要运行」），便携程序尤其常见；已接受。
  - 未来补签名不影响架构（`signtool` 对单 exe 签名即可）。
- **自动更新（便携单文件形态，托管 GitHub Releases）**
  - GitHub Releases 发布：新版单 exe + `latest.json`（版本/说明/下载 URL/更新签名）。
  - ⚠ Tauri 内置 updater 以**安装器**为更新载体，与「便携单 exe」不完全契合。本期采用**自替换式更新**：应用检查 `latest.json` → 下载新 exe → **校验更新签名** → 退出时用新文件替换自身（运行中的 exe 先改名再落新文件）并重启。
  - **updater 签名仍必须**：即便不做代码签名，更新包仍需用本地生成的更新私钥（minisign）签名并在客户端校验，防篡改；私钥入 CI Secret，公钥写入配置。
  - **分步实现**：MVP 先做「检查更新 + 提示新版本 + 打开下载页」；完整「下载 + 校验 + 自替换」在 Release 硬化阶段补齐（比安装器更新多一点自定义工作）。
- **发布流水线（已脚手架，v1.10）**：`.github/workflows/release.yml` 在推送 `v*` 标签时于 `windows-latest` 上 `pnpm tauri build --no-bundle --target x86_64-pc-windows-msvc` 产出便携单 exe（cargo 二进制 `wxmd.exe` 重命名为 `MWMD.exe`），计算 SHA256，由 `scripts/make-latest-json.mjs` 生成 `latest.json`（version/notes/pub_date/platforms.windows-x86_64{url,sha256}），随 `MWMD.exe`、`MWMD.exe.sha256`、`latest.json` 一并发布到 GitHub Releases。
- **客户端检查更新（MVP 已实现，v1.10）**：仓库 `sandinsnow/MWMD`。帮助菜单「检查更新…」→ 前端 `src/update.ts` 用 WebView `fetch` 请求 **GitHub REST API** `repos/sandinsnow/MWMD/releases/latest`（`api.github.com` CORS 友好 `ACAO:*`，故走 API 而非 release 资产直链——后者 302 跳 CDN 常因缺 CORS 头被浏览器拦），读 `tag_name` 去 `v` 前缀与本机 `getVersion()` 逐段数值比对（`compareVersions`）。**有新版本**→ 确认弹窗「打开下载页」→ Rust 命令 `open_external`（仅放行受限字符集 https，无 shell 元字符，`cmd /C start` 注入安全）在默认浏览器打开 `releases/latest`；**已最新 / 失败**→ toast 提示。纯前端 fetch + 零新 Rust 依赖。
  - **未决（阻塞项）**：完整「下载新 exe + 校验 + 退出时自替换重启」尚未实现——① 下载需 HTTP 客户端，但本应用「纯离线」且当前构建环境**无法联网拉取新 crate**（`cargo add` 被分类器拦截），故须在**联网构建环境**补 HTTP/签名依赖；② **更新签名（minisign）**与客户端校验必须成对落地——现仅 SHA256（同源发布，只防损坏不防篡改），签名步骤待自替换实现时一并加入 CI；③ CI 与运行时 fetch 均**无法在本环境验证**（非 git、无网络、无 GUI）。本期 #31 交付：便携打包配置 + 发布 CI + `latest.json` 生成 + 客户端「检查更新」MVP。

### 7.3 跨平台（后期路线图，非本期）
> 目标：**macOS（.app/.dmg）** 与 **Linux（.deb/.rpm，可选 .AppImage）**。Windows 便携单 exe 仍是本期唯一交付形态；以下为后期迁移的关键改造点与风险，暂不实现。
- **剪贴板（最大改造点）**：当前 `CF_HTML`（winapi `RegisterClipboardFormatW`/`GlobalAlloc`/`SetClipboardData`）是 **Windows 专有**，粘贴进 mp.weixin.qq.com 靠它保留排版。跨平台需抽象出平台实现：
  - macOS：`NSPasteboard` 写 `public.html` 类型（+ `NSString` 兜底）。
  - Linux：X11/Wayland 分别经 `xclip`/`wl-copy` 写 `text/html`，或用 `arboard`/Tauri clipboard 插件（需验证其 HTML 支持是否满足微信保真）。
  - 方案：`copy_html(html, text)` 按 `#[cfg(target_os)]` 分派；**渲染源（内联样式 HTML）三端一致**，只换写入剪贴板的底层调用。
- **文件对话框 / 目录监听**：`rfd` 与 `notify` 本身跨平台，基本无需改；仅需处理 macOS 权限提示与 Linux 各发行版差异。
- **窗口装饰**：本期 `decorations:false` + 自绘标题栏。macOS 需适配红绿灯位置/`titleBarStyle`；Linux 各 WM 下自绘标题栏表现不一，可能需要按平台回退到原生装饰。
- **打包与更新**：mac 需 `.app`/`.dmg`（+ 可选公证/签名，避免 Gatekeeper 拦截）；Linux 需 `.deb`/`.rpm`（Tauri bundler 产 deb/rpm/appimage）。「便携单 exe 自替换更新」是 Windows 专属策略，其他平台改用各自安装器 + Tauri 内置 updater。
- **字体栈**：内联 `font-family` 已含跨平台字体（PingFang/微软雅黑/Arial 等），无需改；仅需确认各平台默认无衬线回退观感。
- **CI**：GitHub Actions 三平台矩阵构建（windows/macos/ubuntu）→ 各自产物 + updater 签名 → 发布 Releases。

---

## 8. 里程碑与路线图
> 落地顺序参照 `WEIMD-COMPARISON.md` §5（已按 v1.3–v1.6 实际进度校正）。

- **Phase 0 · 预研（0.5–1 天）** ✅：完成 §5 两个 spike。
- **Phase 1 · MVP（功能）** ✅：§1.2 第 1–10 项 + 「检查更新提示」，可日常用于「工作区写稿 → 排版 → 一键复制到公众号 → 按编号补图」。（v1.3–v1.5 追加工具栏分组、六级标题、17 套主题、帮助菜单、编辑器自动换行）
- **M4 / Release 硬化（P1）**：
  - **代码块语法高亮**（对比报告 §3.2）✅ **v1.6 已实现**：Rust 侧用 **syntect**（`regex-fancy` 纯 Rust 后端）输出**内联颜色 span**（微信剥离 class，必须内联）；配色按代码块底色明暗自适应（暗底 `base16-ocean.dark` / 浅底 `.light`），无语言回退纯文本（详见 §4.4）。
  - **导出单文件 HTML 与 PDF** ✅ **v1.7 已实现**：同一份内联样式渲染结果包成带打印 CSS 的完整文档；HTML 走 `rfd` 保存对话框落盘，PDF 走隐藏离屏窗口 + 系统 WebView2 `PrintToPdf` **静默生成**（无打印对话框、全事件驱动异步），纯离线、零额外体积（详见 §4.12）。
  - **便携单文件打包** + **CI（构建→发布 GitHub Releases）** + **检查更新 MVP** ✅/🟡 **v1.10**：`pnpm tauri build --no-bundle` 产出免安装单 exe（内嵌前端 + 图标，依赖系统 WebView2）；`.github/workflows/release.yml` + `scripts/make-latest-json.mjs` 在 `v*` 标签上构建、算 SHA256、生成 `latest.json` 并发布到 `sandinsnow/MWMD` 的 Releases；帮助菜单「检查更新…」前端 fetch GitHub API 比对版本、提示并打开下载页（`open_external` 命令）。**完整自替换更新（下载/校验/替换重启）+ minisign 更新签名**仍待补齐——阻塞于「当前环境无法联网拉取 HTTP/签名 crate + 无 git/GUI 验证」（详见 §7）；代码签名本期不做。
- **Phase 2 · 可选增强（P2/P3，不做联网业务）**：
  - **微信深色模式预览 · 进阶版**（对比报告 §3.1）✅ **v1.9 已实现**：新增**独立**「微信深色预览」开关（与全局外观解耦、各自持久化，首次启动默认跟随外观）；开启时前端对内联颜色做 **mp-darkmode 风格 HSL 映射**（替换 v1.3 整块 CSS `invert`）。**仅作用于预览展示，复制/导出由 Rust 从 md 重新渲染、绝不改变输出 HTML**（详见 §4.14）。
  - **内容级全文搜索**（对比报告 §3.3）✅ **v1.8 已实现**：Rust 侧遍历工作区 .md 匹配关键词，返回「文件 + 命中行」；侧栏搜索框支持「文件名 / 内容」两种模式。纯本地离线（详见 §4.13）。
  - **可视化主题编辑器**（对比报告 §3.4）✅ **v1.10 已实现**：视图菜单「主题编辑器…」把 `Spec` 的版式枚举（标题/引用/表格/分隔线）+ 缩进/行距 + 12 项调色板暴露为可编辑 UI，可基于预设载入、实时预览、保存为自定义主题（`Config.custom_themes`，`custom:<id>` 选用），与预设共用同一 Rust 渲染管线、输出仍纯内联样式（详见 §4.15）。**导入第三方主题**（外部 JSON/文件）暂未做，留待后续。
  - 其余：历史版本、原生公式/图表渲染评估、多平台导出（知乎/掘金）、WYSIWYG 单栏、补代码签名。（文件监听热刷新、多工作区根已提前实现）
- **Phase 3 · 跨平台**（后期，见 §7.3）：抽象平台剪贴板（Windows CF_HTML / macOS NSPasteboard / Linux xclip·wl-copy）→ 适配窗口装饰 → 各平台打包（.app/.dmg、.deb/.rpm/.AppImage）+ 平台原生 updater → GitHub Actions 三平台矩阵 CI。

---

## 9. 决策记录（已收口）与默认项
**已确认**
1. 自动更新托管：**GitHub Releases**。
2. 代码签名：**本期去掉，发布未签名包**（接受 SmartScreen 警告；保留后续补签名能力）。
3. 占位编号：图片与降级公式/图表**共用同一编号序列**。
4. 前端框架：**React**；窗口：**无边框自定义标题栏**；界面：**中英双语**。
5. 存储：**.md 文件 + 工作区根目录 + 左侧树形文件管理器**；图片/公式：**占位**。
6. **最终打包：便携单文件 exe**（免安装、绿色版；不再产出安装器）。

**采用默认（如需调整随时说）**
7. 占位辅助小字：默认显示 alt/文件名 与 公式源码，设置中可关闭。
8. 文件监听（notify 热刷新）：**已按用户要求实现**（左侧树监听工作区目录变化），非 Phase 2。
9. 工作区：**支持多根目录**（左侧树顶层管理，底部「＋ 新增」，悬停「移除」不删磁盘文件）——M2 已按用户要求实现，非 Phase 2。
10. 默认语言：跟随系统 + 可手动切换。
11. 便携形态下的自动更新：MVP 先「检查+提示」，Release 硬化补「下载+校验+自替换」。
12. WebView2：依赖系统运行时（不内嵌 Fixed-Version），缺失时首启引导安装。

**M3+ 追加决策（用户确认）**
13. 字体/字号/对齐为**全局文章主题参数**（在预设主题上追加内联样式），**不做逐块 HTML 覆盖**（见 §4.4）。
14. 图片/公式**占位文案固定中文**；多语言**只作用于软件界面**，不进入文章内容；渲染命令**移除 locale 入参**（见 §4.6/§4.9）。
15. **文章主题与编辑器外观（浅色/深色）相互独立**，各自持久化（见 §4.4）。
16. 前端 i18n 采用**内置零依赖字典**（`src/i18n.ts`），替代原计划的 i18next（文案量小，做减法）。
17. 新增**自定义菜单栏**（文件/视图/帮助，含打开文件/打开文件夹等）与**内置 SVG 图标集**统一视觉（见 §4.10/§4.11）。
18. **左侧树监听工作区目录**：Rust `notify` 递归监听各根目录 → `fs-changed` 事件 → 前端 debounce(400ms) 重扫，外部拖放/新建及时显示（见 §4.2）。
19. **界面字体/字号**：「视图」菜单单选，经 CSS 变量 `--ui-font`/`--ui-size` 只作用于界面 chrome，**不影响文章内容/预览**（见 §4.9）。
20. **关于菜单**：菜单栏顶层「关于」按钮，弹窗显示应用名/说明/版本号（`getVersion()`）（见 §4.10）。

**v1.2 追加决策（用户确认）**
21. 产品定名 **MWMD**；名称仅在「关于」与本规格文件展示，标题栏用 **Logo 图标**替代文字名（见 §4.8/§4.10）。
22. **菜单栏并入标题栏**同一行（图标 → 菜单 → 拖拽区 → 复制 → 窗口按钮），取消独立菜单行（见 §4.8/§4.10）。
23. **全局深色主题**：外观切换作用于整个界面 chrome（CSS 变量调色板 + `html.dark`）；~~预览画布保持白底~~ **→ v1.3 修订为预览随外观反相**（见 #27）。
24. 文章主题扩充至 **10 套**（新增 7 套由 `build(Pal)` 调色板构造器生成）（见 §4.4）。
25. 工具栏**标题改为下拉**（正文/H1–H6，编辑动作，改写 md）；**字体列表补充常用 web 字体**（渲染参数，仅影响预览、不改 md）（见 §4.4/§4.11）。
26. 编辑/预览**分区标题**【Markdown】【实时预览】；左侧树与预览区**可折叠到边缘**（见 §4.11）。

**v1.3 追加决策（用户确认）**
27. **预览深色（v1.9 改为独立「微信深色预览」开关 + HSL 映射）**：~~v1.3 用 `.pv-content` 整块 `filter: invert(1) hue-rotate(180deg)` 随外观反相~~ → **v1.9 解耦为独立持久化开关**（`Config.wx_dark`，首次启动默认跟随外观），开启时前端 `wxDark.ts` 用 `DOMParser` 逐元素映射内联颜色（前景 `color`/`border-*-color` 深→翻亮、浅→保持；背景 `background-color` 浅→压暗、深→再压暗不翻亮），预览容器加深色底。**仅前端预览展示；复制/导出由 Rust 从 md 重新渲染、输出 HTML 不变**（反转 #23 旧决策；见 §4.14）。
28. 工具栏图标**按功能分组**：行内（粗/斜/删/码/链）· 块级（引用/有序/无序 + 标题下拉）· 插入（代码块/表格/分隔线/图片）· 样式（字体/字号/对齐），组间用分隔线（见 §4.11）。
29. **跨平台列为后期路线图**（非本期）：目标 macOS（.app/.dmg）、Linux（.deb/.rpm，可选 .AppImage）。关键改造点见 §7.3；Windows 便携单 exe 仍是本期唯一交付形态（见 §7/§8）。

**v1.4 追加决策（用户确认）**
30. **H1–H6 六级标题各自独立版式**：字号/字重/颜色/装饰逐级递减形成清晰层级，修正此前 H4–H6 复用 H3 的问题（见 §4.4）。
31. **主题差异化 = 配色 + 版式**：引入 5 种标题版式（`Head` 枚举：竖条/下划线/色块/胶囊/双线），10 套主题按 2×5 分配，使主题之间结构不同而非仅换色；圆角形状语言随版式统一（参考 WeiMD 多主题思路）（见 §4.4）。**→ v1.5 扩展**：标题版式增至 8 种并新增引用/表格/分隔线版式，主题增至 17 套分两类（见 #33–36）。
32. **标题不受全局字号/对齐覆盖**：全局排版参数只把**字体族**追加到标题，字号阶梯与对齐保留为主题版式设计（见 §4.4）。

**v1.5 追加决策（用户确认）**
33. **编辑器自动换行**：CodeMirror 扩展显式加入 `EditorView.lineWrapping`（`basicSetup` 不含），并给编辑/预览分栏补 `min-width:0`，修复长文档把预览挤出可视窗的问题（见 §4.11）。
34. **帮助菜单**：菜单栏新增「帮助」→「Markdown 语法」，弹出中英双语的基本语法对照表（标题/强调/链接/图片/引用/列表/任务列表/代码/表格/分隔线/换行等）（见 §4.11）。
35. **主题版式模型扩展到全板块**：在标题版式（`HeadStyle` 增至 8 种，新增 `Academic`/`Magazine`/`Book`）之外，新增 `QuoteStyle`（Bar/Card/Rule）、`TableStyle`（Grid/Striped/ThreeLine）、`RuleStyle`（Solid/Dashed/Double）三族版式，正文加 `indent`（首行缩进 2em）与 `lh`（行距）旋钮；表格新增 `td_alt` 支持隔行斑马底（渲染器按 `body_row` 奇偶切换）。解决「版式单调、无法区分板块层级」（见 §4.4）。
36. **17 套主题分两类 + 视图菜单分组**：`ThemeMeta` 增 `category`（`color` 配色 8 套 / `publish` 出版风格 9 套）；新增商务/学术/科研/科技/职场/报告/论文/杂志/书籍出版风格主题（`business`/`tech` 沿用旧 id 以兼容已持久化偏好，归入 `publish`）；视图菜单「文章主题」按类别分组展示（见 §4.4）。

**v1.6 追加决策（用户确认）**
37. **代码块语法高亮 = syntect 内联 span**（对比报告 §3.2 / M4-A）：用 `syntect`（`default-features=false` + `regex-fancy` 纯 Rust 后端，免 oniguruma C 依赖，利于 Windows 单文件分发）逐行高亮，`styled_line_to_highlighted_html(.., IncludeBackground::No)` 只产出前景色 span（背景仍归主题 `pre`）。**配色按代码块底色明暗自适应**（`Theme.code_dark` 由 `code_bg` 亮度判定 → 暗底 `base16-ocean.dark` / 浅底 `.light`），解决 minimal 等浅底主题不可读问题；**无语言/未识别/出错回退转义纯文本**；`SyntaxSet`/`ThemeSet` 用 `OnceLock` 进程内缓存（实时预览防抖重渲染，不可每次重载）。微信深色预览开启时高亮 span 前景色一并经 §4.14 HSL 映射、`pre` 背景压暗不翻亮，配色不失真（见 §4.4）。

**v1.7 追加决策（用户确认）**
38. **导出 HTML/PDF = 同一份打印文档，PDF 用 WebView2 静默生成**：复用渲染管线（`render_markdown`+`themed`）保证导出与预览/复制完全一致，再 `standalone_document` 包成带打印 CSS（`@page`/`print-color-adjust:exact`/防跨页割裂）的完整文档。HTML 经 `rfd::AsyncFileDialog` 保存对话框落盘；PDF **不走系统打印对话框**，而是复用系统自带 **WebView2 运行时**：隐藏离屏窗口 `NavigateToString` 载入 → 注册 `NavigationCompleted` 回调 → 回调内 `ICoreWebView2_7::PrintToPdf`（`CreatePrintSettings`：保留背景色、无页眉脚、纵向、18mm 边距）静默写盘。**两命令均为 `async fn`、PDF 全事件驱动无嵌套消息泵**：命令线程仅在 `spawn_blocking` 内 `recv_timeout` 等回调结果。**理由**：纯离线 + 便携单文件约束下，wkhtmltopdf/Chromium 要打包浏览器内核（+100MB），违背「单 exe、免安装、无网络」；WebView2 是 Windows 上 Tauri 本就依赖的系统运行时，`PrintToPdf` 零额外体积且与预览同一渲染引擎→保真一致。异步化则因 Tauri 同步命令跑主线程、嵌套消息泵等 WebView2 回调会永久卡死 UI（复制/按钮全失效）。**取舍**：用户要求静默，故放弃 v1.7 初版的 iframe+`window.print()` 方案；当前仅 Windows，跨平台 PDF 留待 Phase 3（见 §4.12）。

**v1.8 追加决策（用户确认）**
39. **内容级全文搜索 = 后端遍历 .md + 双模式侧栏**（对比报告 §3.3 / P2）：侧栏搜索框加分段切换「文件名 / 内容」；文件名沿用前端 `filterTree` 即时过滤，内容模式走后端 `workspace::search_content(roots, query, limit)`——递归收集 .md（复用隐藏项过滤）、大小写不敏感逐行子串匹配，产出 `SearchHit{name,path,line,snippet}`，文件先排序、达上限（500）提前返回。命令 `async fn`+`spawn_blocking`，前端防抖 250ms。纯本地离线（见 §4.13）。

**v1.9 追加决策（用户确认）**
40. **微信深色预览 = 独立开关 + 前端 HSL 颜色映射**（对比报告 §3.1 进阶版）：与界面外观**解耦**为独立持久化偏好（`Config.wx_dark`），首次启动默认跟随外观以保留 v1.3 直觉，此后独立。开启时前端 `wxDark.ts` 用 `DOMParser` 逐元素映射内联颜色（前景深→翻亮/浅→保持，背景浅→压暗/深→再压暗不翻亮），替换 v1.3 整块 `invert`。**核心约束：只作用于预览展示——复制/导出始终由 Rust 从 md 重新渲染，`toWxDark` 不在输出路径上，故输出 HTML 100% 不变**（见 §4.14）。

**v1.10 追加决策（用户确认）**
41. **可视化主题编辑器 = 暴露可序列化 `ThemeSpec`，自定义主题共用同一渲染管线**（对比报告 §3.4 / P3）：把内部 `Spec<'a>` 以 `render::ThemeSpec`（String 颜色 + 字符串枚举 token）序列化暴露，前端 `ThemeEditor.tsx` 编辑；`Spec<'a>` 生命周期泛型让预设的 `&'static str` 与用户编辑的 owned `String` 共用同一 `build()`，免去复制 17 套预设字面量。自定义主题存 `Config.custom_themes`、以 `custom:<id>` 选用，`resolve_theme` 据 `spec` 是否 `Some` 决定走 `themed_spec`/`themed`——**与预设同一管线，输出仍纯内联样式、微信安全**；草稿覆盖 `activeSpec` 实现主预览实时反映未保存修改（见 §4.15）。
42. **Logo 单一源 = `src/app-icon.svg`**：界面标题栏左上角图标用 Vite `<img>` 直接导入该 SVG，打包图标集由 `pnpm tauri icon src/app-icon.svg` 从**同一文件**栅格化生成（icon.ico/png/icns + Windows Store 尺寸），二者天然一致。**约束：改 Logo 必须同步重跑 `pnpm tauri icon`**，否则界面与打包图标会脱节（见 §4.8）。


---

## 附录 A · 微信公众号排版约束速查（本地渲染需遵守）
| 约束 | 说明 | 应对 |
|---|---|---|
| 仅内联样式生效 | `<style>`/class/外部 CSS 被剥离 | 主题以「元素→内联 style 串」实现，序列化时注入 |
| 外部字体不生效 | @font-face/网络字体被忽略 | 只用系统字体栈 |
| 外链图片被过滤 | 非微信图床 `<img>` 不显示 | 本期**不处理图片**，统一编号占位，用户手动补图 |
| 公式/图表不支持 | 无法原生渲染 LaTeX/Mermaid | 降级为编号占位（附源码），用户外部出图后插入 |
| 代码块着色 | class 高亮失效 | syntect 输出**内联颜色** span |
| 表格 | 需内联边框/内边距 | 主题对 table/th/td 注入内联样式 |

## 附录 B · 编号占位块（示意，最终以主题内联样式实现）
```html
<section style="border:2px dashed #ff8a3d;background:#fff6ef;color:#b3541e;
  text-align:center;padding:16px;margin:16px 0;border-radius:6px;">
  <p style="margin:0;font-size:15px;font-weight:bold;">【此处插入图片 1】</p>
  <p style="margin:6px 0 0;font-size:12px;opacity:.8;">cover.png</p>
</section>
```
