#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const NAME_RE = /^[a-z0-9-]+$/;
const NAME_MAX = 64;
const DESC_MAX = 1024;

function walk(dir, hits) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, hits);
    else if (name === 'SKILL.md') hits.push(p);
  }
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!km) continue;
    const key = km[1];
    let val = km[2];
    if (val === '>' || val === '|') {
      const parts = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        parts.push(lines[++i].trim());
      }
      val = parts.join(val === '>' ? ' ' : '\n');
    } else {
      // Strip matching surrounding quotes only — never half-strip.
      val = val.replace(/^(['"])(.*)\1$/, '$2');
    }
    out[key] = val;
  }
  return out;
}

function validate(file) {
  const errors = [];
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) { return [`${file}: read failed: ${e.message}`]; }

  const fm = parseFrontmatter(text);
  if (!fm) return [`${file}: no YAML frontmatter`];

  if (!fm.name) errors.push(`${file}: missing 'name'`);
  else {
    if (fm.name.length > NAME_MAX) errors.push(`${file}: 'name' is ${fm.name.length} chars (>64)`);
    if (!NAME_RE.test(fm.name)) errors.push(`${file}: 'name' "${fm.name}" violates ^[a-z0-9-]+$`);
  }

  if (!fm.description) errors.push(`${file}: missing 'description'`);
  else if (fm.description.length > DESC_MAX) {
    errors.push(`${file}: 'description' is ${fm.description.length} chars (>1024)`);
  }

  return errors;
}

function main() {
  const root = process.argv[2];
  if (!root) {
    process.stderr.write('usage: validate-skill-frontmatter.js <skills-dir>\n');
    process.exit(2);
  }
  const files = [];
  walk(root, files);
  if (files.length === 0) {
    process.stderr.write(`no SKILL.md found under ${root}\n`);
    process.exit(2);
  }

  let errors = [];
  for (const f of files) errors = errors.concat(validate(f));

  if (errors.length) {
    for (const e of errors) process.stderr.write(e + '\n');
    process.stderr.write(`\n${errors.length} error(s) across ${files.length} SKILL.md file(s)\n`);
    process.exit(1);
  }
  process.stdout.write(`OK: ${files.length} SKILL.md file(s) Pi-compatible\n`);
}

main();
