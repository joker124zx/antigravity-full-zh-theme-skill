/**
 * user/custom.js — 极速切换对话（增量 O(1) 脏节点汉化，彻底告别全屏 TreeWalker 卡顿）、按需右键/三点菜单汉化（平时 100% 原生 Array.map）与 85% 上下文自动压缩守卫
 */
(() => {
  // 1. 清理任何旧版残留定时器和额外 Observer，防止热更新时旧 MutationObserver 叠加泄漏
  if (window.__ag_custom_i18n_observer) {
    try {
      window.__ag_custom_i18n_observer.disconnect();
    } catch (e) {}
    window.__ag_custom_i18n_observer = null;
  }
  if (window.__ag_prev_i18n_observer && window.__ag_prev_i18n_observer !== window.__ag_i18n_observer) {
    try {
      const realDisc = window.__ag_prev_i18n_observer.__realDisconnect || window.__ag_prev_i18n_observer.disconnect;
      if (typeof realDisc === 'function') realDisc.call(window.__ag_prev_i18n_observer);
    } catch (e) {}
  }
  if (window.__ag_i18n_observer) {
    if (!window.__ag_i18n_observer.__realDisconnect) {
      window.__ag_i18n_observer.__realDisconnect = window.__ag_i18n_observer.disconnect.bind(window.__ag_i18n_observer);
    }
    window.__ag_prev_i18n_observer = window.__ag_i18n_observer;
  }

  // 2. 恢复 100% 原生 Array.prototype.map，仅在右键菜单 (contextmenu) 或点击「更多选项 (⋮)」按钮的 80ms 窗口内按需拦截汉化菜单
  if (window.__ag_orig_array_map) {
    Array.prototype.map = window.__ag_orig_array_map;
  } else {
    window.__ag_orig_array_map = Array.prototype.map;
  }
  const origArrayMap = window.__ag_orig_array_map;

  function translateMenuLabel(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const dict = window.__ag_i18n_dict;
    if (dict && typeof dict[trimmed] === 'string') {
      return dict[trimmed];
    }
    if (trimmed.endsWith(' (Default)')) {
      const base = trimmed.slice(0, -10).trim();
      const baseZh = dict && typeof dict[base] === 'string' ? dict[base] : base;
      return `${baseZh}（默认）`;
    }
    if (trimmed.startsWith('Move to Group: ')) {
      return '移动到分组：' + trimmed.slice(15);
    }
    if (trimmed.startsWith('Close ')) {
      return '关闭 ' + trimmed.slice(6);
    }
    if (trimmed.startsWith('Open in ')) {
      return '在 ' + trimmed.slice(8) + ' 中打开';
    }
    return raw;
  }

  function translateMenuItemsInPlace(arr) {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || typeof item !== 'object') continue;
      if (typeof item.label === 'string') {
        item.label = translateMenuLabel(item.label);
      }
      if (Array.isArray(item.submenu)) {
        translateMenuItemsInPlace(item.submenu);
      }
      if (Array.isArray(item.items)) {
        translateMenuItemsInPlace(item.items);
      }
    }
  }

  let mapRestoreTimer = null;
  function enableTempMenuMapHook() {
    if (mapRestoreTimer) clearTimeout(mapRestoreTimer);
    Array.prototype.map = function (fn, thisArg) {
      const res = origArrayMap.call(this, fn, thisArg);
      if (res.length > 0 && res.length <= 60) {
        const first = res[0];
        if (
          first &&
          typeof first === 'object' &&
          !first.$$typeof &&
          (('label' in first && ('accelerator' in first || 'onClick' in first || 'type' in first)) ||
            first.type === 'separator')
        ) {
          translateMenuItemsInPlace(res);
        }
      }
      return res;
    };
    mapRestoreTimer = setTimeout(() => {
      Array.prototype.map = origArrayMap;
      mapRestoreTimer = null;
    }, 80);
  }

  window.__ag_enable_temp_menu_hook = enableTempMenuMapHook;

  if (!window.__ag_ctx_menu_hook_installed_v3) {
    window.__ag_ctx_menu_hook_installed_v3 = true;
    window.addEventListener(
      'contextmenu',
      () => {
        if (typeof window.__ag_enable_temp_menu_hook === 'function') window.__ag_enable_temp_menu_hook();
      },
      true
    );
    const onMenuBtnTrigger = (e) => {
      const t = e.target;
      if (
        t &&
        t.closest &&
        t.closest('[data-testid="conversation-kebab"], [data-testid*="more"], [aria-haspopup="menu"], [aria-label="More options"], [aria-label="更多选项"]')
      ) {
        if (typeof window.__ag_enable_temp_menu_hook === 'function') window.__ag_enable_temp_menu_hook();
      }
    };
    window.addEventListener('pointerdown', onMenuBtnTrigger, true);
  }

  // 3. 保持 Chromium 原生 C++ Runtime.addBinding (__agRequestMetrics / __ag_on_session_change) 纯净直通
  if (window.__ag_orig_req_metrics) {
    try {
      delete window.__agRequestMetrics;
      delete window.__ag_on_session_change;
      delete window.__ag_orig_req_metrics;
    } catch (e) {}
  }

  // 4. 增量汉化外框、设置弹窗、插件市场与首页动态文本（严禁全屏扫描 document.body，仅增量处理脏节点）
  const EXCLUDE_CHROME_SEL =
    '[data-testid="autoscroll-viewport"], [contenteditable="true"], .monaco-editor, .xterm, pre, code, svg, #ag-live-metrics-pill, #ag-live-metrics-tooltip, #ag-ctx-ring-pill, #ag-ctx-popover-card, [data-testid="conversation-row-sidebar"] a[href^="/c/"]';

  const RE_UPDATED_AT = /^Updated\s+(.+)$/;
  const RE_MODIFIED_IN = /^Modified in\s+(.+)$/;
  const RE_N_PROJECTS = /^(\d+)\s+projects?$/i;
  const RE_N_MODELS_SELECTED = /^(\d+)\s+models\s+selected$/i;
  const RE_SEE_N_MORE = /^See\s+(\d+)\s+more(?:\s+.*)?$/i;
  const RE_GREET_HEY = /^Hey\s+(.+?),\s*what should we build today\?$/i;
  const RE_GREET_WELCOME = /^Welcome back,\s*(.+?)\.\s*Where should we pick up\?$/i;
  const RE_GREET_GOOD = /^Good to see you,\s*(.+?)\.\s*What['’]s next\?$/i;
  const RE_TODAY_TIME = /\(Today\s+([^)]+)\)/g;
  const RE_YESTERDAY_TIME = /\(Yesterday\s+([^)]+)\)/g;
  const RE_TRAJECTORY_ID = /^Trajectory ID:\s*(.+)$/;
  const RE_WINDOW_LIMIT = /^(\d+)([smhd])\s+limit$/i;
  const RE_QUOTA_RESETS = /^(?:(Daily limit|Weekly limit|\d+[smhd]\s+limit),\s*)?[Rr]esets in\s+(.+)$/;
  const RE_MODELS_IN_GROUP = /^Models within this group:\s*(.+)$/;
  const RE_AVAIL_CREDITS = /^Available AI Credits:\s*(.+)$/;
  const RE_EFFORT_CTX = /^(Low|Medium|High|Extra High|Extra|Max)(\s*·\s*.+)$/;
  const EFFORT_ZH_MAP = { Low: '低', Medium: '中', High: '高', 'Extra High': '超高', Extra: '超高', Max: '极高' };
  const UNIT_ZH_MAP = { s: '秒', m: '分钟', h: '小时', d: '天' };
  const DISCLAIMER_ZH =
    'Google 不控制第三方开发者工具的可用性或功能。您通过连接到 Antigravity 实例的第三方开发者工具产生的数据可能会与 Google 共享。Google 将严格按照《Google 隐私权政策》保护此类数据，详情请参阅： ';

  function formatResetSpanZh(spanRaw) {
    const t = spanRaw.trim();
    if (t === '<1m') return '即将重置（<1 分钟）';
    return (
      t
        .replace(/(\d+)d\b/g, '$1 天')
        .replace(/(\d+)h\b/g, '$1 小时')
        .replace(/(\d+)m\b/g, '$1 分钟')
        .replace(/(\d+)s\b/g, '$1 秒')
        .replace(/\s+/g, ' ')
        .trim() + '后重置'
    );
  }

  function formatLimitPrefixZh(prefixRaw) {
    if (!prefixRaw) return '';
    const p = prefixRaw.trim();
    if (/^Daily limit$/i.test(p)) return '每日限额';
    if (/^Weekly limit$/i.test(p)) return '每周限额';
    const m = p.match(RE_WINDOW_LIMIT);
    if (m) return `${m[1]} ${UNIT_ZH_MAP[m[2].toLowerCase()] || m[2]}限额`;
    return p;
  }

  function translateDynamicString(raw, dict) {
    if (!raw || raw.length > 420) return null;
    const s = raw.trim();
    if (!s || !/[A-Za-z]/.test(s)) return null;
    if (dict[s]) return raw.replace(s, dict[s]);
    if (RE_SEE_N_MORE.test(s)) return raw.replace(RE_SEE_N_MORE, '展开其余 $1 项');
    if (RE_UPDATED_AT.test(s)) return raw.replace(RE_UPDATED_AT, '更新于 $1');
    if (RE_MODIFIED_IN.test(s)) return raw.replace(RE_MODIFIED_IN, '修改自项目：$1');
    if (RE_N_PROJECTS.test(s)) return raw.replace(RE_N_PROJECTS, '$1 个项目');
    if (RE_N_MODELS_SELECTED.test(s)) return raw.replace(RE_N_MODELS_SELECTED, '已选择 $1 个模型');
    const mWin = s.match(RE_WINDOW_LIMIT);
    if (mWin) return raw.replace(s, `${mWin[1]} ${UNIT_ZH_MAP[mWin[2].toLowerCase()] || mWin[2]}限额`);
    const mReset = s.match(RE_QUOTA_RESETS);
    if (mReset) {
      const prefixZh = formatLimitPrefixZh(mReset[1]);
      const spanZh = formatResetSpanZh(mReset[2]);
      return raw.replace(s, prefixZh ? `${prefixZh} · ${spanZh}` : spanZh);
    }
    const mGroup = s.match(RE_MODELS_IN_GROUP);
    if (mGroup) {
      const listZh = mGroup[1]
        .split(/,\s*/)
        .map((name) => dict[name.trim()] || name.trim())
        .join('、');
      return raw.replace(s, `此分组包含的模型：${listZh}`);
    }
    if (RE_AVAIL_CREDITS.test(s)) return raw.replace(RE_AVAIL_CREDITS, '可用 AI 点数：$1');
    const mEff = s.match(RE_EFFORT_CTX);
    if (mEff && EFFORT_ZH_MAP[mEff[1]]) {
      return raw.replace(s, EFFORT_ZH_MAP[mEff[1]] + mEff[2]);
    }
    if (RE_GREET_GOOD.test(s)) return raw.replace(RE_GREET_GOOD, '很高兴见到您，$1。接下来做点什么？');
    if (RE_GREET_WELCOME.test(s)) return raw.replace(RE_GREET_WELCOME, '欢迎回来，$1。我们接着做哪部分？');
    if (RE_GREET_HEY.test(s)) return raw.replace(RE_GREET_HEY, '嗨，$1，今天想构建点什么？');
    if (s.startsWith('Google does not control the availability or functionality of third')) {
      return DISCLAIMER_ZH;
    }
    if (s.includes('(Today ')) return raw.replace(RE_TODAY_TIME, '（今天 $1）');
    if (s.includes('(Yesterday ')) return raw.replace(RE_YESTERDAY_TIME, '（昨天 $1）');
    if (RE_TRAJECTORY_ID.test(s)) return raw.replace(RE_TRAJECTORY_ID, '轨迹 ID：$1');
    return null;
  }

  function localizeElementButtonAttrs(el, dict) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const val = el.getAttribute(attr);
      if (!val || !/[A-Za-z]/.test(val)) continue;
      const trimmed = val.trim();
      let next = null;
      if (dict[trimmed]) {
        next = dict[trimmed];
      } else if (RE_SEE_N_MORE.test(trimmed)) {
        next = trimmed.replace(RE_SEE_N_MORE, '展开其余 $1 项');
      } else if (trimmed.startsWith('Select model, current: ')) {
        let curModelStr = trimmed.slice(23).trim();
        if (dict[curModelStr]) {
          curModelStr = dict[curModelStr];
        } else {
          curModelStr = curModelStr.replace(/\b(Extra High|Low|Medium|High|Extra|Max)\b$/, (m) => EFFORT_ZH_MAP[m] || m);
        }
        next = '选择模型（当前：' + curModelStr + '）';
      } else if (trimmed.startsWith('Close ')) {
        next = '关闭 ' + trimmed.slice(6).replace(RE_TODAY_TIME, '（今天 $1）');
      }
      if (next && next !== val) {
        el.setAttribute(attr, next);
      }
    }
  }

  function localizeDynamicChromeStrings(rootNode) {
    try {
      const dict = window.__ag_i18n_dict || {};
      if (!rootNode) return;

      // 单文本节点 O(1) 极速路径
      if (rootNode.nodeType === 3) {
        const p = rootNode.parentElement;
        if (!p || p.closest(EXCLUDE_CHROME_SEL)) return;
        const next = translateDynamicString(rootNode.nodeValue, dict);
        if (next && next !== rootNode.nodeValue) {
          rootNode.nodeValue = next;
        }
        return;
      }

      if (rootNode.nodeType !== 1) return;
      if (rootNode.closest && rootNode.closest(EXCLUDE_CHROME_SEL)) return;

      if (rootNode.matches && rootNode.matches('button[aria-label], button[title], input[placeholder]')) {
        localizeElementButtonAttrs(rootNode, dict);
      }

      const walker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            const tag = p.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'TEXTAREA' || tag === 'SVG') {
              return NodeFilter.FILTER_REJECT;
            }
            if (p.closest(EXCLUDE_CHROME_SEL)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let tn;
      while ((tn = walker.nextNode())) {
        const next = translateDynamicString(tn.nodeValue, dict);
        if (next && next !== tn.nodeValue) {
          tn.nodeValue = next;
        }
      }

      const attrEls = rootNode.querySelectorAll
        ? rootNode.querySelectorAll('button[aria-label], button[title], input[placeholder]')
        : [];
      for (let j = 0; j < attrEls.length; j++) {
        const el = attrEls[j];
        if (el.closest(EXCLUDE_CHROME_SEL)) continue;
        localizeElementButtonAttrs(el, dict);
      }
    } catch (e) {}
  }

  if (window.__ag_dyn_chrome_observer) {
    try {
      window.__ag_dyn_chrome_observer.disconnect();
    } catch (e) {}
    window.__ag_dyn_chrome_observer = null;
  }

  const dynDirtyNodes = new Set();
  let dynRafPending = false;

  function flushDynChromeNodes() {
    dynRafPending = false;
    if (dynDirtyNodes.size === 0) return;
    const batch = Array.from(dynDirtyNodes);
    dynDirtyNodes.clear();

    for (let i = 0; i < batch.length; i++) {
      const node = batch[i];
      if (!node || !node.isConnected) continue;
      // 跳过已被同批次祖先元素覆盖的子节点
      if (node.nodeType === 1 || node.nodeType === 3) {
        let covered = false;
        for (let p = node.parentNode; p && p !== document.body; p = p.parentNode) {
          if (batch.includes(p)) {
            covered = true;
            break;
          }
        }
        if (!covered) {
          localizeDynamicChromeStrings(node);
        }
      }
    }
  }

  window.__ag_dyn_chrome_observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === 'characterData') {
        const t = m.target;
        if (t && t.parentElement && !t.parentElement.closest(EXCLUDE_CHROME_SEL)) {
          dynDirtyNodes.add(t);
        }
      } else if (m.type === 'childList' && m.addedNodes.length > 0) {
        const targetEl = m.target && m.target.nodeType === 1 ? m.target : null;
        if (targetEl && targetEl.closest(EXCLUDE_CHROME_SEL)) continue;
        for (let j = 0; j < m.addedNodes.length; j++) {
          const n = m.addedNodes[j];
          if (n.nodeType === 1 || n.nodeType === 3) {
            dynDirtyNodes.add(n);
          }
        }
      }
    }
    if (dynDirtyNodes.size > 0 && !dynRafPending) {
      dynRafPending = true;
      requestAnimationFrame(flushDynChromeNodes);
    }
  });

  if (document.body) {
    window.__ag_dyn_chrome_observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => localizeDynamicChromeStrings(document.body), { timeout: 1000 });
  } else {
    setTimeout(() => localizeDynamicChromeStrings(document.body), 250);
  }

  // 4.5 优化路由与指标自愈巡检：平时 0 DOM 扫描，仅在路由切换时触发标题检测
  if (window.__ag_metrics_route_watcher) {
    try {
      clearInterval(window.__ag_metrics_route_watcher);
    } catch (e) {}
    window.__ag_metrics_route_watcher = null;
  }
  let lastHref = '';
  let lastWatchedTitleSig = '';
  window.__ag_metrics_route_watcher = setInterval(() => {
    if (document.hidden) return;
    const curHref = window.location.href;
    const routeChanged = curHref !== lastHref;
    const pill = document.getElementById('ag-live-metrics-pill');
    const btn = document.getElementById('ag-ctx-ring-pill');
    const cidMatch = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
    const curCid = cidMatch ? cidMatch[1] : '';
    const metricsMismatch = !!(curCid && (!window.__ag_last_metrics || window.__ag_last_metrics.cascadeId !== curCid));

    // O(1) 检测当前活跃对话标题是否刚由后端异步生成（如从 "新建对话" 变为英文标题），平时已处理对话 0 开销
    let titleChanged = false;
    if (curCid && !processedCids.has(curCid)) {
      const selRow = document.querySelector('[data-testid="conversation-row-sidebar"][data-selected="true"]');
      const curRowTitle = selRow ? (selRow.querySelector('span.truncate')?.textContent || '').trim() : '';
      const sig = `${curCid}:${curRowTitle}`;
      if (sig !== lastWatchedTitleSig) {
        lastWatchedTitleSig = sig;
        titleChanged = true;
      }
      // 趁新对话首屏可见时提前缓存用户的首条中文提问主题，防止后续对话变长虚拟滚动卸载首条消息
      if (!firstTopicCache.has(curCid)) {
        const firstMsgEl = document.querySelector('[data-testid="user-message-content"]');
        if (firstMsgEl) {
          const cachedTopic = extractChineseTopic(firstMsgEl.textContent || '');
          if (cachedTopic) firstTopicCache.set(curCid, cachedTopic);
        }
      }
    }

    if (routeChanged || !pill || !btn || metricsMismatch || titleChanged) {
      lastHref = curHref;
      if (metricsMismatch && typeof window.__agRequestMetrics === 'function') {
        window.__ag_watched_cascade_id = '';
      }
      if (typeof window.__ag_check_route_fn === 'function') {
        window.__ag_check_route_fn();
      }
      if (typeof updateAutoCompactBadge === 'function') {
        try {
          updateAutoCompactBadge(window.__ag_last_metrics || null);
        } catch (e) {}
      }
      if (routeChanged || titleChanged) {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(() => autoLocalizeActiveConvTitle(), { timeout: 1200 });
        } else {
          setTimeout(autoLocalizeActiveConvTitle, 350);
        }
      }
    }
  }, 3000);

  // 5. 当新建对话（含项目内对话）被后端异步生成英文标题时，若用户提问包含中文，自动重命名为中文标题（兼容 v2.34.0+ 顶栏 segments.onRename 与全局 updateConversationAnnotations）
  const RE_HAS_CJK = /[\u4e00-\u9fa5]/;
  const RE_MIN_2_CJK = /(?:[\u4e00-\u9fa5].*){2,}/;
  const RE_MIN_3_CJK = /(?:[\u4e00-\u9fa5].*){3,}/;
  const RE_PURE_EN_OR_PATH_TITLE = /^(?:[A-Za-z0-9\s\-_.,:()'"/&+#\\]+|"[A-Za-z]:\\[^"]*)$/;
  const processedCids = window.__ag_auto_titled_cids_v3 || (window.__ag_auto_titled_cids_v3 = new Set());
  const firstTopicCache = window.__ag_first_topic_cache || (window.__ag_first_topic_cache = new Map());

  function extractChineseTopic(rawText) {
    if (!rawText) return '';
    let cleaned = rawText
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[`*_#>~"]/g, '')
      .trim();

    // 若用户输入的是本地文件路径（如 D:\真牛奖_找回重建\真牛奖\辩题\赛制介绍121903.mp4），提取路径中有意义的中文词段
    if (/^[A-Za-z]:[\\/]/.test(cleaned) && RE_HAS_CJK.test(cleaned)) {
      const parts = cleaned
        .replace(/^[A-Za-z]:[\\/]+/, '')
        .replace(/\.[A-Za-z0-9]{1,6}$/, '')
        .split(/[\\/]+/)
        .map((p) => p.replace(/\d{5,}$/, '').replace(/_找回重建|_备份|_副本/g, '').trim())
        .filter((p) => RE_MIN_2_CJK.test(p) && !/^(Users|Administrator|Desktop|Documents|Downloads)$/i.test(p));
      if (parts.length > 0) {
        const joined = parts.slice(-2).join('·');
        return joined.length > 18 ? joined.slice(0, 18) : joined;
      }
    }

    cleaned = cleaned.replace(/[A-Za-z]:\\[^\s，。！？；,!?]+/g, ' ').trim();
    const clauses = cleaned
      .split(/[\r\n，。！？；、,!?;]+/)
      .map((s) =>
        s
          .replace(/^(请问|帮我|请帮我|麻烦帮我|我需要你帮我|我需要你|我想让你|我想|能不能|可以帮我|帮我看一下|帮我看看)/, '')
          .trim()
      )
      .filter((s) => RE_HAS_CJK.test(s));
    if (clauses.length === 0) return '';
    const meaningful = clauses.find((s) => RE_MIN_3_CJK.test(s)) || clauses[0];
    if (!RE_MIN_2_CJK.test(meaningful)) return '';
    return meaningful.length > 18 ? meaningful.slice(0, 18) : meaningful;
  }

  function findBreadcrumbOnRename() {
    try {
      const header = document.querySelector('.agy-layout-vars');
      if (!header) return null;
      const fk = Object.keys(header).find((k) => k.startsWith('__reactFiber'));
      if (!fk) return null;
      let foundFn = null;
      const seen = new WeakSet();
      function walk(f, d = 0) {
        if (!f || d > 22 || seen.has(f) || foundFn) return;
        seen.add(f);
        const segs = f.memoizedProps?.segments;
        if (Array.isArray(segs)) {
          for (let i = segs.length - 1; i >= 0; i--) {
            if (segs[i] && typeof segs[i].onRename === 'function') {
              foundFn = segs[i].onRename;
              return;
            }
          }
        }
        walk(f.child, d + 1);
        walk(f.sibling, d + 1);
      }
      walk(header[fk], 0);
      return foundFn;
    } catch (e) {
      return null;
    }
  }

  function findGlobalUpdateAnnotations() {
    if (typeof window.__ag_cached_update_annotations === 'function') {
      return window.__ag_cached_update_annotations;
    }
    try {
      const rootEl = document.getElementById('root') || document.body.firstElementChild;
      const fk = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
      if (!fk) return null;
      let fn = null;
      const seen = new WeakSet();
      function walk(f, d = 0) {
        if (!f || d > 55 || seen.has(f) || fn) return;
        seen.add(f);
        if (typeof f.memoizedProps?.value?.updateConversationAnnotations === 'function') {
          fn = f.memoizedProps.value.updateConversationAnnotations;
          return;
        }
        walk(f.child, d + 1);
        walk(f.sibling, d + 1);
      }
      walk(rootEl[fk], 0);
      if (fn) window.__ag_cached_update_annotations = fn;
      return fn;
    } catch (e) {
      return null;
    }
  }

  function autoLocalizeActiveConvTitle() {
    try {
      const cidMatch = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
      const selectedRow = document.querySelector('[data-testid="conversation-row-sidebar"][data-selected="true"]');
      const cid = selectedRow?.getAttribute('data-cascade-id') || (cidMatch ? cidMatch[1] : '');
      if (!cid || processedCids.has(cid)) return;

      const titleSpan = selectedRow ? selectedRow.querySelector('span.truncate') : null;
      let curTitle = titleSpan ? (titleSpan.textContent || '').trim() : '';
      if (!curTitle) {
        // 若侧边栏折叠，从顶栏面包屑读取当前对话标题
        const header = document.querySelector('.agy-layout-vars');
        if (header) {
          const spans = header.querySelectorAll('button, span');
          if (spans.length > 0) curTitle = (spans[spans.length - 1].textContent || '').trim();
        }
      }
      if (!curTitle || curTitle === 'New Conversation' || curTitle === '新建对话') return;
      if (RE_HAS_CJK.test(curTitle) || !RE_PURE_EN_OR_PATH_TITLE.test(curTitle)) {
        processedCids.add(cid);
        return;
      }

      let zhTopic = firstTopicCache.get(cid) || '';
      if (!zhTopic) {
        const userMsgs = document.querySelectorAll('[data-testid="user-message-content"]');
        for (let i = 0; i < userMsgs.length; i++) {
          zhTopic = extractChineseTopic(userMsgs[i].textContent || '');
          if (zhTopic) break;
        }
      }
      if (!zhTopic) return;

      const onRename = findBreadcrumbOnRename();
      if (onRename) {
        processedCids.add(cid);
        Promise.resolve(onRename(zhTopic)).catch(() => {
          processedCids.delete(cid);
        });
        return;
      }

      const updateAnnotations = findGlobalUpdateAnnotations();
      if (updateAnnotations) {
        processedCids.add(cid);
        Promise.resolve(updateAnnotations([cid], { title: zhTopic }, true)).catch(() => {
          processedCids.delete(cid);
        });
      }
    } catch (e) {}
  }
  setTimeout(autoLocalizeActiveConvTitle, 700);

  // ============================================================================
  // 6. 上下文 85% 自动压缩防卡死守卫（Auto-Compact Guard + 底部胶囊一键压缩按钮）
  // ============================================================================
  const AUTO_COMPACT_KEY = 'ag-auto-compact-v2-enabled';
  const AUTO_COMPACT_THRESHOLD_KEY = 'ag-auto-compact-threshold';
  const COMPACT_COMMAND = '/compact';
  const compactCooldownMap = window.__ag_compact_cooldown || (window.__ag_compact_cooldown = new Map());
  if (window.__ag_pending_compact_timer) {
    clearTimeout(window.__ag_pending_compact_timer);
    window.__ag_pending_compact_timer = null;
  }
  const existingCompactBtn = document.getElementById('ag-auto-compact-btn');
  if (existingCompactBtn) {
    existingCompactBtn.remove();
  }

  function isAutoCompactEnabled() {
    try {
      const v = localStorage.getItem(AUTO_COMPACT_KEY);
      return v === 'true';
    } catch (e) {
      return false;
    }
  }

  function setAutoCompactEnabled(val) {
    try {
      localStorage.setItem(AUTO_COMPACT_KEY, val ? 'true' : 'false');
    } catch (e) {}
  }

  function getAutoCompactThreshold() {
    try {
      const n = parseInt(localStorage.getItem(AUTO_COMPACT_THRESHOLD_KEY) || '85', 10);
      return Number.isFinite(n) && n >= 50 && n <= 98 ? n : 85;
    } catch (e) {
      return 85;
    }
  }

  function showCompactToast(msg, isWarn = false) {
    try {
      let toast = document.getElementById('ag-compact-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ag-compact-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.setAttribute('data-warn', isWarn ? '1' : '0');
      toast.setAttribute('data-show', '1');
      if (window.__ag_toast_timer) clearTimeout(window.__ag_toast_timer);
      window.__ag_toast_timer = setTimeout(() => {
        if (toast) toast.removeAttribute('data-show');
      }, 4200);
    } catch (e) {}
  }

  function getComposerController() {
    try {
      const footer = document.querySelector('.agy-composer-footer');
      if (!footer) return null;
      const fk = Object.keys(footer).find((k) => k.startsWith('__reactFiber'));
      let f = fk ? footer[fk] : null;
      while (f && (!f.memoizedProps || !('isRunning' in f.memoizedProps || 'slashCommandItems' in f.memoizedProps))) {
        f = f.return;
      }
      if (!f || !f.memoizedProps) return null;
      return f.memoizedProps;
    } catch (e) {
      return null;
    }
  }

  function isAgentBusy() {
    const ctrl = getComposerController();
    if (ctrl && (ctrl.isRunning || ctrl.isConvoLoading)) return true;
    const box = document.getElementById('antigravity.agentSidePanelInputBox');
    if (document.querySelector('[data-testid="status-loading-spinner"]')) return true;
    if (
      box &&
      box.querySelector(
        '[data-testid="input-cancel-button"], [data-testid="stop-button"], [data-testid="send-button-loading"], [data-testid="send-button-pending"], [aria-label*="Cancel"], [aria-label*="取消"], [aria-label*="Stop"], [aria-label*="停止"]'
      )
    ) {
      return true;
    }
    return false;
  }

  function getComposerEditor() {
    const box = document.getElementById('antigravity.agentSidePanelInputBox');
    if (!box) return null;
    return (
      box.querySelector('[contenteditable="true"]') ||
      box.querySelector('textarea') ||
      null
    );
  }

  function getEditorText(editor) {
    if (!editor) return '';
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      return (editor.value || '').trim();
    }
    return (editor.textContent || '').trim();
  }

  function clearEditorSafely(editor) {
    if (!editor) return;
    try {
      editor.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
    } catch (e) {}
  }

  function setEditorTextAndFire(editor, text) {
    editor.focus();
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      const proto = editor.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(editor, text);
      } else {
        editor.value = text;
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    clearEditorSafely(editor);

    let execOk = false;
    try {
      execOk = document.execCommand('insertText', false, text);
    } catch (e) {
      execOk = false;
    }

    if (!execOk) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        editor.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
          })
        );
      } catch (e) {}
    }
  }

  function trySelectCompactChipFromMentionMenu() {
    const menu = document.querySelector('[data-mention-menu]');
    if (!menu) return false;
    try {
      const fk = Object.keys(menu).find((k) => k.startsWith('__reactFiber'));
      let f = fk ? menu[fk] : null;
      while (f && (!f.memoizedProps || !f.memoizedProps.menuProps)) {
        f = f.return;
      }
      const mp = f?.memoizedProps?.menuProps;
      if (mp && Array.isArray(mp.options) && typeof mp.selectOptionAndCleanUp === 'function') {
        const opt = mp.options.find(
          (o) =>
            (o?.item?.scopeItem?.case === 'slashCommand' && o?.item?.scopeItem?.value?.info?.name === 'compact') ||
            o?.value === 'compact'
        );
        if (opt) {
          mp.selectOptionAndCleanUp(opt);
          return true;
        }
      }
    } catch (e) {}

    // DOM fallback: click option item matching /compact
    const opts = menu.querySelectorAll('[role="option"], [data-testid*="option"], div.cursor-pointer');
    for (let i = 0; i < opts.length; i++) {
      const txt = (opts[i].textContent || '').trim();
      if (/^\/?compact\b/i.test(txt)) {
        opts[i].click();
        return true;
      }
    }
    return false;
  }

  function hasVerifiedCompactChip(box, ctrl) {
    if (box && box.querySelector('[data-beautiful-mention="/compact"], [data-lexical-beautiful-mention-value="compact"]')) {
      return true;
    }
    try {
      const lex = ctrl?.lexicalRef?.current;
      if (lex && typeof lex.getEditorState === 'function') {
        const json = lex.getEditorState().toJSON();
        const str = JSON.stringify(json);
        if (str.includes('"beautifulMention"') && str.includes('"compact"')) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function executeSlashCompact(isManual = false) {
    if (window.__ag_compact_in_flight) return false;
    const box = document.getElementById('antigravity.agentSidePanelInputBox');
    const editor = getComposerEditor();
    if (!box || !editor) {
      if (isManual) showCompactToast('⚠️ 未找到聊天输入框，请进入对话页面后再试', true);
      return false;
    }
    if (isAgentBusy()) {
      if (isManual) showCompactToast('⏳ Agent 正在运行中，请等待当前回答结束后再压缩', true);
      return false;
    }
    const existingText = getEditorText(editor);
    if (!isManual && existingText.length > 0) {
      return false;
    }

    window.__ag_compact_in_flight = true;
    const releaseLock = () => {
      window.__ag_compact_in_flight = false;
    };
    setTimeout(releaseLock, 4000);

    showCompactToast(
      isManual
        ? '⚡ 正在执行原生 /compact 压缩当前会话上下文...'
        : `⚡ 上下文已达 ${getAutoCompactThreshold()}% 警戒线，正在自动执行原生 /compact...`,
      false
    );

    // 第 1 步：输入 "/compact" 唤起 Lexical 斜杠命令菜单 [data-mention-menu]
    setEditorTextAndFire(editor, COMPACT_COMMAND);

    // 第 2 步：轮询等待斜杠候选菜单挂载，将其转换为真正的 beautifulMention 斜杠命令芯片
    let menuAttempts = 0;
    const waitMenuTimer = setInterval(() => {
      menuAttempts++;
      const ctrlNow = getComposerController();
      if (hasVerifiedCompactChip(box, ctrlNow)) {
        clearInterval(waitMenuTimer);
        submitVerifiedChip();
        return;
      }
      if (trySelectCompactChipFromMentionMenu()) {
        clearInterval(waitMenuTimer);
        setTimeout(submitVerifiedChip, 80);
        return;
      }
      if (menuAttempts === 5) {
        editor.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true, cancelable: true })
        );
      }
      if (menuAttempts >= 18) {
        clearInterval(waitMenuTimer);
        submitVerifiedChip();
      }
    }, 45);

    // 第 3 步：硬门禁校验——仅当输入框内已生成真实 /compact 芯片且 Agent 空闲时才提交，绝不误发纯文本 "/compact"
    function submitVerifiedChip() {
      const ctrl = getComposerController();
      if (isAgentBusy()) {
        clearEditorSafely(editor);
        releaseLock();
        return;
      }
      if (!hasVerifiedCompactChip(box, ctrl)) {
        clearEditorSafely(editor);
        releaseLock();
        if (isManual) {
          showCompactToast('⚠️ 斜杠命令芯片未就绪，已取消发送以避免误发纯文本', true);
        }
        return;
      }
      const lex = ctrl?.lexicalRef?.current;
      if (ctrl && typeof ctrl.handleSubmit === 'function' && lex) {
        ctrl.handleSubmit(lex);
      } else {
        const sendBtn = box.querySelector('[data-testid="send-button"]');
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
        }
      }
    }

    return true;
  }

  window.__ag_trigger_compact = () => executeSlashCompact(true);

  const CTX_WINDOW_LIMIT_KEY = 'ag-ctx-window-limit';
  const CTX_LIMIT_PRESETS = [512000, 1000000, 256000];
  const avgTpsTracker = window.__ag_avg_tps_map || (window.__ag_avg_tps_map = new Map());

  // 清理热重载旧节点
  const oldRingPill = document.getElementById('ag-ctx-ring-pill');
  if (oldRingPill) oldRingPill.remove();
  const oldPopCard = document.getElementById('ag-ctx-popover-card');
  if (oldPopCard) oldPopCard.remove();

  function getCustomWindowLimit(modelLabel = '') {
    if (/GPT-OSS/i.test(modelLabel)) return 128000;
    try {
      const saved = parseInt(localStorage.getItem(CTX_WINDOW_LIMIT_KEY) || '512000', 10);
      if (CTX_LIMIT_PRESETS.includes(saved)) return saved;
    } catch (e) {}
    return 512000;
  }

  function cycleWindowLimit() {
    try {
      const cur = getCustomWindowLimit('');
      const idx = CTX_LIMIT_PRESETS.indexOf(cur);
      const next = CTX_LIMIT_PRESETS[(idx + 1) % CTX_LIMIT_PRESETS.length];
      localStorage.setItem(CTX_WINDOW_LIMIT_KEY, String(next));
      updateAutoCompactBadge(window.__ag_last_metrics || null);
    } catch (e) {}
  }

  function formatTokCompactUpper(n) {
    if (!n || n <= 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (n >= 1000) {
      const k = n / 1000;
      return (k >= 100 ? k.toFixed(1).replace(/\.0$/, '') : k.toFixed(1).replace(/\.0$/, '')) + 'K';
    }
    return String(n);
  }

  function formatLimitLabel(limit) {
    if (limit >= 1000000) return (limit / 1000000).toFixed(0) + 'M';
    return Math.round(limit / 1000) + 'K';
  }

  function extractRichMetrics(payload) {
    const ctrl = getComposerController();
    const modelLabel = ctrl?.currentModelConfig?.label || 'Gemini 4';
    const windowLimit = getCustomWindowLimit(modelLabel);

    if (!payload || !payload.hasData || typeof payload.tooltipHtml !== 'string') {
      return {
        hasData: false,
        usedTokens: 0,
        remainTokens: windowLimit,
        windowLimit,
        pctExact: 0,
        pctInt: 0,
        newInTokens: 0,
        lastCacheTokens: 0,
        lastCachePct: '0.0',
        outTokens: 0,
        thinkTokens: 0,
        respTokens: 0,
        tps: 0,
        avgTps: 0,
        sessionCachePct: '0.0',
        sessionCacheStr: '0',
        modelLabel
      };
    }

    const tt = payload.tooltipHtml;
    let usedTokens = 0;
    let newInTokens = 0;
    let lastCacheTokens = 0;
    let lastCachePct = '0.0';
    const mCtx = tt.match(/当前上下文<\/span><span[^>]*>([\d,]+)\s*\(新增\s*([\d,]+)\s*\+\s*缓存\s*([\d,]+),\s*([\d.]+)%\)/);
    if (mCtx) {
      usedTokens = parseInt(mCtx[1].replace(/,/g, ''), 10) || 0;
      newInTokens = parseInt(mCtx[2].replace(/,/g, ''), 10) || 0;
      lastCacheTokens = parseInt(mCtx[3].replace(/,/g, ''), 10) || 0;
      lastCachePct = mCtx[4] || '0.0';
    }

    let outTokens = 0;
    let thinkTokens = 0;
    let respTokens = 0;
    const mOut = tt.match(/本步输出量<\/span><span[^>]*>([\d,]+)\s*\(思考链\s*([\d,]+)\s*\+\s*正文\/工具\s*([\d,]+)\)/);
    if (mOut) {
      outTokens = parseInt(mOut[1].replace(/,/g, ''), 10) || 0;
      thinkTokens = parseInt(mOut[2].replace(/,/g, ''), 10) || 0;
      respTokens = parseInt(mOut[3].replace(/,/g, ''), 10) || 0;
    }

    let tps = 0;
    const mSpd = tt.match(/生成速度<\/span><span[^>]*>(?:流式\s*([\d.]+)\s*tok\/s\s*\|\s*)?端到端\s*([\d.]+)\s*tok\/s/);
    if (mSpd) {
      tps = parseFloat(mSpd[1] || mSpd[2] || '0') || 0;
    }

    let avgTps = Math.round(tps);
    if (payload.cascadeId && tps > 0) {
      let rec = avgTpsTracker.get(payload.cascadeId);
      if (!rec) {
        rec = { lastSig: '', sum: 0, count: 0 };
        avgTpsTracker.set(payload.cascadeId, rec);
      }
      if (rec.lastSig !== payload.sig) {
        rec.lastSig = payload.sig;
        rec.sum += tps;
        rec.count += 1;
      }
      if (rec.count > 0) avgTps = Math.round(rec.sum / rec.count);
    }

    let sessionCachePct = '0.0';
    let sessionCacheStr = '0';
    const mCum = tt.match(/累计输入量<\/span><span[^>]*>新增\s*([\d.]+[kKmM]?)\s*\+\s*缓存读取\s*([\d.]+[kKmM]?)\s*\(命中率\s*([\d.]+)%\)/);
    if (mCum) {
      sessionCacheStr = (mCum[2] || '0').toUpperCase();
      sessionCachePct = mCum[3] || '0.0';
    }

    const remainTokens = Math.max(0, windowLimit - usedTokens);
    const pctExact = windowLimit > 0 ? Math.min(999.9, (usedTokens / windowLimit) * 100) : 0;
    const pctInt = Math.round(pctExact);

    return {
      hasData: true,
      usedTokens,
      remainTokens,
      windowLimit,
      pctExact,
      pctInt,
      newInTokens,
      lastCacheTokens,
      lastCachePct,
      outTokens,
      thinkTokens,
      respTokens,
      tps,
      avgTps,
      sessionCachePct,
      sessionCacheStr,
      modelLabel
    };
  }

  function getGaugeVisualStatus(pct) {
    if (pct >= 92) return { color: '#EF4444', level: 'crit', text: '即将耗尽' };
    if (pct >= 75) return { color: '#F59E0B', level: 'warn', text: '占用偏高' };
    if (pct >= 45) return { color: '#38BDF8', level: 'mid', text: '占用适中' };
    return { color: '#22C55E', level: 'ok', text: '空间充裕' };
  }

  function buildMiniRingSvg(pct, strokeColor) {
    const clamped = Math.max(0, Math.min(100, pct));
    const r = 5.6;
    const circ = 2 * Math.PI * r;
    const arcMax = circ * 0.75; // 270° 开口圆弧
    const arcFill = (clamped / 100) * arcMax;
    return `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="${r}" stroke="currentColor" stroke-opacity="0.2" stroke-width="2" stroke-dasharray="${arcMax.toFixed(2)} ${circ.toFixed(2)}" stroke-linecap="round" transform="rotate(135 8 8)"/>
      <circle cx="8" cy="8" r="${r}" stroke="${strokeColor}" stroke-width="2" stroke-dasharray="${arcFill.toFixed(2)} ${circ.toFixed(2)}" stroke-linecap="round" transform="rotate(135 8 8)"/>
      <circle cx="8" cy="8" r="1.45" fill="${strokeColor}"/>
    </svg>`;
  }

  function buildHeroGaugeSvg(pct, strokeColor) {
    const clamped = Math.max(0, Math.min(100, pct));
    const r = 28;
    const circ = 2 * Math.PI * r;
    const arcMax = circ * 0.75; // 270° 仪表盘弧度
    const arcFill = (clamped / 100) * arcMax;
    return `<svg viewBox="0 0 70 70" fill="none" aria-hidden="true">
      <circle cx="35" cy="35" r="${r}" stroke="rgba(255,255,255,0.12)" stroke-width="5.5" stroke-dasharray="${arcMax.toFixed(2)} ${circ.toFixed(2)}" stroke-linecap="round" transform="rotate(135 35 35)"/>
      <circle cx="35" cy="35" r="${r}" stroke="${strokeColor}" stroke-width="5.5" stroke-dasharray="${arcFill.toFixed(2)} ${circ.toFixed(2)}" stroke-linecap="round" transform="rotate(135 35 35)"/>
    </svg>`;
  }

  let popHideTimer = null;
  let compDrawerOpen = false;

  function ensureCtxPopoverCard() {
    let card = document.getElementById('ag-ctx-popover-card');
    if (!card && document.body) {
      card = document.createElement('div');
      card.id = 'ag-ctx-popover-card';
      document.body.appendChild(card);

      card.addEventListener('mouseenter', () => {
        if (popHideTimer) {
          clearTimeout(popHideTimer);
          popHideTimer = null;
        }
      });
      card.addEventListener('mouseleave', () => {
        scheduleHidePopover();
      });
      card.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('[data-ag-act="toggle-comp"]')) {
          e.stopPropagation();
          compDrawerOpen = !compDrawerOpen;
          renderPopoverContent(card, window.__ag_last_rich_metrics);
        } else if (t.closest('[data-ag-act="cycle-limit"]')) {
          e.stopPropagation();
          cycleWindowLimit();
        } else if (t.closest('[data-ag-act="run-compact"]')) {
          e.stopPropagation();
          hidePopoverNow();
          executeSlashCompact(true);
        } else if (t.closest('[data-ag-act="toggle-auto"]')) {
          e.stopPropagation();
          const next = !isAutoCompactEnabled();
          setAutoCompactEnabled(next);
          updateAutoCompactBadge(window.__ag_last_metrics || null);
          showCompactToast(
            next
              ? `✅ 已开启 ${getAutoCompactThreshold()}% 自动压缩上下文守卫`
              : '⏸️ 已关闭自动压缩守卫',
            !next
          );
        }
      });
    }
    return card;
  }

  function showPopoverForPill(pill) {
    if (popHideTimer) {
      clearTimeout(popHideTimer);
      popHideTimer = null;
    }
    const card = ensureCtxPopoverCard();
    if (!card || !pill) return;
    renderPopoverContent(card, window.__ag_last_rich_metrics);
    const r = pill.getBoundingClientRect();
    const cardW = 318;
    const left = Math.max(12, Math.min(r.right - cardW + 24, window.innerWidth - cardW - 14));
    const bottomPx = Math.max(12, window.innerHeight - r.top + 10);
    card.style.left = `${left}px`;
    card.style.bottom = `${bottomPx}px`;
    card.setAttribute('data-visible', '1');
    pill.setAttribute('data-open', '1');
  }

  function hidePopoverNow() {
    if (popHideTimer) {
      clearTimeout(popHideTimer);
      popHideTimer = null;
    }
    const card = document.getElementById('ag-ctx-popover-card');
    if (card) card.removeAttribute('data-visible');
    const pill = document.getElementById('ag-ctx-ring-pill');
    if (pill) pill.removeAttribute('data-open');
  }

  function scheduleHidePopover() {
    if (popHideTimer) clearTimeout(popHideTimer);
    popHideTimer = setTimeout(hidePopoverNow, 180);
  }

  function renderPopoverContent(card, m) {
    if (!card || !m) return;
    const st = getGaugeVisualStatus(m.pctExact);
    const pctText = m.hasData ? `${m.pctExact.toFixed(1)}%` : '0.0%';
    const enabled = isAutoCompactEnabled();
    const threshold = getAutoCompactThreshold();

    const totalComp = Math.max(1, m.lastCacheTokens + m.newInTokens + m.outTokens);
    const wCache = ((m.lastCacheTokens / totalComp) * 100).toFixed(1);
    const wNewIn = ((m.newInTokens / totalComp) * 100).toFixed(1);
    const wOut = Math.max(1.5, (m.outTokens / totalComp) * 100).toFixed(1);

    card.innerHTML = `
      <div class="ag-ctx-card-hdr">
        <div class="ag-ctx-card-hdr-left">
          <span class="ag-ctx-card-title">上下文窗口</span>
          <span class="ag-ctx-comp-toggle" data-ag-act="toggle-comp">${compDrawerOpen ? '⌃' : '⌄'} 构成</span>
        </div>
        <span class="ag-ctx-status-badge" data-level="${st.level}">${st.text}</span>
      </div>
      <div class="ag-ctx-hero">
        <div class="ag-ctx-gauge-wrap">
          ${buildHeroGaugeSvg(m.pctExact, st.color)}
          <div class="ag-ctx-gauge-center">
            <span class="ag-ctx-gauge-pct">${pctText}</span>
            <span class="ag-ctx-gauge-sub">已用</span>
          </div>
        </div>
        <div class="ag-ctx-hero-rows">
          <div class="ag-ctx-row"><span class="ag-ctx-lbl">已用 Token</span><span class="ag-ctx-val">${formatTokCompactUpper(m.usedTokens)}</span></div>
          <div class="ag-ctx-row"><span class="ag-ctx-lbl">剩余可用</span><span class="ag-ctx-val">${formatTokCompactUpper(m.remainTokens)}</span></div>
          <div class="ag-ctx-row"><span class="ag-ctx-lbl">窗口上限</span><span class="ag-ctx-val ag-ctx-limit-click" data-ag-act="cycle-limit" title="点击切换窗口上限基准 (512K / 1M / 256K)">${formatLimitLabel(m.windowLimit)}</span></div>
        </div>
      </div>
      <div class="ag-ctx-comp-drawer" data-open="${compDrawerOpen ? '1' : '0'}">
        <div class="ag-ctx-comp-bar">
          <div style="width:${wCache}%;background:#38BDF8"></div>
          <div style="width:${wNewIn}%;background:#F59E0B"></div>
          <div style="width:${wOut}%;background:#A855F7"></div>
        </div>
        <div class="ag-ctx-comp-grid">
          <div class="ag-ctx-row"><span class="ag-ctx-lbl"><i class="ag-ctx-dot" style="background:#38BDF8"></i>缓存命中读取</span><span class="ag-ctx-val">${formatTokCompactUpper(m.lastCacheTokens)}</span></div>
          <div class="ag-ctx-row"><span class="ag-ctx-lbl"><i class="ag-ctx-dot" style="background:#F59E0B"></i>本轮新增输入</span><span class="ag-ctx-val">${formatTokCompactUpper(m.newInTokens)}</span></div>
          <div class="ag-ctx-row"><span class="ag-ctx-lbl"><i class="ag-ctx-dot" style="background:#A855F7"></i>本步输出 (思考+正文)</span><span class="ag-ctx-val">${formatTokCompactUpper(m.thinkTokens)} + ${formatTokCompactUpper(m.respTokens)}</span></div>
        </div>
      </div>
      <div class="ag-ctx-divider"></div>
      <div class="ag-ctx-meta-rows">
        <div class="ag-ctx-row"><span class="ag-ctx-lbl">采样模型</span><span class="ag-ctx-val">${m.modelLabel}</span></div>
        <div class="ag-ctx-row"><span class="ag-ctx-lbl">生成速率</span><span class="ag-ctx-val">${m.tps > 0 ? `${m.tps.toFixed(1)} t/s · 均 ${m.avgTps}` : '—'}</span></div>
        <div class="ag-ctx-row"><span class="ag-ctx-lbl">本次缓存</span><span class="ag-ctx-val">${m.hasData ? `${m.lastCachePct}% · ${formatTokCompactUpper(m.lastCacheTokens)}` : '—'}</span></div>
        <div class="ag-ctx-row"><span class="ag-ctx-lbl">累计缓存</span><span class="ag-ctx-val">${m.hasData ? `${m.sessionCachePct}% · ${m.sessionCacheStr}` : '—'}</span></div>
      </div>
      <div class="ag-ctx-actions">
        <span class="ag-ctx-act-btn" data-ag-act="run-compact" title="立即执行原生 /compact 压缩当前对话">⚡ 立即压缩 (/compact)</span>
        <span class="ag-ctx-auto-toggle" data-ag-act="toggle-auto" data-on="${enabled ? '1' : '0'}" title="达到 ${threshold}% 时空闲自动执行 /compact">${enabled ? `● ${threshold}%自动:开` : '○ 自动:关'}</span>
      </div>
    `;
  }

  function findComposerRightGroup() {
    const box = document.getElementById('antigravity.agentSidePanelInputBox');
    if (!box) return null;
    const footer =
      box.querySelector('.agy-composer-footer') ||
      box.querySelector('div.flex.w-full.items-center.justify-between');
    if (!footer) return null;
    return footer.lastElementChild || null;
  }

  function updateAutoCompactBadge(payload) {
    const isChatPage = window.location.pathname.startsWith('/c/');
    let pill = document.getElementById('ag-ctx-ring-pill');

    if (!isChatPage) {
      if (pill) pill.style.display = 'none';
      hidePopoverNow();
      return;
    }

    const rightGroup = findComposerRightGroup();
    if (!rightGroup) return;

    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'ag-ctx-ring-pill';
      pill.addEventListener('mouseenter', () => showPopoverForPill(pill));
      pill.addEventListener('mouseleave', () => scheduleHidePopover());
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = document.getElementById('ag-ctx-popover-card');
        if (card && card.getAttribute('data-visible') === '1') {
          hidePopoverNow();
        } else {
          showPopoverForPill(pill);
        }
      });
      pill.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nextState = !isAutoCompactEnabled();
        setAutoCompactEnabled(nextState);
        updateAutoCompactBadge(window.__ag_last_metrics || null);
        showCompactToast(
          nextState
            ? `✅ 已开启 ${getAutoCompactThreshold()}% 自动压缩上下文守卫`
            : '⏸️ 已关闭自动压缩守卫',
          !nextState
        );
      });
    }

    // 精确挂载到「极速模式 (permissions-selector-trigger)」右侧、语音/发送按钮左侧
    const permBtn = rightGroup.querySelector('[data-testid="permissions-selector-trigger"]');
    const permWrap = permBtn ? (permBtn.parentElement !== rightGroup ? permBtn.closest('div') : permBtn) : null;
    if (permWrap && permWrap.parentElement === rightGroup) {
      if (permWrap.nextSibling !== pill) {
        rightGroup.insertBefore(pill, permWrap.nextSibling);
      }
    } else if (pill.parentElement !== rightGroup) {
      rightGroup.insertBefore(pill, rightGroup.firstElementChild);
    }

    if (pill.style.display === 'none') {
      pill.style.display = 'inline-flex';
    }

    const currentCidMatch = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
    const currentCid = currentCidMatch ? currentCidMatch[1] : '';
    const validPayload = payload && payload.cascadeId === currentCid ? payload : null;

    const rich = extractRichMetrics(validPayload);
    window.__ag_last_rich_metrics = rich;
    const st = getGaugeVisualStatus(rich.pctExact);
    pill.innerHTML = `${buildMiniRingSvg(rich.pctExact, st.color)}<span>${rich.pctInt}%</span>`;

    const openCard = document.getElementById('ag-ctx-popover-card');
    if (openCard && openCard.getAttribute('data-visible') === '1') {
      renderPopoverContent(openCard, rich);
    }

    const enabled = isAutoCompactEnabled();
    const threshold = getAutoCompactThreshold();
    if (!enabled || !validPayload || !validPayload.hasData || !validPayload.cascadeId) return;
    if (rich.pctExact < threshold) return;

    const now = Date.now();
    const lastRecord = compactCooldownMap.get(validPayload.cascadeId);
    if (lastRecord && (now - lastRecord.ts < 180000 || lastRecord.sig === validPayload.sig)) {
      return;
    }

    if (window.__ag_pending_compact_timer) clearTimeout(window.__ag_pending_compact_timer);
    window.__ag_pending_compact_timer = setTimeout(() => {
      window.__ag_pending_compact_timer = null;
      if (!isAutoCompactEnabled()) return;
      if (isAgentBusy()) return;
      const editor = getComposerEditor();
      if (!editor || getEditorText(editor).length > 0 || document.activeElement === editor) return;

      const latestPayload = window.__ag_last_metrics;
      if (!latestPayload || latestPayload.cascadeId !== validPayload.cascadeId) return;
      const latestRich = extractRichMetrics(latestPayload);
      if (latestRich.pctExact < getAutoCompactThreshold()) return;

      compactCooldownMap.set(validPayload.cascadeId, { ts: Date.now(), sig: latestPayload.sig });
      executeSlashCompact(false);
    }, 1800);
  }

  if (typeof window.__ag_render_metrics === 'function' && !window.__ag_orig_render_metrics_v1) {
    window.__ag_orig_render_metrics_v1 = window.__ag_render_metrics;
  }
  if (window.__ag_orig_render_metrics_v1) {
    window.__ag_render_metrics = function (payload) {
      window.__ag_orig_render_metrics_v1(payload);
      try {
        updateAutoCompactBadge(payload);
      } catch (e) {}
    };
    window.__ag_update_live_metrics = window.__ag_render_metrics;
  }
  try {
    updateAutoCompactBadge(window.__ag_last_metrics || null);
  } catch (e) {}
  setTimeout(() => {
    try {
      updateAutoCompactBadge(window.__ag_last_metrics || null);
    } catch (e) {}
  }, 600);
})();
