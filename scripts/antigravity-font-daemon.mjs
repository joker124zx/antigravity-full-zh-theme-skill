#!/usr/bin/env node
/**
 * Antigravity Persistent Self-Healing Daemon (Zero-Idle-Overhead Edition)
 * 1. Shortcut Self-Healer: Repairs Desktop / Start Menu / Taskbar shortcuts only when .lnk mtime changes.
 * 2. Updater Proxy Guard: Event-driven via DevToolsActivePort signature — 0 PowerShell/WMI spawns during normal usage;
 *    only inspects Win32_Process when Antigravity restarts or updates.
 * 3. Manifest & argv.json Guard: Re-applies Chinese descriptions only on startup or when Antigravity app package.json mtime changes.
 * 4. Runs core/daemon.mjs for zero-modification CDP hot-injection of Full-Domain ZH-CN & Claude Theme.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { localizeAllLocalSkills } from '../theme-patch/scripts/localize-local-skills.mjs';

process.on('uncaughtException', (err) => {
  try {
    console.error('[Daemon] uncaughtException:', err?.message || err);
  } catch {}
});
process.on('unhandledRejection', (err) => {
  try {
    console.error('[Daemon] unhandledRejection:', err?.message || err);
  } catch {}
});

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const POWERSHELL_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const LAUNCHER_SCRIPT = path.join(HOME, '.gemini', 'antigravity', 'scripts', 'launch_antigravity_auto.ps1');
const ANTIGRAVITY_EXE = path.join(LOCALAPPDATA, 'Programs', 'antigravity', 'Antigravity.exe');
const ANTIGRAVITY_ASAR = path.join(LOCALAPPDATA, 'Programs', 'antigravity', 'resources', 'app.asar');
const ANTIGRAVITY_PKG = path.join(LOCALAPPDATA, 'Programs', 'antigravity', 'resources', 'app', 'package.json');
const DEVTOOLS_PORT_FILE = path.join(APPDATA, 'Antigravity', 'DevToolsActivePort');
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7890;

const SHORTCUT_PATHS = [
  path.join(APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Antigravity.lnk'),
  path.join(APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Antigravity', 'Antigravity.lnk'),
  path.join(HOME, 'Desktop', 'Antigravity.lnk'),
  path.join(HOME, 'Desktop', 'Antigravity-AutoProxy.lnk'),
  path.join(HOME, 'Desktop', 'Antigravity 代理启动.lnk'),
  path.join(APPDATA, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'Antigravity.lnk')
];

// ============================================================================
// 1. Shortcut Self-Healer (mtime-cached, zero unnecessary file reads)
// ============================================================================
let isRepairingShortcuts = false;
const shortcutMtimeCache = new Map();

function needsShortcutRepair(lnkPath) {
  try {
    if (!fs.existsSync(lnkPath)) return false;
    const st = fs.statSync(lnkPath);
    const sig = `${st.mtimeMs}:${st.size}`;
    if (shortcutMtimeCache.get(lnkPath) === sig) return false;

    const buf = fs.readFileSync(lnkPath);
    const ascii = buf.toString('latin1');
    const utf16 = buf.toString('utf16le');
    const hasProxyLauncher =
      ascii.includes('launch_antigravity_auto.ps1') || utf16.includes('launch_antigravity_auto.ps1');
    if (hasProxyLauncher) {
      shortcutMtimeCache.set(lnkPath, sig);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function ensureProxyShortcuts() {
  if (isRepairingShortcuts || !fs.existsSync(LAUNCHER_SCRIPT)) return;
  const toRepair = SHORTCUT_PATHS.filter(needsShortcutRepair);
  if (toRepair.length === 0) return;

  isRepairingShortcuts = true;
  const psLines = [
    '$ws = New-Object -ComObject WScript.Shell',
    ...toRepair.map((lnk) => {
      const escLnk = lnk.replace(/'/g, "''");
      const escLauncher = LAUNCHER_SCRIPT.replace(/'/g, "''");
      const escWorkDir = path.dirname(ANTIGRAVITY_EXE).replace(/'/g, "''");
      const escIcon = `${ANTIGRAVITY_EXE},0`.replace(/'/g, "''");
      return `if (Test-Path -LiteralPath '${escLnk}') { $sc = $ws.CreateShortcut('${escLnk}'); $sc.TargetPath = '${POWERSHELL_EXE}'; $sc.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + '${escLauncher}' + '"'; $sc.WorkingDirectory = '${escWorkDir}'; $sc.IconLocation = '${escIcon}'; $sc.Description = 'Antigravity (Auto Proxy & Full ZH-CN)'; $sc.Save() }`;
    })
  ].join('; ');

  execFile(
    POWERSHELL_EXE,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psLines],
    { windowsHide: true, timeout: 12000 },
    (err) => {
      isRepairingShortcuts = false;
      if (!err) {
        for (const p of toRepair) shortcutMtimeCache.delete(p);
        console.log('[SelfHeal] Repaired shortcuts:', toRepair.map((p) => path.basename(p)).join(', '));
      }
    }
  );
}

// ============================================================================
// 2. Unproxied Process Guard (Zero PowerShell spawns while verified session lives)
// ============================================================================
let isCheckingProcess = false;
let lastRelaunchTs = 0;
let verifiedPortSig = '';
let lastBareProbeTs = 0;

function isTcpListening(host, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
    sock.connect(port, host);
  });
}

function getPortFileInfo() {
  try {
    if (!fs.existsSync(DEVTOOLS_PORT_FILE)) return null;
    const st = fs.statSync(DEVTOOLS_PORT_FILE);
    const firstLine = fs.readFileSync(DEVTOOLS_PORT_FILE, 'utf8').trim().split(/\r?\n/)[0];
    const port = parseInt(firstLine, 10);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { sig: `${st.mtimeMs}:${port}`, port };
  } catch {
    return null;
  }
}

async function ensureProxiedAntigravityProcess() {
  if (isCheckingProcess || !fs.existsSync(LAUNCHER_SCRIPT)) return;
  if (Date.now() - lastRelaunchTs < 25000) return;

  // Fast path: if DevToolsActivePort exists and is actively listening, CDP is 100% online — 0 PowerShell spawns!
  const portInfo = getPortFileInfo();
  if (portInfo) {
    const cdpAlive = await isTcpListening('127.0.0.1', portInfo.port, 350);
    if (cdpAlive) {
      verifiedPortSig = portInfo.sig;
      return;
    }
    verifiedPortSig = '';
  }

  // When no live CDP port exists (e.g. right after an Antigravity self-update restart), probe every 6s
  if (Date.now() - lastBareProbeTs < 6000) return;
  lastBareProbeTs = Date.now();

  // Immediately repair any shortcuts overwritten by the updater
  ensureProxyShortcuts();

  isCheckingProcess = true;
  try {
    const proxyUp = await isTcpListening(PROXY_HOST, PROXY_PORT, 350);

    const psCheck = `Get-CimInstance Win32_Process -Filter "Name='Antigravity.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch '--uninstall' -and $_.CommandLine -notmatch 'sidecars/' -and $_.CommandLine -notmatch 'sidecar_sdk' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;
    execFile(
      POWERSHELL_EXE,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCheck],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return;
        try {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const validList = list.filter((p) => p && p.ProcessId && typeof p.CommandLine === 'string');
          if (validList.length === 0) return;

          const bareProcs = validList.filter(
            (p) =>
              !p.CommandLine.includes('--remote-debugging-port') ||
              (proxyUp && !p.CommandLine.includes('--proxy-server='))
          );
          if (bareProcs.length > 0 && bareProcs.length === validList.length) {
            lastRelaunchTs = Date.now();
            verifiedPortSig = '';
            const pids = bareProcs.map((p) => Number(p.ProcessId)).filter(Boolean);
            console.log('[SelfHeal] Detected bare Antigravity.exe after update (PIDs:', pids.join(','), '). Relaunching with CDP + proxy...');
            const relaunchCmd = `Stop-Process -Id ${pids.join(',')} -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 900; & '${LAUNCHER_SCRIPT.replace(/'/g, "''")}'`;
            execFile(
              POWERSHELL_EXE,
              ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', relaunchCmd],
              { windowsHide: true, timeout: 15000 },
              () => {}
            );
          }
        } catch {}
      }
    );
  } finally {
    setTimeout(() => {
      isCheckingProcess = false;
    }, 1500);
  }
}

// ============================================================================
// 3. Built-in SKILL.md / plugin.json & argv.json Auto-Healer (Update-triggered only)
// ============================================================================
let lastAppPkgSig = '';

function ensureArgvAndLocalSkills(force = false) {
  let curPkgSig = 'none';
  try {
    const targetBin = fs.existsSync(ANTIGRAVITY_ASAR)
      ? ANTIGRAVITY_ASAR
      : fs.existsSync(ANTIGRAVITY_PKG)
        ? ANTIGRAVITY_PKG
        : ANTIGRAVITY_EXE;
    if (fs.existsSync(targetBin)) {
      const st = fs.statSync(targetBin);
      curPkgSig = `${st.mtimeMs}:${st.size}`;
    }
  } catch {}

  if (!force && lastAppPkgSig && curPkgSig === lastAppPkgSig) {
    return;
  }
  lastAppPkgSig = curPkgSig;

  try {
    const argvPath = path.join(HOME, '.antigravity', 'argv.json');
    if (fs.existsSync(argvPath)) {
      const raw = fs.readFileSync(argvPath, 'utf8');
      if (!raw.includes('"locale"')) {
        const updated = raw.replace(/\}\s*$/, ',\n\t"locale": "zh-cn",\n\t"remote-debugging-port": 0\n}\n');
        fs.writeFileSync(argvPath, updated, 'utf8');
      } else if (/"remote-debugging-port"\s*:\s*9222/.test(raw)) {
        fs.writeFileSync(argvPath, raw.replace(/"remote-debugging-port"\s*:\s*9222/, '"remote-debugging-port": 0'), 'utf8');
      }
    }
  } catch {}

  try {
    const count = localizeAllLocalSkills(undefined, true);
    if (count > 0) {
      console.log(`[SelfHeal] Re-localized ${count} skill/plugin manifests overwritten by update.`);
    }
  } catch {}
}

// ============================================================================
// 4. Sidecar plugin:// Iframe I18n Injector (Zero-Core-Modification Extension)
// ============================================================================
const THEME_PATCH_ROOT = path.join(HOME, '.gemini', 'antigravity', 'theme-patch');
const CORE_I18N_PATH = path.join(THEME_PATCH_ROOT, 'core', 'i18n.json');
const USER_I18N_PATH = path.join(THEME_PATCH_ROOT, 'user', 'i18n.override.json');
const attachedSidecars = new Map();
let sidecarDictSig = '';
let cachedSidecarPayload = '';

function buildSidecarInjectPayload() {
  let sig = '';
  try {
    const s1 = fs.existsSync(CORE_I18N_PATH) ? fs.statSync(CORE_I18N_PATH) : { mtimeMs: 0, size: 0 };
    const s2 = fs.existsSync(USER_I18N_PATH) ? fs.statSync(USER_I18N_PATH) : { mtimeMs: 0, size: 0 };
    sig = `${s1.mtimeMs}:${s1.size}|${s2.mtimeMs}:${s2.size}`;
  } catch {}
  if (sig && sig === sidecarDictSig && cachedSidecarPayload) {
    return { sig, script: cachedSidecarPayload, changed: false };
  }
  sidecarDictSig = sig;

  let dict = {};
  try {
    const c = JSON.parse(fs.readFileSync(CORE_I18N_PATH, 'utf8'));
    const u = JSON.parse(fs.readFileSync(USER_I18N_PATH, 'utf8'));
    dict = Object.assign({}, c.exact || c, u.exact || u);
    for (const k of Object.keys(dict)) {
      if (k.startsWith('_') || typeof dict[k] !== 'string') delete dict[k];
    }
  } catch {}

  cachedSidecarPayload = `(() => {
    const SIG = ${JSON.stringify(sig)};
    if (window.__ag_sidecar_i18n_sig === SIG) return true;
    window.__ag_sidecar_i18n_sig = SIG;
    const DICT = ${JSON.stringify(dict)};
    window.__ag_sidecar_dict = DICT;

    if (!document.getElementById('ag-sidecar-zh-font')) {
      const st = document.createElement('style');
      st.id = 'ag-sidecar-zh-font';
      st.textContent = ':root, body, button, input, select, textarea { font-family: "Sarasa UI SC", "Microsoft YaHei UI", system-ui, -apple-system, sans-serif !important; }';
      (document.head || document.documentElement).appendChild(st);
    }

    function trNode(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        const p = node.parentElement;
        if (!p) return;
        const tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE') return;
        if (p.classList && p.classList.contains('material-icons')) return;
        const raw = node.nodeValue;
        if (!raw) return;
        const t = raw.trim();
        if (!t) return;
        const d = window.__ag_sidecar_dict || {};
        if (d[t]) {
          node.nodeValue = raw.replace(t, d[t]);
        } else if (/^@all\\s+(\\d+)$/.test(t)) {
          node.nodeValue = raw.replace(t, t.replace(/^@all\\s+(\\d+)$/, '@all ($1)'));
        }
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'PRE' || node.tagName === 'CODE') return;
      const d = window.__ag_sidecar_dict || {};
      for (const a of ['title', 'placeholder', 'aria-label', 'alt']) {
        const v = node.getAttribute && node.getAttribute(a);
        if (v && d[v.trim()]) node.setAttribute(a, d[v.trim()]);
      }
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) trNode(n);
      if (node.querySelectorAll) {
        for (const el of node.querySelectorAll('[title],[placeholder],[aria-label],[alt]')) {
          for (const a of ['title', 'placeholder', 'aria-label', 'alt']) {
            const v = el.getAttribute(a);
            if (v && d[v.trim()]) el.setAttribute(a, d[v.trim()]);
          }
        }
      }
    }

    if (document.title && DICT[document.title.trim()]) {
      document.title = DICT[document.title.trim()];
    }
    if (document.body) trNode(document.body);

    if (window.__ag_sidecar_mo) {
      try { window.__ag_sidecar_mo.disconnect(); } catch {}
    }
    window.__ag_sidecar_mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') trNode(m.target);
        else if (m.type === 'childList') {
          for (const n of m.addedNodes) trNode(n);
        }
      }
    });
    if (document.documentElement) {
      window.__ag_sidecar_mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    return true;
  })()`;

  return { sig, script: cachedSidecarPayload, changed: true };
}

let isSyncingSidecars = false;
async function syncSidecarIframes() {
  if (isSyncingSidecars) return;
  const portInfo = getPortFileInfo();
  if (!portInfo) {
    attachedSidecars.clear();
    return;
  }
  isSyncingSidecars = true;
  try {
    const res = await fetch(`http://127.0.0.1:${portInfo.port}/json/list`, { signal: AbortSignal.timeout(1200) }).catch(() => null);
    if (!res || !res.ok) return;
    const targets = await res.json().catch(() => []);
    const { sig, script } = buildSidecarInjectPayload();
    const liveIds = new Set();

    for (const t of targets) {
      if (t.type !== 'iframe' || !t.webSocketDebuggerUrl) continue;
      const url = String(t.url || '');
      if (!url.startsWith('plugin://')) continue;
      if (url.includes('folder-helper') || url.includes('agy-dart')) continue;

      liveIds.add(t.id);
      if (attachedSidecars.get(t.id) === sig) continue;

      await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        const timer = setTimeout(finish, 1800);
        try {
          const ws = new WebSocket(t.webSocketDebuggerUrl);
          ws.onopen = () => {
            ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
            ws.send(JSON.stringify({ id: 2, method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: script } }));
            ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: script, returnByValue: true } }));
          };
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(String(ev.data));
              if (msg.id === 3) {
                attachedSidecars.set(t.id, sig);
                clearTimeout(timer);
                ws.close();
                finish();
              }
            } catch {}
          };
          ws.onerror = () => { clearTimeout(timer); finish(); };
          ws.onclose = () => { clearTimeout(timer); finish(); };
        } catch {
          clearTimeout(timer);
          finish();
        }
      });
    }

    for (const id of attachedSidecars.keys()) {
      if (!liveIds.has(id)) attachedSidecars.delete(id);
    }
  } finally {
    isSyncingSidecars = false;
  }
}

// Start all self-healing guards with zero idle CPU overhead
ensureProxyShortcuts();
ensureArgvAndLocalSkills(true);
ensureProxiedAntigravityProcess();
syncSidecarIframes();

setInterval(ensureProxyShortcuts, 60000).unref();
setInterval(ensureProxiedAntigravityProcess, 6000).unref();
setInterval(() => ensureArgvAndLocalSkills(false), 120000).unref();
setInterval(syncSidecarIframes, 4000).unref();

// Launch core CDP theme & i18n daemon (portable across any Windows user directory)
const coreDaemonUrl = pathToFileURL(path.join(THEME_PATCH_ROOT, 'core', 'daemon.mjs')).href;
await import(coreDaemonUrl);
