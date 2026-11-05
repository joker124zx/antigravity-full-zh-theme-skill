#!/usr/bin/env node
/**
 * Optional Helper: Localize Built-in / Installed SKILL.md & plugin.json descriptions
 * into Simplified Chinese using user/i18n.override.json dictionary mappings.
 *
 * Usage:
 *   node scripts/localize-local-skills.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overridePath = path.resolve(__dirname, '../user/i18n.override.json');

if (!fs.existsSync(overridePath)) {
  console.error('[!] Cannot find user/i18n.override.json');
  process.exit(1);
}

const dict = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
const home = os.homedir();
const roots = [
  path.join(home, '.gemini', 'antigravity', 'builtin'),
  path.join(home, '.gemini', 'config', 'skills'),
  path.join(home, '.gemini', 'config', 'plugins')
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'SKILL.md' || entry.name === 'plugin.json') out.push(full);
  }
  return out;
}

let updatedCount = 0;
for (const r of roots) {
  for (const file of walk(r)) {
    const raw = fs.readFileSync(file, 'utf8');
    if (file.endsWith('plugin.json')) {
      try {
        const obj = JSON.parse(raw);
        if (obj.description && dict[obj.description]) {
          if (!fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', raw, 'utf8');
          obj.description = dict[obj.description];
          fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
          updatedCount++;
          console.log('[+] Localized plugin.json:', file);
        }
      } catch {}
    } else if (file.endsWith('SKILL.md')) {
      const m = raw.match(/^(---\r?\n[\s\S]*?\r?\n---)/);
      if (!m) continue;
      let fm = m[1];
      let changed = false;
      for (const [en, zh] of Object.entries(dict)) {
        if (en.length > 20 && fm.includes(en)) {
          fm = fm.replace(en, zh);
          changed = true;
        }
      }
      if (changed) {
        if (!fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', raw, 'utf8');
        fs.writeFileSync(file, raw.replace(m[1], fm), 'utf8');
        updatedCount++;
        console.log('[+] Localized SKILL.md:', file);
      }
    }
  }
}

console.log(`[✓] Done. Updated ${updatedCount} local skill/plugin manifest files.`);
