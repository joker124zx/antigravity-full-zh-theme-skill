#!/usr/bin/env node
/**
 * Localize Built-in / Installed SKILL.md & plugin.json descriptions
 * into Simplified Chinese using user/i18n.override.json dictionary mappings.
 * Supports both single-line YAML `description: ...` and folded `description: >-` blocks.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overridePath = path.resolve(__dirname, '../user/i18n.override.json');

export function localizeAllLocalSkills(customOverridePath = overridePath, quiet = false) {
  if (!fs.existsSync(customOverridePath)) {
    if (!quiet) console.error('[!] Cannot find user/i18n.override.json:', customOverridePath);
    return 0;
  }

  const dict = JSON.parse(fs.readFileSync(customOverridePath, 'utf8'));
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
      let raw;
      try {
        raw = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      if (file.endsWith('plugin.json')) {
        try {
          const obj = JSON.parse(raw);
          if (obj.description && dict[obj.description]) {
            if (!fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', raw, 'utf8');
            obj.description = dict[obj.description];
            fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
            updatedCount++;
            if (!quiet) console.log('[+] Localized plugin.json:', file);
          }
        } catch {}
      } else if (file.endsWith('SKILL.md')) {
        const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
        if (!m) continue;
        let fmBody = m[2];
        if (/[\u4e00-\u9fa5]/.test(fmBody)) continue; // Already localized

        let changed = false;

        // Case 1: Folded / multiline description (`description: >-` or `description: |` or wrapped indented lines)
        const foldedRe = /^description:\s*(?:>[-+]?|\|[-+]?)?\s*\r?\n((?:[ \t]+.+\r?\n?)+)/m;
        const fmMatch = fmBody.match(foldedRe);
        if (fmMatch) {
          const joined = fmMatch[1]
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean)
            .join(' ');
          if (dict[joined]) {
            fmBody = fmBody.replace(fmMatch[0], `description: ${JSON.stringify(dict[joined])}\n`);
            changed = true;
          }
        }

        // Case 2: Single-line description (`description: ...`)
        if (!changed) {
          const singleRe = /^description:\s*(.+)$/m;
          const sm = fmBody.match(singleRe);
          if (sm) {
            let val = sm[1].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (dict[val]) {
              fmBody = fmBody.replace(sm[0], `description: ${JSON.stringify(dict[val])}`);
              changed = true;
            }
          }
        }

        if (changed) {
          if (!fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', raw, 'utf8');
          const updatedRaw = m[1] + fmBody.replace(/\r?\n$/, '') + m[3] + raw.slice(m[0].length);
          fs.writeFileSync(file, updatedRaw, 'utf8');
          updatedCount++;
          if (!quiet) console.log('[+] Localized SKILL.md:', file);
        }
      }
    }
  }

  if (!quiet) console.log(`[✓] Done. Updated ${updatedCount} local skill/plugin manifest files.`);
  return updatedCount;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  localizeAllLocalSkills();
}
