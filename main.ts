// Original competition solver. Each room is a separate push problem.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const letters = 'udlr';
const opposite = [1, 0, 3, 2];
const input = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

class Queue {
  items = [];
  before(a, b) { return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.serial < b.serial))); }
  add(n) {
    let i = this.items.length;
    this.items.push(n);
    while (i) {
      const p = (i - 1) >> 1;
      if (!this.before(n, this.items[p])) break;
      this.items[i] = this.items[p]; i = p;
    }
    this.items[i] = n;
  }
  take() {
    const root = this.items[0], last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.items.length && this.before(this.items[c + 1], this.items[c])) c++;
        if (!this.before(this.items[c], last)) break;
        this.items[i] = this.items[c]; i = c;
      }
      this.items[i] = last;
    }
    return root;
  }
}

function roomSearch(cells, initial, goalsGlobal, door, width, cap) {
  cells.sort((a, b) => a - b);
  const n = cells.length, local = new Map(cells.map((v, i) => [v, i]));
  const delta = [-width, width, -1, 1];
  const adj = cells.map(v => delta.map(d => local.get(v + d) ?? -1));
  const goals = goalsGlobal.map(v => local.get(v));
  const goalSet = new Set(goals);
  const start = initial.map(v => local.get(v)).sort((a, b) => a - b);
  // Reverse single-box pushes include the support square required by a real push.
  const distance = goals.map(g => {
    const dist = new Int16Array(n).fill(999);
    const todo = [g]; dist[g] = 0;
    for (let k = 0; k < todo.length; k++) {
      const q = todo[k];
      for (let d = 0; d < 4; d++) {
        const b = adj[q][d];
        if (b < 0 || adj[b][d] < 0 || dist[b] !== 999) continue;
        dist[b] = dist[q] + 1; todo.push(b);
      }
    }
    return dist;
  });
  const dead = cells.map((_, b) => distance.every(ds => ds[b] === 999));
  const pack = bs => bs.reduce((v, b) => v * n + b, 0);
  const estimates = new Map();
  function estimate(bs) {
    const code = pack(bs), cached = estimates.get(code);
    if (cached !== undefined) return cached;
    // Subset dynamic programming computes the exact minimum assignment (<=4 boxes).
    const dp = new Int16Array(1 << bs.length).fill(999); dp[0] = 0;
    for (let mask = 0; mask < dp.length; mask++) {
      let count = 0;
      for (let m = mask; m; m &= m - 1) count++;
      if (count === bs.length || dp[mask] === 999) continue;
      for (let j = 0; j < goals.length; j++) if (!(mask & (1 << j))) {
        const next = mask | (1 << j);
        dp[next] = Math.min(dp[next], dp[mask] + distance[j][bs[count]]);
      }
    }
    const h = dp[dp.length - 1]; estimates.set(code, h); return h;
  }
  const occupied = new Uint8Array(n), seen = new Int32Array(n), todo = new Int16Array(n);
  let stamp = 0;
  function flood(p, bs) {
    occupied.fill(0); for (const b of bs) occupied[b] = 1;
    stamp++; seen[p] = stamp; todo[0] = p;
    let size = 1, canonical = p;
    for (let k = 0; k < size; k++) {
      const q = todo[k]; canonical = Math.min(canonical, q);
      for (const v of adj[q]) if (v >= 0 && !occupied[v] && seen[v] !== stamp) {
        seen[v] = stamp; todo[size++] = v;
      }
    }
    return canonical;
  }
  function frozen(bs) {
    // Remove every box that could move if all removed boxes disappeared.
    // Any remaining group has no possible first push, even with arbitrary player access.
    let fixed = (1 << bs.length) - 1, changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < bs.length; i++) if (fixed & (1 << i)) {
        for (let d = 0; d < 4; d++) {
          const a = adj[bs[i]][d], b = adj[bs[i]][opposite[d]];
          if (a < 0 || b < 0) continue;
          let blocked = false;
          for (let j = 0; j < bs.length; j++) if ((fixed & (1 << j)) && (bs[j] === a || bs[j] === b)) blocked = true;
          if (!blocked) { fixed &= ~(1 << i); changed = true; break; }
        }
      }
    }
    return bs.some((b, i) => (fixed & (1 << i)) && !goalSet.has(b));
  }
  let serial = 0;
  function search(weight, limit) {
    const heap = new Queue(), best = new Map();
    const p = local.get(door), h = estimate(start);
    const key = pack(start) * n + flood(p, start);
    const root = { bs: start, p, g: 0, h, f: h * weight, key, parent: null, push: null, serial: serial++ };
    heap.add(root); best.set(key, 0);
    let expanded = 0, generated = 1;
    while (heap.items.length && expanded < limit && generated < 450000) {
      const s = heap.take();
      if (best.get(s.key) !== s.g) continue;
      if (s.h === 0) {
        const pushes = [];
        for (let t = s; t.parent; t = t.parent) pushes.push(t.push);
        return { pushes: pushes.reverse(), expanded, generated, weight };
      }
      expanded++;
      flood(s.p, s.bs);
      // Save the reachable mask: successor canonicalization reuses the flood scratch space.
      const reachable = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (seen[i] === stamp) reachable[i] = 1;
      const boxSet = new Set(s.bs);
      for (let i = 0; i < s.bs.length; i++) for (let d = 0; d < 4; d++) {
        const b = s.bs[i], dest = adj[b][d], support = adj[b][opposite[d]];
        if (dest < 0 || support < 0 || !reachable[support] || boxSet.has(dest) || dead[dest]) continue;
        const bs = s.bs.slice(); bs[i] = dest; bs.sort((a, b) => a - b);
        if (frozen(bs)) continue;
        const h = estimate(bs); if (h >= 999) continue;
        const key = pack(bs) * n + flood(b, bs), g = s.g + 1;
        if ((best.get(key) ?? Infinity) <= g) continue;
        best.set(key, g);
        heap.add({ bs, p: b, g, h, f: g + weight * h, key, parent: s, push: [cells[b], d], serial: serial++ });
        generated++;
      }
    }
    return null;
  }
  // Fixed per-room shares imply level shares 1:1:2:3:4. No timing-based decisions.
  // Fallback restarts retain all alternatives rather than committing to a greedy dead end.
  const result = search(1, cap) ?? search(2, 65000) ?? search(5, 45000);
  return result;
}

function solve(text) {
  const rows = text.replace(/\r/g, '').trimEnd().split('\n');
  const width = Math.max(...rows.map(r => r.length)), delta = [-width, width, -1, 1];
  const floor = new Set(), boxes = new Set(), goals = [];
  let player = -1;
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const v = y * width + x;
    if (' .$*@+'.includes(c)) floor.add(v);
    if ('$*'.includes(c)) boxes.add(v);
    if ('.*+'.includes(c)) goals.push(v);
    if ('@+'.includes(c)) player = v;
  }));
  const hallRow = Math.floor(player / width);
  const hall = new Set([...floor].filter(v => Math.floor(v / width) === hallRow));
  const unvisited = new Set([...floor].filter(v => !hall.has(v))), rooms = [];
  while (unvisited.size) {
    const first = unvisited.values().next().value, cells = [first]; unvisited.delete(first);
    for (let k = 0; k < cells.length; k++) for (const d of delta) {
      const v = cells[k] + d;
      if (unvisited.delete(v)) cells.push(v);
    }
    const initial = cells.filter(v => boxes.has(v));
    if (!initial.length) continue;
    const door = cells.flatMap(v => delta.map(d => v + d)).find(v => hall.has(v));
    rooms.push({ cells: [...cells, door], initial, goals: goals.filter(v => cells.includes(v)), door });
  }
  rooms.sort((a, b) => a.door - b.door || a.cells[0] - b.cells[0]);
  let moves = '';
  function walk(target) {
    const queue = [player], previous = new Map([[player, null]]);
    for (let k = 0; k < queue.length && !previous.has(target); k++) for (let d = 0; d < 4; d++) {
      const v = queue[k] + delta[d];
      if (!floor.has(v) || boxes.has(v) || previous.has(v)) continue;
      previous.set(v, [queue[k], d]); queue.push(v);
    }
    if (!previous.has(target)) throw new Error('Unreachable walking target');
    const path = [];
    for (let v = target; v !== player;) { const [p, d] = previous.get(v); path.push(letters[d]); v = p; }
    moves += path.reverse().join(''); player = target;
  }
  for (const room of rooms) {
    const result = roomSearch(room.cells, room.initial, room.goals, room.door, width, 120000);
    if (!result) { console.error('Room work budgets exhausted'); return ''; }
    walk(room.door);
    for (const [b, d] of result.pushes) {
      walk(b - delta[d]);
      moves += letters[d].toUpperCase(); boxes.delete(b); boxes.add(b + delta[d]); player = b;
    }
    console.error(JSON.stringify({ room: room.door, pushes: result.pushes.length, expanded: result.expanded, generated: result.generated, weight: result.weight }));
  }
  return moves;
}

for (const id of readdirSync(input).sort()) {
  const moves = solve(readFileSync(join(input, id, 'level.txt'), 'utf8'));
  if (moves.length + 1 > 65536) throw new Error('Solution exceeds output limit');
  mkdirSync(join(output, id), { recursive: true });
  writeFileSync(join(output, id, 'solution.txt'), moves + '\n');
}
