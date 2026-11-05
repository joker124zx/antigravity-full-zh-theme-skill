# Antigravity 全域汉化与 Claude 暖色主题增强包 (Full-Domain ZH-CN & Theme Skill)

<p align="center">
  <strong>面向 Google Antigravity 2.0 (Electron) 的零破坏、全场景深度汉化与视觉/性能增强方案（支持作为 Agent Skill 一键调用）</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Antigravity-2.0%2B-B43E18?style=flat-square" alt="Antigravity 2.0+" />
  <img src="https://img.shields.io/badge/i18n_Dictionary-2200%2B_Entries-2E6B9E?style=flat-square" alt="2200+ Entries" />
  <img src="https://img.shields.io/badge/Core_Integrity-100%25_Clean-2E7D32?style=flat-square" alt="Core Integrity Clean" />
  <img src="https://img.shields.io/badge/License-MIT-7A6A58?style=flat-square" alt="MIT License" />
</p>

> [!IMPORTANT]
> **开源致谢与演进声明 (Credits & Attribution)**
>
> 本项目基于 [**@Anarcadia (传伴)**](https://github.com/Anarcadia) 开源的 [**`chuanban-antigravity-theme-patch` (v5.0.0)**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) 进行深度扩展与二次封装。
> - **完整保留原作者底层核心架构**：`core/*` 目录下的 CDP 零修改磁盘热注入引擎、四主题 CSS 变量体系（Claude 暖米色 / 深色 / 护眼绿 / 极夜黑）与双通道统计面板 **100% 保持原版未改动**（`coreIntegrity.clean: true`）。
> - **全量扩展在 `user/*` 用户层与 `SKILL.md` 技能层完成**：词条规模从原版 573 条扩展至 **2,200+ 条全域词典**，攻克了 Windows 原生系统级右键菜单（`showContextMenu` IPC）与三点菜单（`⋮`）无法被 DOM 观察器汉化的难题，并新增了重点文字配色增强、长对话极速防卡顿与 Agent Skill 自动化技能支持。在此向原作者 **@Anarcadia** 致以诚挚谢意！

---

## 一、界面实机截图展示 (Screenshots)

### 1. 主界面总览：Claude 暖米色纸张质感 + 重点字朱砂红 + 彩色文件胶囊 + 双弧旋转指示器
![主界面总览](assets/screenshots/01-main-overview.png)

### 2. 原生系统右键菜单与会话三点菜单 (`⋮`) 100% 汉化
![右键与三点菜单汉化](assets/screenshots/02-context-menu-zh.png)

### 3. 设置中心 (`Settings`) 全量深度汉化（含二级选项、提示说明与下拉框）
![设置中心全量汉化](assets/screenshots/03-settings-full-zh.png)

### 4. 技能与插件市场 (`Skills & Plugins`) 列表、分类与详情页汉化
![技能与插件市场汉化](assets/screenshots/04-skills-plugins-zh.png)

---

## 二、为什么叫「全域汉化」？与原版方案对比

| 维度 | 上游原版 (`chuanban-antigravity-theme-patch` v5.0.0) | 本项目 (`antigravity-full-zh-theme-skill` 全域增强版) |
| :--- | :--- | :--- |
| **汉化词条规模** | `core/i18n.json` **573 条**基础界面词条 | `core` + `user/i18n.override.json` 合并 **2,200+ 条**全域词典 |
| **原生右键菜单 (`Copy`/`Pin`)** | 未汉化（Windows 走 Electron `showContextMenu` 原生系统菜单，绕过 DOM） | **100% 汉化**：按需 120ms 窗口拦截 `VRa` IPC 映射，平时保持 `[native code]` 零性能损耗 |
| **会话三点菜单 (`⋮`) 与顶栏更多** | 部分遗漏或点击瞬间断连失效 | **100% 汉化**：支持 `重命名`、`置顶/取消置顶`、`标为未读`、`复制`、`分屏`、`归档`、`删除` |
| **技能 (`Skills`) / 插件 (`Plugins`) / MCP** | 仅主菜单标题汉化 | **全量汉化**：40+ 项内置/常用技能描述、插件市场分类货架、MCP 工具状态与斜杠命令 (`/plan`, `/compact`, `/boost` 等) |
| **侧边栏相对时间 (`5m`, `17h`, `3mo`)** | 保持英文缩写 | **自动转中文**（`5分钟`、`17小时`、`3个月`、`刚刚`），正则兜底支持任意数字分钟/小时/天/周/月/年 |
| **新生成会话标题** | 默认生成英文标题 | 自动注入 `<user_rules>` 守卫，所有新建对话**自动使用简体中文生成侧边栏标题** |
| **重点加粗字 (`strong`/`b`) 与数字排版** | 与正文同色，旧式数字 (`57,793`) 高低错落 | **朱砂暖红 (`#B43E18`) 醒目高亮** + 强制开启 **`lining-nums` 等高现代数字** |
| **代码文件胶囊 (`.inline-pill`)** | 统一棕黄色背景 | **按扩展名自动分色**：`.js/.mjs` 琥珀金、`.json` 鼠尾草绿、`.css` 雾霾紫、`.ts/.tsx` 湖水蓝、`.md` 暖陶橙、`.py` 钢青色 |
| **长对话切换与流式打字性能** | 大型 `.db` 会话切换易卡顿 | **`excludeI18n: true`** 隔离流式输出 + **`content-visibility: auto`** 跳过屏外消息排版 + **SQLite 400ms 防抖避让** |
| **重启软件保持能力** | 需带参数启动或手动重注 | 内置 **Windows WMI 事件监听守护进程 (`AntigravityThemeDaemon.vbs`)**，任意方式打开软件 1.5 秒内自动无感挂载 |

---

## 三、核心技术亮点解析

### 1. 攻克 Electron 原生右键菜单 (`showContextMenu`) 汉化难题
在 Windows 端，Antigravity 默认启用了 `contextMenuSystem: { enabled: true, useNativeMenu: true }`。当用户在对话区右键点击或点击会话右侧的 `⋮` 按钮时，前端通过 `VRa(a, b)` 将菜单数组映射后直接通过 IPC 发送给 `window.electronNative.showContextMenu(a)`，由 Windows 操作系统原生绘制菜单，**完全不经过浏览器 DOM 树**，因此常规 `MutationObserver` 无法捕捉。

本项目在 [`user/custom.js`](user/custom.js) 中首创了**「事件触发式瞬时 Hook (`enableTempMenuMapHook`)」**：
- 仅在用户按下鼠标右键 (`contextmenu`) 或点击菜单触发按钮 (`pointerdown` / `mousedown`) 的 **120 毫秒窗口内**，临时挂载 `Array.prototype.map` 转换器，将传入 IPC 的 `{ id, label, submenu }` 原地翻译为中文；
- 菜单弹出后立即卸载恢复，保证平时 99.99% 的运行时间里 `Array.prototype.map` 均为 **100% V8 原生 `[native code]`**，绝不拖慢 React 渲染。

### 2. 为什么打开几百 MB 的老对话框不卡了？
Antigravity 会将 Agent 执行过程中的所有工具输出、文件读取与终端日志完整保存在本地 `~/.gemini/antigravity/conversations/<id>.db` 中（重度对话可达 100MB~300MB、数万个 Step）。本项目通过三层优化显著提速：
1. **CSS 视口虚拟化 ([`user/custom.css`](user/custom.css))**：对历史消息块与 `<pre>` 代码块开启 `content-visibility: auto; contain-intrinsic-size: auto 120px;`，浏览器仅排版当前屏幕可见的几条消息，跳过屏外上万行 DOM 计算。
2. **流式输出隔离 ([`user/config.json`](user/config.json))**：开启 `excludeI18n: true`，在 AI 高速打字输出与代码块渲染期间跳过无意义的字典扫描。
3. **SQLite 磁盘 I/O 避让 ([`user/custom.js`](user/custom.js))**：对 `window.__agRequestMetrics` 施加 400ms 防抖延迟，避免切换会话瞬间与 `language_server` 争抢 SQLite 文件锁。

### 3. 精心调校的阅读排版与视觉细节
- **重点加粗文字 (`strong` / `b`)**：采用与米白纸张底色 (`#F7F3EA`) 最契合的**朱砂暖砖红 (`#B43E18`)**，醒目提炼长文核心结论且久看不刺眼。
- **数字等高对齐 (`font-variant-numeric: lining-nums`)**：彻底修复衬线体下数字 `3, 4, 5, 7, 9` 下沉导致的视觉参差感（如 `288 MB (57,793 步)`、`1.5 亿字` 底部严丝合缝对齐）。
- **双弧旋转指示器 (`ag-spin`)**：将原本生硬闪烁的 `Thinking` 静态圆点替换为顺滑旋转的双弧暖橙色动态加载环。

---

## 四、快速安装与使用指南

### 方式 A：作为独立补丁一键安装（推荐）

```bash
# 1. 克隆本仓库到本地推荐路径
git clone https://github.com/joker124zx/antigravity-full-zh-theme-skill.git ~/.gemini/antigravity/theme-patch
cd ~/.gemini/antigravity/theme-patch

# 2. 一键安装并立即热注入到当前运行中的 Antigravity
node install.mjs
```

- **可选：一键汉化本地已安装的内置技能与插件描述 (`SKILL.md` / `plugin.json`)**：
  ```bash
  node scripts/localize-local-skills.mjs
  ```
  > 该脚本会自动为修改的文件生成 `.bak` 原文备份，安全可逆。

- **Windows 开机/重启软件自动常驻守护**：
  将仓库根目录下的 `AntigravityThemeDaemon.vbs` 复制到 Windows 启动目录（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`），即可实现任意方式打开 Antigravity 自动在 1.5 秒内完成汉化挂载。

### 方式 B：作为 Antigravity Agent Skill 安装

将本仓库（或其中的 [`SKILL.md`](SKILL.md)）放置于 `~/.gemini/config/skills/antigravity-zh-cn/` 目录下。之后您可以直接在 Antigravity 对话框中对 AI 说：
- *“帮我把 Antigravity 汉化成中文”*
- *“这个右键菜单/某个新按钮还没翻译，帮我加到汉化词典里”*
- *“帮我把重点加粗文字换成深蓝色并热更新”*

Agent 会自动读取 [`SKILL.md`](SKILL.md) 规范，直接编辑 `user/*` 并通过 CDP 热重载立即生效，**无需重启软件**。

---

## 五、目录结构与零破坏架构 (`core` vs `user`)

```text
antigravity-full-zh-theme-skill/
├── core/                         # [原版核心层] 100% 保持上游 v5.0.0 原貌 (coreIntegrity.clean: true)
│   ├── theme.css                 # 四套主题色彩系统与基础排版变量
│   ├── runtime.js                # CDP 热注入引擎、DOM 翻译器与状态栏统计监控
│   ├── daemon.mjs                # 跨平台 CDP 热注入与 SQLite/API 统计守护服务
│   ├── i18n.json                 # 上游基础 573 条界面词典
│   └── manifest.json             # 核心文件 SHA-256 完整性校验清单
├── user/                         # [全域扩展层] 所有汉化增强、右键拦截与样式定制均在此处
│   ├── config.json               # 启用 excludeI18n、双通道监控与主题预设
│   ├── custom.css                # 朱砂红重点字、lining-nums 数字对齐、彩色文件胶囊、长对话性能优化
│   ├── custom.js                 # 原生右键/三点菜单瞬时拦截、相对时间汉化、SQLite 防抖与观察器防断连
│   └── i18n.override.json        # 1,746+ 条扩展词典（覆盖右键、设置、技能、插件、MCP、斜杠命令）
├── scripts/
│   └── localize-local-skills.mjs # 本地 SKILL.md / plugin.json 描述一键汉化工具（带 .bak 备份）
├── assets/
│   └── screenshots/              # 界面实机截图展示 (01 ~ 04)
├── AntigravityThemeDaemon.vbs    # Windows WMI 零弹窗后台自动热注入守护脚本
├── SKILL.md                      # Antigravity 技能定义文件（支持 AI 自动维护与热更新）
├── install.mjs                   # 跨平台一键安装与热更新脚本
└── LICENSE                       # MIT 开源协议（含上游致谢）
```

---

## 六、致谢与开源协议 (Credits & License)

- **上游基础项目**：[**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) — 感谢 **@Anarcadia (传伴)** 设计的无侵入式 CDP 注入架构、四套精美主题配色与双通道统计面板。
- **全域汉化与性能/视觉扩展**：[**@joker124zx**](https://github.com/joker124zx) — 扩展 2,200+ 全域词典、攻克原生右键与三点菜单汉化、优化长历史对话卡顿并封装为 Agent Skill。
- **开源协议**：本项目遵循 [MIT License](LICENSE) 开源协议。
