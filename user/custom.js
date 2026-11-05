/**
 * user/custom.js — 极速切换对话（SQLite 零抢占）、按需右键菜单汉化（平时 100% 原生 Array.map）与新会话自动中文标题守卫
 */
(() => {
  // 1. 清理任何旧版残留定时器和额外 Observer，并屏蔽旧版 mousedown 误断开主 Observer 的闭包
  if (window.__ag_custom_i18n_observer) {
    try {
      window.__ag_custom_i18n_observer.disconnect();
    } catch (e) {}
    window.__ag_custom_i18n_observer = null;
  }
  if (window.__ag_i18n_observer) {
    window.__ag_i18n_observer.disconnect = function () {};
  }

  // 2. 恢复 100% 原生 Array.prototype.map，仅在用户按下鼠标右键 (contextmenu) 的 60ms 窗口内按需拦截汉化菜单
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
    }, 120);
  }

  window.__ag_enable_temp_menu_hook = enableTempMenuMapHook;

  if (!window.__ag_ctx_menu_hook_installed_v2) {
    window.__ag_ctx_menu_hook_installed_v2 = true;
    window.addEventListener(
      'contextmenu',
      () => {
        if (typeof window.__ag_enable_temp_menu_hook === 'function') window.__ag_enable_temp_menu_hook();
      },
      true
    );
    const onBtnTrigger = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('button, [role="button"], [data-testid*="more"], [aria-haspopup]')) {
        if (typeof window.__ag_enable_temp_menu_hook === 'function') window.__ag_enable_temp_menu_hook();
      }
    };
    window.addEventListener('pointerdown', onBtnTrigger, true);
    window.addEventListener('mousedown', onBtnTrigger, true);
    window.addEventListener('click', onBtnTrigger, true);
  }

  // 3. 切换历史对话时错峰读取 SQLite：推迟 400ms 再通知后台守护进程解析 .db 指标，避免与 Antigravity 主程序抢占磁盘 IO
  if (typeof window.__agRequestMetrics === 'function' && !window.__ag_orig_req_metrics) {
    window.__ag_orig_req_metrics = window.__agRequestMetrics;
    let metricsDebounceTimer = null;
    const deferredReq = (cid) => {
      if (metricsDebounceTimer) clearTimeout(metricsDebounceTimer);
      metricsDebounceTimer = setTimeout(() => {
        metricsDebounceTimer = null;
        try {
          window.__ag_orig_req_metrics(cid);
        } catch (e) {}
      }, 400);
    };
    try {
      window.__agRequestMetrics = deferredReq;
      window.__ag_on_session_change = () => {};
    } catch (e) {}
  }

  // 4. 优化 core/runtime.js 的 1500ms 路由轮询：仅在 URL 实际变化或未挂载胶囊时才触发 DOM 查询
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
    const pill = document.getElementById('ag-live-metrics-pill');
    if (curHref !== lastHref || !pill) {
      lastHref = curHref;
      if (typeof window.__ag_check_route_fn === 'function') {
        window.__ag_check_route_fn();
      }
    }
    autoLocalizeActiveConvTitle();
  }, 3500);

  // 5. 当新建对话被后端自动生成英文标题时，若用户首条提问包含中文，自动将其重命名为中文标题
  const RE_HAS_CJK = /[\u4e00-\u9fa5]/;
  const RE_PURE_EN_TITLE = /^[A-Za-z0-9\s\-_.,:()'"/&+#]+$/;
  const processedCids = window.__ag_auto_titled_cids || (window.__ag_auto_titled_cids = new Set());

  function extractChineseTopic(rawText) {
    if (!rawText) return '';
    const cleaned = rawText
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[`*_#>~]/g, '')
      .trim();
    const lines = cleaned
      .split(/[\r\n，。！？；、,!?;]+/)
      .map((s) => s.trim())
      .filter((s) => RE_HAS_CJK.test(s));
    if (lines.length === 0) return '';
    let topic = lines[0]
      .replace(/^(请问|帮我|请帮我|麻烦帮我|我想|能不能|可以帮我|帮我看一下|帮我看看)/, '')
      .trim();
    if (!topic) topic = lines[0];
    return topic.length > 18 ? topic.slice(0, 18) : topic;
  }

  function autoLocalizeActiveConvTitle() {
    try {
      const selectedRow = document.querySelector('[data-testid="conversation-row-sidebar"][data-selected="true"]');
      if (!selectedRow) return;
      const cid = selectedRow.getAttribute('data-cascade-id');
      if (!cid || processedCids.has(cid)) return;

      const titleSpan = selectedRow.querySelector('span.truncate');
      const curTitle = titleSpan ? (titleSpan.textContent || '').trim() : '';
      if (!curTitle || RE_HAS_CJK.test(curTitle) || !RE_PURE_EN_TITLE.test(curTitle)) return;

      const firstUserMsg = document.querySelector('[data-testid="user-message-content"]');
      if (!firstUserMsg) return;
      const zhTopic = extractChineseTopic(firstUserMsg.textContent || '');
      if (!zhTopic) return;

      processedCids.add(cid);
      const fk = Object.keys(selectedRow).find((k) => k.startsWith('__reactFiber$'));
      if (!fk) return;
      let f = selectedRow[fk];
      while (f && (!f.memoizedProps || !f.memoizedProps.cascadeId || f.memoizedProps.variant !== 'sidebar')) {
        f = f.return;
      }
      if (!f) return;
      let s = f.memoizedState;
      while (s) {
        if (Array.isArray(s.memoizedState) && typeof s.memoizedState[0] === 'function') {
          if (s.memoizedState[0].toString().includes('updateOptimisticSummary')) {
            s.memoizedState[0](zhTopic);
            break;
          }
        }
        s = s.next;
      }
    } catch (e) {}
  }
})();
