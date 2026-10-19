// Проверки сборки сайта в один файл: прорежение кадров, пересчёт data-count,
// сборка маленькой страницы целиком. Интернет не нужен: шрифтов в тестовой странице нет.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_FRAMES,
  buildPack,
  dataUri,
  framePath,
  keepSubsets,
  mimeFor,
  pickFrames,
  rewriteFrameSections,
} from '../src/commands/pack.js';
import { UserError } from '../src/errors.js';

test('кадры прорежаются ровно до нужного числа, первый и последний на месте', () => {
  const chosen = pickFrames(120, 90);
  assert.equal(chosen.length, 90);
  assert.equal(chosen[0], 0);
  assert.equal(chosen[89], 119);
  // Номера идут по возрастанию и без повторов.
  for (let i = 1; i < chosen.length; i += 1) assert.ok(chosen[i] > chosen[i - 1]);
});

test('кадры берутся через равные промежутки', () => {
  assert.deepEqual(pickFrames(9, 5), [0, 2, 4, 6, 8]);
  assert.deepEqual(pickFrames(10, 3), [0, 5, 9]);
});

test('все кадры: --frames 0, число больше запаса или ничего не указано', () => {
  assert.equal(pickFrames(12, 0).length, 12);
  assert.equal(pickFrames(12, 500).length, 12);
  assert.equal(pickFrames(12, undefined).length, 12);
  assert.deepEqual(pickFrames(4, 4), [0, 1, 2, 3]);
});

test('один кадр — понятная ошибка, а не сломанная анимация', () => {
  assert.throws(() => pickFrames(120, 1), UserError);
});

test('номер кадра подставляется с ведущими нулями', () => {
  assert.equal(framePath('frames/frame-$.jpg', 0, 4), 'frames/frame-0001.jpg');
  assert.equal(framePath('frames/frame-$.jpg', 119, 4), 'frames/frame-0120.jpg');
  assert.equal(framePath('kadry/k-$.jpg', 8, 2), 'kadry/k-09.jpg');
});

test('data-count пересчитывается под прорежённые кадры', () => {
  const html = `<section class="mgen-scroll hero" data-frames="frames/frame-$.jpg" data-count="120" data-pad="4">x</section>`;
  const { html: out, sections } = rewriteFrameSections(html, 30);
  assert.match(out, /data-count="30"/);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].sourceCount, 120);
  assert.equal(sections[0].chosen.length, 30);
  assert.equal(sections[0].pad, 4);
});

test('data-count не трогаем, когда кадры не прорежены', () => {
  const html = `<section class="mgen-scroll" data-frames="f/$.jpg" data-count="40">x</section>`;
  assert.match(rewriteFrameSections(html, 0).html, /data-count="40"/);
  assert.match(rewriteFrameSections(html, 100).html, /data-count="40"/);
});

test('секции без анимации не меняются', () => {
  const html = `<section class="band" data-count="120">x</section>`;
  const { html: out, sections } = rewriteFrameSections(html, 10);
  assert.equal(out, html);
  assert.equal(sections.length, 0);
});

test('из шрифтов Google остаётся только латиница и кириллица', () => {
  const css = [
    '/* cyrillic */',
    "@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/a.woff2) format('woff2'); }",
    '/* greek */',
    "@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/b.woff2) format('woff2'); }",
    '/* latin */',
    "@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/c.woff2) format('woff2'); }",
  ].join('\n');
  const kept = keepSubsets(css);
  assert.match(kept, /a\.woff2/);
  assert.match(kept, /c\.woff2/);
  assert.doesNotMatch(kept, /b\.woff2/);
  assert.equal(kept.match(/@font-face/g).length, 2);
});

test('тип файла узнаётся по расширению', () => {
  assert.equal(mimeFor('frames/frame-0001.jpg'), 'image/jpeg');
  assert.equal(mimeFor('a.WOFF2'), 'font/woff2');
  assert.equal(mimeFor('a.unknown'), 'application/octet-stream');
  assert.match(dataUri('a.png', Buffer.from('hi')), /^data:image\/png;base64,aGk=$/);
});

/** Маленький сайт на диске: страница, стиль, скрипт, фото и восемь кадров. */
function makeSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgen-pack-'));
  fs.mkdirSync(path.join(dir, 'frames'));
  fs.mkdirSync(path.join(dir, 'img'));
  const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
  for (let i = 1; i <= 8; i += 1) {
    fs.writeFileSync(path.join(dir, 'frames', `frame-${String(i).padStart(4, '0')}.jpg`), jpeg);
  }
  fs.writeFileSync(path.join(dir, 'img', 'foto.jpg'), jpeg);
  fs.writeFileSync(path.join(dir, 'img', 'fon.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  fs.writeFileSync(
    path.join(dir, 'styles.css'),
    'body { margin: 0; background: url("img/fon.png"); }',
  );
  fs.writeFileSync(path.join(dir, 'scroll-frames.js'), 'window.MGEN_TEST = 1;\n');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<section class="mgen-scroll hero" data-frames="frames/frame-$.jpg" data-count="8" data-pad="4">
  <canvas class="mgen-scroll__canvas"></canvas>
  <img class="mgen-scroll__fallback" src="frames/frame-0001.jpg" alt="">
</section>
<img src="img/foto.jpg" alt="фото">
<a href="https://t.me/kto-to">Телеграм</a>
<script src="scroll-frames.js"></script>
</body>
</html>`,
  );
  return dir;
}

test('маленький сайт собирается в один файл без внешних запросов', async () => {
  const dir = makeSite();
  const { html, ctx, sections } = await buildPack({ dir, limit: 4 });

  // Стиль и скрипт внутри, ссылок на соседние файлы не осталось.
  assert.match(html, /<style>/);
  assert.match(html, /margin: 0/);
  assert.match(html, /window\.MGEN_TEST = 1/);
  assert.doesNotMatch(html, /href="styles\.css"/);
  assert.doesNotMatch(html, /src="scroll-frames\.js"/);
  assert.doesNotMatch(html, /src="img\/foto\.jpg"/);
  assert.doesNotMatch(html, /src="frames\//);
  assert.doesNotMatch(html, /url\("img\/fon\.png"\)/);

  // Разогрев соединения со шрифтами убран, внешняя ссылка-текст осталась ссылкой.
  assert.doesNotMatch(html, /fonts\.gstatic\.com/);
  assert.match(html, /https:\/\/t\.me\/kto-to/);

  // Кадры прорежены, data-count пересчитан, кадры лежат внутри файла.
  assert.match(html, /data-count="4"/);
  assert.equal(sections[0].chosen.length, 4);
  assert.match(html, /window\.mgenPackedFrames/);
  assert.equal(ctx.kinds.frames, 4);
  assert.equal(ctx.kinds.styles, 1);
  assert.equal(ctx.kinds.scripts, 1);
  assert.equal(ctx.kinds.images, 2);
  assert.equal(ctx.missing.length, 0);

  // Встроенные кадры подписаны теми именами, которые попросит скрипт после прорежения.
  const map = html.match(/var files = (\{.*?\});/s)[1];
  const files = JSON.parse(map);
  assert.deepEqual(Object.keys(files).sort(), [
    'frames/frame-0001.jpg',
    'frames/frame-0002.jpg',
    'frames/frame-0003.jpg',
    'frames/frame-0004.jpg',
  ]);
  for (const uri of Object.values(files)) assert.match(uri, /^data:image\/jpeg;base64,/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('пример разметки внутри скрипта не путает подсчёт кадров', async () => {
  const dir = makeSite();
  // Так и выглядит настоящий scroll-frames.js: в комментарии лежит пример разметки.
  fs.writeFileSync(
    path.join(dir, 'scroll-frames.js'),
    `/*\n  <section class="mgen-scroll" data-frames="frames/frame-$.jpg" data-count="150">\n*/\nwindow.MGEN_TEST = 1;\n`,
  );
  const { ctx, sections } = await buildPack({ dir, limit: 4 });
  assert.equal(sections.length, 1);
  assert.equal(sections[0].sourceCount, 8);
  assert.equal(ctx.kinds.frames, 4);
  assert.equal(ctx.missing.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('все кадры целиком: --frames 0', async () => {
  const dir = makeSite();
  const { html, ctx } = await buildPack({ dir, limit: 0 });
  assert.match(html, /data-count="8"/);
  assert.equal(ctx.kinds.frames, 8);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('пропавший файл не ломает сборку, а попадает в список потерь', async () => {
  const dir = makeSite();
  fs.rmSync(path.join(dir, 'img', 'foto.jpg'));
  const { html, ctx } = await buildPack({ dir, limit: 4 });
  assert.equal(ctx.missing.length, 1);
  assert.match(html, /src="img\/foto\.jpg"/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('без index.html — понятная ошибка', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgen-pack-empty-'));
  await assert.rejects(() => buildPack({ dir }), UserError);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('по умолчанию кадров остаётся 90', () => {
  assert.equal(DEFAULT_FRAMES, 90);
  assert.equal(pickFrames(150, DEFAULT_FRAMES).length, 90);
});
