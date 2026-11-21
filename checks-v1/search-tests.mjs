// Independent exhaustive oracle on small, freshly reverse-scrambled rooms.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'checks-v1/synthetic');
rmSync(dir, { recursive: true, force: true });
const kit = process.argv[2];
const { points } = await import(pathToFileURL(join(kit, 'program/scorer/checker/check.mjs')));
const width = 8, directions = [-8, 8, -1, 1], door = 68;
let rng = 0x712659ab;
function random(n) { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) % n; }
const floor = new Set();
for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) floor.add(y * width + x);
floor.add(52); floor.add(60);
for (let x = 1; x <= 6; x++) floor.add(64 + x);
function reachable(p, boxes) {
  const queue = [p], seen = new Set(queue), occupied = new Set(boxes);
  for (let k = 0; k < queue.length; k++) for (const d of directions) {
    const v = queue[k] + d;
    if (floor.has(v) && !occupied.has(v) && !seen.has(v)) { seen.add(v); queue.push(v); }
  }
  return seen;
}
function exact(initial, goals) {
  // Breadth first push search: no heuristic and no deadlock pruning.
  const queue = [{ bs: initial, p: door, g: 0 }], seen = new Set();
  for (let k = 0; k < queue.length; k++) {
    const { bs, p, g } = queue[k];
    if (bs.every(b => goals.includes(b))) return g;
    const reach = reachable(p, bs), key = bs.join(',') + ':' + Math.min(...reach);
    if (seen.has(key)) continue;
    seen.add(key);
    for (let i = 0; i < bs.length; i++) for (const d of directions) {
      const b = bs[i], q = b + d;
      if (!reach.has(b - d) || !floor.has(q) || bs.includes(q)) continue;
      const next = bs.slice(); next[i] = q; next.sort((a, b) => a - b);
      queue.push({ bs: next, p: b, g: g + 1 });
    }
    assert(queue.length < 300000, 'Oracle test unexpectedly large');
  }
  throw new Error('Reverse scramble was unsolvable');
}
const cases = [];
for (let test = 0; test < 16; test++) {
  const goals = [18, 21, 42, 45].slice(0, test % 2 ? 4 : 3);
  let boxes = goals.slice(), p = door;
  for (let step = 0; step < 45 + test * 3; step++) {
    const reach = reachable(p, boxes), options = [];
    for (let i = 0; i < boxes.length; i++) for (const d of directions) {
      const q = boxes[i] + d, support = q + d;
      if (!reach.has(q) || !floor.has(support) || boxes.includes(support) || q < 18 || q > 45) continue;
      const next = boxes.slice(); next[i] = q; next.sort((a, b) => a - b);
      if (reachable(support, next).has(door)) options.push({ boxes: next, p: support });
    }
    if (!options.length) break;
    const chosen = options[random(options.length)]; boxes = chosen.boxes; p = chosen.p;
  }
  const id = 't' + String(test).padStart(3, '0');
  const rows = [];
  for (let y = 0; y < 10; y++) {
    let row = '';
    for (let x = 0; x < 8; x++) {
      const v = y * width + x;
      row += !floor.has(v) ? '#' : v === door ? '@' : boxes.includes(v) ? goals.includes(v) ? '*' : '$' : goals.includes(v) ? '.' : ' ';
    }
    rows.push(row);
  }
  const text = rows.join('\n') + '\n';
  const pushes = exact(boxes, goals);
  mkdirSync(join(dir, 'input', id), { recursive: true });
  writeFileSync(join(dir, 'input', id, 'level.txt'), text);
  cases.push({ id, text, pushes, boxes: boxes.length });
}
const child = spawnSync(process.execPath, ['--max-old-space-size=384', '--import', join(root, 'checks-v1/runtime-guard.mjs'), join(root, 'main.ts')], {
  cwd: root, env: { ...process.env, MAKEFUN_INPUT_DIR: join(dir, 'input'), MAKEFUN_OUTPUT_DIR: join(dir, 'output') },
  encoding: 'utf8', timeout: 60000,
});
assert.equal(child.error, undefined);
assert.equal(child.status, 0, child.stderr);
const results = cases.map(c => {
  const verdict = points({ 'level.txt': c.text }, { pushes: c.pushes }, { 'solution.txt': readFileSync(join(dir, 'output', c.id, 'solution.txt'), 'utf8') });
  assert.equal(verdict.points, 1000, JSON.stringify({ id: c.id, verdict }));
  return { id: c.id, boxes: c.boxes, optimal_pushes: c.pushes, verdict };
});
writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2) + '\n');
// Force exhaustion of only the optimal pass, exercising the actual completion fallback.
const variant = join(dir, 'forced-fallback.ts');
const original = readFileSync(join(root, 'main.ts'), 'utf8');
assert(original.includes(', width, 120000)'));
writeFileSync(variant, original.replace(', width, 120000)', ', width, 0)'));
const fallbackChild = spawnSync(process.execPath, ['--import', join(root, 'checks-v1/runtime-guard.mjs'), variant], {
  cwd: root, env: { ...process.env, MAKEFUN_INPUT_DIR: join(dir, 'input'), MAKEFUN_OUTPUT_DIR: join(dir, 'fallback-output') },
  encoding: 'utf8', timeout: 60000,
});
rmSync(variant);
assert.equal(fallbackChild.error, undefined);
assert.equal(fallbackChild.status, 0, fallbackChild.stderr);
assert(fallbackChild.stderr.includes('"weight":2'));
const fallback = cases.map(c => {
  const verdict = points({ 'level.txt': c.text }, { pushes: c.pushes }, {
    'solution.txt': readFileSync(join(dir, 'fallback-output', c.id, 'solution.txt'), 'utf8'),
  });
  assert(verdict.valid && verdict.points > 0, JSON.stringify({ id: c.id, verdict }));
  return { id: c.id, verdict };
});
console.log(JSON.stringify({ cases: results.length, all_push_optimal: true, results, forced_fallback: { all_solved: true, results: fallback } }));
