---
name: antigravity-zh-cn
description: Antigravity (AGY) 全域简体中文汉化与 Claude 暖色主题增强技能包（基于 Anarcadia/chuanban-antigravity-theme-patch v5.0.0 扩展）。当用户询问如何将 Antigravity 2.0 界面、右键菜单、三点菜单、设置中心、技能与插件市场切换为中文，或需要调整字体颜色、重点字高亮、优化长对话切换卡顿及通过 CDP 实时热更新界面时激活此技能。
---

# Antigravity 全域汉化与主题增强技能指南 (`antigravity-zh-cn` · `v1.2.0` 适配 `Antigravity v2.31.2+`)

> **开源基础与致谢**：本技能底层热注入框架源自 [**Anarcadia/chuanban-antigravity-theme-patch (v5.0.0)**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)，在保持 `core/*` 100% 原版完整性 (`coreIntegrity.clean: true`) 的前提下，于 `user/*` 层扩展了 **2,515 条全域汉化词条**、**85% 上下文自动压缩防卡死胶囊 (`⚡85%自动`)**、**Electron 原生右键/三点菜单瞬时拦截**、**朱砂红重点字与等高数字排版**以及**长对话极速防卡顿优化**。

---

## 一、架构铁律（修改前必读）

1. **严禁修改 `core/*` 文件**：
   - `core/theme.css`、`core/runtime.js`、`core/i18n.json`、`core/daemon.mjs`、`core/manifest.json` 必须保持与上游原版字节级一致，确保 `window.__ag_theme_status().coreIntegrity.clean === true`。
2. **所有定制统一写入 `user/*`**：
   - 新增或修改汉化词条 ➔ 编辑 `user/i18n.override.json`
   - 调整颜色、字体、重点字高亮、文件胶囊样式或渲染性能 ➔ 编辑 `user/custom.css`
   - 调整右键菜单拦截、相对时间转换、DOM 观察器逻辑 ➔ 编辑 `user/custom.js`
   - 调整功能开关（如 `excludeI18n`、监控模式） ➔ 编辑 `user/config.json`
3. **默认补丁安装目录**：
   - `~/.gemini/antigravity/theme-patch`（Windows 下为 `C:\Users\Administrator\.gemini\antigravity\theme-patch`）

---

## 二、核心机制速查

### 1. 为什么右键菜单 (`Copy` / `Pin` / `Delete`) 和三点菜单 (`⋮`) 能被汉化？
Antigravity 在 Windows 上开启了 `contextMenuSystem: { enabled: true, useNativeMenu: true }`，右键菜单与 `⋮` 菜单通过 `VRa(a, b)` (`a.map(...)`) 映射后直接发送给 `window.electronNative.showContextMenu(a)`，不经过 DOM 树。
- 在 `user/custom.js` 中，我们通过 `enableTempMenuMapHook()` 监听 `contextmenu`、`pointerdown` 与 `mousedown` 事件，**仅在点击瞬间开启 120ms 的 `Array.prototype.map` 拦截窗口**，将 `{ id, label, submenu }` 中的英文原地替换为 `DICT` 中的中文；
- 120ms 后立即恢复原版 `Array.prototype.map`，确保平时 100% 为 `[native code]` 零损耗。
- 同时禁用了 `window.__ag_i18n_observer.disconnect`，防止点击侧边栏行内按钮时观察器被意外挂起。

### 2. 如何新增未汉化的词条？
1. 将需要翻译的英文原词（区分大小写，去除首尾空格）与对应中文写入 `user/i18n.override.json`。
2. 若涉及本地已安装的技能 (`SKILL.md`) 或插件 (`plugin.json`) 描述，可运行：
   ```bash
   node scripts/localize-local-skills.mjs
   ```
3. 执行下方的 **CDP 零重启热更新命令** 即可在 1 秒内生效。

### 3. 如何调整重点字（加粗文字 `strong` / `b`）颜色与数字排版？
在 `user/custom.css` 的第 6 节中修改：
```css
/* 重点加粗文字：默认使用朱砂暖砖红 #B43E18，深色模式自动切换为琥珀暖金 #F0944D */
[data-testid="autoscroll-viewport"] .leading-relaxed.select-text strong,
[data-testid="autoscroll-viewport"] .leading-relaxed.select-text b {
  color: #B43E18 !important;
  font-weight: 700 !important;
}
```
同时全局启用了 `font-variant-numeric: lining-nums !important;`，解决衬线字体下旧式数字（`3, 4, 5, 7, 9`）上下错位的问题。

---

## 三、CDP 零重启实时热更新指令

当修改完 `user/custom.css`、`user/custom.js` 或 `user/i18n.override.json` 后，无需重启 Antigravity，直接运行以下单行 Node 脚本即可在 1 秒内热更新所有已打开窗口：

```bash
node -e "const http=require('http'),fs=require('fs'),p='C:/Users/Administrator/.gemini/antigravity/theme-patch';const css=fs.readFileSync(p+'/core/theme.css','utf8')+'\n'+fs.readFileSync(p+'/user/custom.css','utf8');const i18n={...JSON.parse(fs.readFileSync(p+'/core/i18n.json','utf8')),...JSON.parse(fs.readFileSync(p+'/user/i18n.override.json','utf8'))};const cfg=JSON.parse(fs.readFileSync(p+'/user/config.json','utf8'));const js=fs.readFileSync(p+'/core/runtime.js','utf8').replace('__CSS_PLACEHOLDER__',()=>JSON.stringify(css)).replace('__I18N_PLACEHOLDER__',()=>JSON.stringify(i18n)).replace('__CONFIG_PLACEHOLDER__',()=>JSON.stringify(cfg)).replace('__META_PLACEHOLDER__',()=>JSON.stringify({injectedAt:new Date().toISOString(),coreIntegrity:{clean:true,modified:[]}})).replace('/*__CUSTOM_JS_PLACEHOLDER__*/',()=>fs.readFileSync(p+'/user/custom.js','utf8'));http.get('http://127.0.0.1:9222/json',r=>{let d='';r.on('data',c=>d+=c);r.on('end',async()=>{for(const t of JSON.parse(d).filter(x=>x.type==='page'&&x.webSocketDebuggerUrl)){const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(res=>{ws.onopen=()=>{ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'if(window.__ag_cleanup)window.__ag_cleanup();'+js}}));};ws.onmessage=m=>{if(JSON.parse(m.data).id===1){ws.close();res();}};});}console.log('Hot-reload complete!');});});"
```
