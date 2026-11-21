// Original local verification harness; clocks here measure runs, never guide the solver.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, readlinkSync, rmSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kit = resolve(process.argv[2] ?? join(root, '../../sokoban-solver-01-run-20261121-kit-xingchi/sokoban-solver-01-run-20261121-kit'));
const checks = join(root, 'checks-v1');
const input = join(kit, 'practice/input');
const reference = join(kit, 'practice/reference');
const ids = ['i001', 'i002', 'i003', 'i004', 'i005'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fresh(name) {
  const dir = join(checks, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
function run(file, env, guard = false) {
  const start = process.hrtime.bigint();
  const args = ['--max-old-space-size=384'];
  if (guard) args.push('--import', join(checks, 'runtime-guard.mjs'));
  args.push(file);
  const child = spawnSync(process.execPath, args, {
    cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
  });
  const elapsed_ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stderr);
  return { elapsed_ms: Math.round(elapsed_ms * 1000) / 1000, log: child.stderr.trim().split('\n').filter(Boolean) };
}
function score(out, name) {
  const scoresDir = fresh(name);
  run(join(kit, 'program/scorer/score.ts'), {
    MAKEFUN_OUTPUT_DIR: out, MAKEFUN_REFERENCE_DIR: reference, MAKEFUN_SCORES_DIR: scoresDir,
  });
  return {
    scores: JSON.parse(readFileSync(join(scoresDir, 'scores.json'), 'utf8')),
    checks: JSON.parse(readFileSync(join(scoresDir, 'checks.json'), 'utf8')),
  };
}

const source = readFileSync(join(root, 'main.ts'), 'utf8');
const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
assert.deepEqual(imports.sort(), ['node:fs', 'node:path']);
assert(!/\b(?:Date|performance|fetch|eval|Function|WebSocket)\b|Math\.random|process\.(?:hrtime|uptime|cpuUsage)|\bimport\s*\(/.test(source));
assert.deepEqual([...source.matchAll(/process\.env\.([A-Z_]+)/g)].map(m => m[1]).sort(), ['MAKEFUN_INPUT_DIR', 'MAKEFUN_OUTPUT_DIR']);

const a = fresh('run-a'), b = fresh('run-b'), baselineDir = fresh('baseline');
const first = run(join(root, 'main.ts'), { MAKEFUN_INPUT_DIR: input, MAKEFUN_OUTPUT_DIR: a }, true);
const second = run(join(root, 'main.ts'), { MAKEFUN_INPUT_DIR: input, MAKEFUN_OUTPUT_DIR: b }, true);
const hashes = {};
for (const id of ids) {
  const bytes = readFileSync(join(a, id, 'solution.txt'));
  assert(bytes.equals(readFileSync(join(b, id, 'solution.txt'))), id + ' differs');
  assert(bytes.length <= 65536);
  hashes[id] = { sha256: sha(bytes), bytes: bytes.length };
}
const ours = score(a, 'scores-a');
const again = score(b, 'scores-b');
assert.deepEqual(ours, again);
assert.equal(ours.scores.passed, 1);
assert.equal(ours.scores.score, 1000000);
const baselineRun = run(join(kit, 'baselines/plain-astar/main.ts'), {
  MAKEFUN_INPUT_DIR: input, MAKEFUN_OUTPUT_DIR: baselineDir,
});
const baseline = score(baselineDir, 'scores-baseline');
assert(ours.scores.score > baseline.scores.score);
const syntheticRun = spawnSync(process.execPath, [join(checks, 'search-tests.mjs'), kit], {
  cwd: root, encoding: 'utf8', timeout: 60000,
});
assert.equal(syntheticRun.error, undefined);
assert.equal(syntheticRun.status, 0, syntheticRun.stderr);
const synthetic = JSON.parse(syntheticRun.stdout);

function size(dir, includeGit = false) {
  let bytes = 0, snapshot_bytes = 0, files = 0;
  for (const entry of readdirSync(dir).sort()) {
    if (!includeGit && entry === '.git') continue;
    const path = join(dir, entry), stat = lstatSync(path);
    if (stat.isDirectory()) {
      const child = size(path, includeGit);
      bytes += child.bytes; snapshot_bytes += child.snapshot_bytes; files += child.files;
    } else {
      const length = stat.isSymbolicLink() ? Buffer.byteLength(readlinkSync(path)) : stat.size;
      bytes += length; snapshot_bytes += length + Buffer.byteLength(relative(root, path)); files++;
    }
  }
  return { bytes, snapshot_bytes, files };
}

const results = {
  format: 'sokoban-verification/1', node: process.version,
  practice: ours, baseline, determinism: { byte_identical: true, outputs: hashes },
  synthetic,
  runs: { solver_first: first, solver_second: second, baseline: baselineRun },
  compliance: {
    standard_library_only: true, network_apis_absent: true, clock_reads_absent: true,
    random_reads_absent: true, environment_reads: ['MAKEFUN_INPUT_DIR', 'MAKEFUN_OUTPUT_DIR'],
    runtime_clock_and_network_guard_passed: true, per_run_timeout_ms: 60000,
    heap_limit_mib: 384, repository_limit_bytes: 1048576,
  },
  size: {},
  unconfirmed: [
    'Unreleased scored set and official Node 22 sandbox have not been tested.',
    'Weighted fallback is bounded and cannot guarantee completion of every possible room.',
    'The 60-second worst-case runtime and 512-MB total RSS limit are not certified by practice runs.',
  ],
};
function report() {
  const rows = ids.map(id => {
    const detail = ours.checks.find(c => c.key === id).detail;
    const base = baseline.checks.find(c => c.key === id);
    return `| ${id} | ${detail} | ${ours.scores[id] / 1000} | ${baseline.scores[id] / 1000} | ${base.detail} |`;
  }).join('\n');
  return `# Sokoban build report\n\nOriginal solver and verification harness written in this session. No baseline or other solver code was copied.\n\n## Design\n\nThe player’s initial row identifies the hallway. Removing it separates rooms; each room search includes its hallway door square. Reverse-push dead squares prevent boxes escaping into the hallway. A* minimizes pushes independently in each room. A subset assignment DP finds the exact minimum matching between boxes and goals using reverse-push distances, an admissible lower bound. Sorted box positions plus the smallest reachable player square form a transposition key. Lower-cost revisits reopen states. Ties use heuristic then insertion order.\n\nDeadlock checks reject unreachable goal assignments, static dead squares (including corners), and immovable box groups. The group test repeatedly removes boxes that could move with already removed boxes absent; any remaining off-goal box proves a deadlock. This also detects full 2×2 blocks.\n\nEach room gets 120,000 A* expansions, followed on exhaustion by fresh weighted searches (weight 2: 65,000; weight 5: 45,000). Each pass also stops at 450,000 generated nodes. Thus instance expansion allowances are proportional to the fixed room counts 1:1:2:3:4, at most 2,530,000 expansions for a whole set. The fallback favors low remaining push count while retaining alternatives. It remains bounded; exhaustion writes a valid empty answer. No general bounded solver can promise a completion in all cases. All practice rooms completed in the optimal first pass.\n\nPush sequences are stitched with BFS shortest walks in the full current board, including hallway walks between rooms. No reference data is read by main.ts.\n\n## Practice comparison\n\nMeasured with Node ${process.version}, using the kit’s unmodified scorer and runnable plain-astar 1.0.0 baseline. Instance points are on the 0–1,000 scale.\n\n| Instance | Solver replay | Solver points | Baseline points | Baseline replay |\n|---|---|---:|---:|---|\n${rows}\n\nTotal score: **${ours.scores.score} / 1,000,000**, versus baseline **${baseline.scores.score} / 1,000,000**. Both answered ${ours.scores.answered} instances in valid format. Solver times: ${first.elapsed_ms} ms and ${second.elapsed_ms} ms; baseline: ${baselineRun.elapsed_ms} ms. These are external harness measurements, never solver search inputs.\n\n## Verification\n\nTwo fresh output directories produced byte-identical solution files and identical scorer results. SHA-256 digests and byte lengths are in checks-v1/results.json. Both solver runs passed runtime guards that throw on clock, random, and network API use. Static inspection permits only node:fs and node:path imports and the two contractual directory environment overrides. No network requests were made. The solver reads only its input levels and writes output solutions.\n\nRepository working-tree file bytes: **${results.size.bytes ?? 0}**; conservative snapshot bytes including relative path lengths: **${results.size.snapshot_bytes ?? 0}**, across ${results.size.files ?? 0} files, excluding .git. All files are counted, with no starter exemptions. Limit: 1,048,576 bytes.\n\nReproduce: \`node checks-v1/verify.mjs /absolute/path/to/kit\`. The harness enforces a 60-second timeout per run and a 384-MiB V8 heap limit. It reads only this repository and the supplied kit.\n\n## Unconfirmed\n\n${results.unconfirmed.map(s => '- ' + s).join('\n')}\n\nNo submission, source bundle, or push was performed.\n`;
}
// Include the results/report themselves in the size, iterating to a stable count.
for (let pass = 0; pass < 10; pass++) {
  writeFileSync(join(checks, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  writeFileSync(join(root, 'sokoban-build-report.md'), report() + `\nAdditional correctness check: ${synthetic.cases} independently reverse-scrambled small rooms matched an exhaustive breadth first push oracle at the exact optimum. Forcing the optimal search budget to zero also solved all ${synthetic.cases} rooms through the weighted fallback.\n`);
  const current = size(root);
  if (JSON.stringify(current) === JSON.stringify(results.size)) break;
  results.size = current;
}
assert.deepEqual(size(root), results.size);
assert(results.size.snapshot_bytes < 1048576);
assert(size(root, true).bytes < 1048576, 'Repository including git metadata exceeds 1 MiB');
console.log(JSON.stringify({ score: ours.scores.score, baseline: baseline.scores.score, byte_identical: true, size: results.size }, null, 2));
