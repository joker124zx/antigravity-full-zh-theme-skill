/**
 * user/custom.js — 极速切换对话（SQLite 错峰读取 + 零 Observer 泄漏）、按需右键/三点菜单汉化（平时 100% 原生 Array.map）与新会话自动中文标题守卫
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
    // 仅针对弹出式菜单按钮（⋮ 三点菜单、aria-haspopup="menu"）启用瞬时拦截，普通按钮与对话点击 100% 保持原生 Array.map
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

  // 3. 切换历史对话时大幅错峰读取 SQLite：推迟 1200ms 并配合 requestIdleCallback 再通知后台守护进程解析 .db 指标，彻底杜绝与 Antigravity 主程序抢占磁盘 IO
  if (typeof window.__agRequestMetrics === 'function' && !window.__ag_orig_req_metrics) {
    window.__ag_orig_req_metrics = window.__agRequestMetrics;
  }
  if (window.__ag_orig_req_metrics) {
    let metricsDebounceTimer = null;
    const deferredReq = (cid) => {
      if (metricsDebounceTimer) clearTimeout(metricsDebounceTimer);
      metricsDebounceTimer = setTimeout(() => {
        metricsDebounceTimer = null;
        const invoke = () => {
          try {
            window.__ag_orig_req_metrics(cid);
          } catch (e) {}
        };
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(invoke, { timeout: 1000 });
        } else {
          invoke();
        }
      }, 1200);
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
    const runIdleTasks = () => {
      autoLocalizeActiveConvTitle();
      localizeDynamicChromeStrings();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(runIdleTasks, { timeout: 1500 });
    } else {
      runIdleTasks();
    }
  }, 3500);

  // 4.5 轻量汉化 v2.31.0 外框动态文本（Updated HH:MM、Today HH:MM、Trajectory ID 与按钮无障碍提示，绝不扫描对话消息区）
  const RE_UPDATED_AT = /^Updated\s+(.+)$/;
  const RE_TODAY_TIME = /\(Today\s+([^)]+)\)/g;
  const RE_YESTERDAY_TIME = /\(Yesterday\s+([^)]+)\)/g;
  const RE_TRAJECTORY_ID = /^Trajectory ID:\s*(.+)$/;

  function localizeDynamicChromeStrings() {
    try {
      const dict = window.__ag_i18n_dict || {};
      // 1) 汉化顶栏/侧栏/标签栏/产物栏的动态时间戳文本节点（严格跳过聊天消息正文与编辑器）
      const containers = document.querySelectorAll('header, aside, .bg-sidebar, [role="tablist"], [role="tab"], [aria-label="Artifact Viewer"], [aria-label="产物预览器"], [data-testid*="artifact"], footer');
      for (let i = 0; i < containers.length; i++) {
        const walker = document.createTreeWalker(containers[i], NodeFilter.SHOW_TEXT);
        let tn;
        while ((tn = walker.nextNode())) {
          const raw = tn.nodeValue;
          if (!raw || raw.length > 90) continue;
          const s = raw.trim();
          if (!s) continue;
          let next = null;
          if (dict[s]) {
            next = raw.replace(s, dict[s]);
          } else if (RE_UPDATED_AT.test(s)) {
            next = raw.replace(RE_UPDATED_AT, '更新于 $1');
          } else if (s.includes('(Today ')) {
            next = raw.replace(RE_TODAY_TIME, '（今天 $1）');
          } else if (s.includes('(Yesterday ')) {
            next = raw.replace(RE_YESTERDAY_TIME, '（昨天 $1）');
          } else if (RE_TRAJECTORY_ID.test(s)) {
            next = raw.replace(RE_TRAJECTORY_ID, '轨迹 ID：$1');
          }
          if (next && next !== raw) {
            tn.nodeValue = next;
          }
        }
      }
      // 2) 汉化外框按钮的 placeholder / title / aria-label 悬停提示
      const attrEls = document.querySelectorAll('button[aria-label], button[title], input[placeholder]');
      for (let j = 0; j < attrEls.length; j++) {
        const el = attrEls[j];
        if (el.closest('[data-testid="autoscroll-viewport"]')) continue;
        for (const attr of ['placeholder', 'title', 'aria-label']) {
          const val = el.getAttribute(attr);
          if (!val) continue;
          const trimmed = val.trim();
          if (dict[trimmed]) {
            el.setAttribute(attr, dict[trimmed]);
          } else if (trimmed.startsWith('Select model, current: ')) {
            el.setAttribute(attr, '选择模型（当前：' + trimmed.slice(23) + '）');
          } else if (trimmed.startsWith('Close ')) {
            el.setAttribute(attr, '关闭 ' + trimmed.slice(6).replace(RE_TODAY_TIME, '（今天 $1）'));
          }
        }
      }
    } catch (e) {}
  }
  setTimeout(localizeDynamicChromeStrings, 400);

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

  function isAgentBusy() {
    const box = document.getElementById('antigravity.agentSidePanelInputBox');
    if (document.querySelector('[data-testid="status-loading-spinner"]')) return true;
    if (box && box.querySelector('[data-testid="stop-button"], [aria-label*="Stop"], [aria-label*="停止"]')) {
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

    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
    } catch (e) {}

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
    setTimeout(() => {
      window.__ag_compact_in_flight = false;
    }, 3000);

    showCompactToast(
      isManual
        ? '⚡ 正在执行 /compact 压缩当前会话上下文...'
        : `⚡ 上下文已达 ${getAutoCompactThreshold()}% 警戒线，正在自动执行 /compact 防卡死...`,
      false
    );

    setEditorTextAndFire(editor, COMPACT_COMMAND);

    setTimeout(() => {
      const sendBtn = box.querySelector('[data-testid="send-button"]');
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
      } else {
        editor.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          })
        );
      }
    }, 120);

    return true;
  }

  window.__ag_trigger_compact = () => executeSlashCompact(true);

  function parseCtxPctFromPayload(payload) {
    if (!payload || typeof payload.inlineHtml !== 'string') return 0;
    const m = payload.inlineHtml.match(/\((\d+)%\)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function updateAutoCompactBadge(payload) {
    const pill = document.getElementById('ag-live-metrics-pill');
    if (!pill) return;
    let btn = document.getElementById('ag-auto-compact-btn');
    if (!btn) {
      btn = document.createElement('span');
      btn.id = 'ag-auto-compact-btn';
      pill.appendChild(btn);
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

    const enabled = isAutoCompactEnabled();
    const threshold = getAutoCompactThreshold();
    const pct = parseCtxPctFromPayload(payload);
    btn.setAttribute('data-enabled', enabled ? '1' : '0');
    btn.setAttribute('data-high', pct >= threshold ? '2' : pct >= threshold - 10 ? '1' : '0');
    btn.textContent = enabled ? `⚡${threshold}%自动` : '⚡自动:关';
    btn.title = `当前上下文水位：${pct}%（自动压缩阈值：${threshold}%）\n• 左键点击：立即发送 /compact 精简上下文\n• 右键点击：开启 / 关闭 ${threshold}% 自动压缩`;

    if (!enabled || !payload || !payload.hasData || !payload.cascadeId) return;
    if (pct < threshold) return;

    const now = Date.now();
    const lastRecord = compactCooldownMap.get(payload.cascadeId);
    if (lastRecord && (now - lastRecord.ts < 180000 || lastRecord.sig === payload.sig)) {
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
      if (!latestPayload || latestPayload.cascadeId !== payload.cascadeId) return;
      const latestPct = parseCtxPctFromPayload(latestPayload);
      if (latestPct < getAutoCompactThreshold()) return;

      compactCooldownMap.set(payload.cascadeId, { ts: Date.now(), sig: latestPayload.sig });
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
