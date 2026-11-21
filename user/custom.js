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
    '[data-testid="autoscroll-viewport"], [contenteditable="true"], .monaco-editor, .xterm, pre, code, svg, #ag-live-metrics-pill, #ag-live-metrics-tooltip, [data-testid="conversation-row-sidebar"] a[href^="/c/"]';

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
  window.__ag_metrics_route_watcher = setInterval(() => {
    if (document.hidden) return;
    const curHref = window.location.href;
    const routeChanged = curHref !== lastHref;
    const pill = document.getElementById('ag-live-metrics-pill');
    const btn = document.getElementById('ag-auto-compact-btn');
    const cidMatch = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
    const curCid = cidMatch ? cidMatch[1] : '';
    const metricsMismatch = !!(curCid && (!window.__ag_last_metrics || window.__ag_last_metrics.cascadeId !== curCid));

    if (routeChanged || !pill || !btn || metricsMismatch) {
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
      if (routeChanged) {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(() => autoLocalizeActiveConvTitle(), { timeout: 1500 });
        } else {
          setTimeout(autoLocalizeActiveConvTitle, 400);
        }
      }
    }
  }, 3000);

  // 5. 当新建对话被后端自动生成英文标题时，若用户首条提问包含中文，自动将其重命名为中文标题
  const RE_HAS_CJK = /[\u4e00-\u9fa5]/;
  const RE_MIN_3_CJK = /(?:[\u4e00-\u9fa5].*){3,}/;
  const RE_PURE_EN_TITLE = /^[A-Za-z0-9\s\-_.,:()'"/&+#]+$/;
  const processedCids = window.__ag_auto_titled_cids_v2 || (window.__ag_auto_titled_cids_v2 = new Set());

  function extractChineseTopic(rawText) {
    if (!rawText) return '';
    const cleaned = rawText
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[`*_#>~]/g, '')
      .trim();
    const clauses = cleaned
      .split(/[\r\n，。！？；、,!?;]+/)
      .map((s) =>
        s
          .replace(/^(请问|帮我|请帮我|麻烦帮我|我想|能不能|可以帮我|帮我看一下|帮我看看)/, '')
          .trim()
      )
      .filter((s) => RE_HAS_CJK.test(s));
    if (clauses.length === 0) return '';
    const meaningful = clauses.find((s) => RE_MIN_3_CJK.test(s)) || clauses[0];
    if (!RE_MIN_3_CJK.test(meaningful)) return '';
    return meaningful.length > 18 ? meaningful.slice(0, 18) : meaningful;
  }

  function autoLocalizeActiveConvTitle() {
    try {
      const selectedRow = document.querySelector('[data-testid="conversation-row-sidebar"][data-selected="true"]');
      if (!selectedRow) return;
      const cid = selectedRow.getAttribute('data-cascade-id');
      if (!cid || processedCids.has(cid)) return;

      const titleSpan = selectedRow.querySelector('span.truncate');
      const curTitle = titleSpan ? (titleSpan.textContent || '').trim() : '';
      if (!curTitle || curTitle === 'New Conversation' || curTitle === '新建对话') return;
      if (RE_HAS_CJK.test(curTitle) || !RE_PURE_EN_TITLE.test(curTitle)) return;

      const firstUserMsg = document.querySelector('[data-testid="user-message-content"]');
      if (!firstUserMsg) return;
      const zhTopic = extractChineseTopic(firstUserMsg.textContent || '');
      if (!zhTopic) return;

      const fk = Object.keys(selectedRow).find((k) => k.startsWith('__reactFiber$'));
      if (!fk) return;
      let f = selectedRow[fk];
      while (f && (!f.memoizedProps || !f.memoizedProps.cascadeId || f.memoizedProps.variant !== 'sidebar')) {
        f = f.return;
      }
      if (!f) return;

      let renameFn = null;
      let s = f.memoizedState;
      while (s) {
        const ms = s.memoizedState;
        const fn =
          typeof ms === 'function'
            ? ms
            : Array.isArray(ms) && typeof ms[0] === 'function'
              ? ms[0]
              : null;
        if (fn) {
          const src = fn.toString();
          if (
            src.includes('rename-conversation-error') ||
            src.includes('CONVERSATION_RENAME_FAILED') ||
            src.includes('annotations:{title:') ||
            src.includes('updateOptimisticSummary')
          ) {
            renameFn = fn;
            break;
          }
        }
        s = s.next;
      }

      if (renameFn) {
        processedCids.add(cid);
        Promise.resolve(renameFn(zhTopic)).catch(() => {
          processedCids.delete(cid);
        });
      }
    } catch (e) {}
  }
  setTimeout(autoLocalizeActiveConvTitle, 700);

  // ============================================================================
  // 6. 上下文 85% 自动压缩防卡死守卫（Auto-Compact Guard + 底部胶囊一键压缩按钮）
  // ============================================================================
  const AUTO_COMPACT_KEY = 'ag-auto-compact-enabled';
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
      return v === null ? true : v !== 'false';
    } catch (e) {
      return true;
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

  function parseCtxPctFromPayload(payload) {
    if (!payload) return 0;
    // 若当前模型为 GPT-OSS (128k)，按实际 Token 数与 128k 计算；其余 Gemini 4 / Claude 5.5 均按 config.json (1M) 百分比读取
    try {
      const ctrl = getComposerController();
      const modelLabel = ctrl?.currentModelConfig?.label || '';
      if (/GPT-OSS/i.test(modelLabel) && typeof payload.tooltipHtml === 'string') {
        const mTok = payload.tooltipHtml.match(/当前上下文<\/span><span[^>]*>([\d,]+)/);
        if (mTok) {
          const rawTok = parseInt(mTok[1].replace(/,/g, ''), 10);
          if (rawTok > 0) return Math.round((rawTok / 128000) * 100);
        }
      }
    } catch (e) {}
    if (typeof payload.inlineHtml !== 'string') return 0;
    const m = payload.inlineHtml.match(/\((\d+)%\)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function findComposerFooterLeftGroup() {
    const box = document.getElementById('antigravity.agentSidePanelInputBox');
    if (!box) return null;
    const footer =
      box.querySelector('.agy-composer-footer') ||
      box.querySelector('div.flex.w-full.items-center.justify-between');
    if (!footer) return null;
    return footer.firstElementChild || footer;
  }

  function updateAutoCompactBadge(payload) {
    const isChatPage = window.location.pathname.startsWith('/c/');
    const pill = document.getElementById('ag-live-metrics-pill');
    const pillVisible = !!(pill && pill.style.display !== 'none');
    let btn = document.getElementById('ag-auto-compact-btn');

    if (!isChatPage) {
      if (btn && !pillVisible) btn.style.display = 'none';
      return;
    }

    const mountTarget = pillVisible ? pill : findComposerFooterLeftGroup();
    if (!mountTarget) return;

    if (!btn) {
      btn = document.createElement('span');
      btn.id = 'ag-auto-compact-btn';
    }
    if (btn.parentElement !== mountTarget) {
      mountTarget.appendChild(btn);
    }
    if (btn.style.display === 'none') {
      btn.style.display = 'inline-flex';
    }

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      executeSlashCompact(true);
    };
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextState = !isAutoCompactEnabled();
      setAutoCompactEnabled(nextState);
      updateAutoCompactBadge(window.__ag_last_metrics);
      showCompactToast(
        nextState
          ? `✅ 已开启 ${getAutoCompactThreshold()}% 自动压缩上下文守卫`
          : '⏸️ 已关闭自动压缩守卫（仍可左键点击手动压缩）',
        !nextState
      );
    };

    const currentCidMatch = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
    const currentCid = currentCidMatch ? currentCidMatch[1] : '';
    const validPayload = payload && payload.cascadeId === currentCid ? payload : null;

    const enabled = isAutoCompactEnabled();
    const threshold = getAutoCompactThreshold();
    const pct = parseCtxPctFromPayload(validPayload);
    btn.setAttribute('data-enabled', enabled ? '1' : '0');
    btn.setAttribute('data-high', pct >= threshold ? '2' : pct >= threshold - 10 ? '1' : '0');
    btn.textContent = enabled ? `⚡${threshold}%自动` : '⚡自动:关';
    btn.title = `当前上下文水位：${pct}%（自动压缩阈值：${threshold}%）\n• 左键点击：立即发送 /compact 精简上下文\n• 右键点击：开启 / 关闭 ${threshold}% 自动压缩`;

    if (!enabled || !validPayload || !validPayload.hasData || !validPayload.cascadeId) return;
    if (pct < threshold) return;

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
      const latestPct = parseCtxPctFromPayload(latestPayload);
      if (latestPct < getAutoCompactThreshold()) return;

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
