// Проверки выгрузки правил для разных агентов.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { skills, SKILLS } from '../src/commands/skills.js';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mgen-skills-'));
}

test('навыков ровно два и у обоих есть файл в пакете', () => {
  assert.equal(SKILLS.length, 2);
  for (const skill of SKILLS) {
    const file = path.join(process.cwd(), skill.from, 'SKILL.md');
    assert.equal(fs.existsSync(file), true, `нет файла навыка: ${file}`);
  }
});

test('AGENTS.md собирается без YAML-шапки и содержит оба набора правил', async () => {
  const dir = tmpdir();
  await skills(['install', '--for', 'agents', '--out', dir]);
  const text = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.equal(text.startsWith('---'), false, 'YAML-шапка Claude Code не должна попадать в AGENTS.md');
  assert.match(text, /Графика для сайтов через mgen/);
  assert.match(text, /Сайт по референсу/);
  assert.match(text, /без\*\* `--yes`/);
});

test('для Cursor шапка своя, с описанием', async () => {
  const dir = tmpdir();
  await skills(['install', '--for', 'cursor', '--out', dir]);
  const text = fs.readFileSync(path.join(dir, '.cursor', 'rules', 'mgen.mdc'), 'utf8');
  assert.equal(text.startsWith('---\ndescription:'), true);
  assert.match(text, /alwaysApply: false/);
});

test('файл не перезаписывается без --force', async () => {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'мой текст', 'utf8');
  await skills(['install', '--for', 'agents', '--out', dir]);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), 'мой текст');
  await skills(['install', '--for', 'agents', '--out', dir, '--force']);
  assert.notEqual(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), 'мой текст');
});
