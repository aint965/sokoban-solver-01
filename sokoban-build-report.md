# Sokoban build report

Original solver and verification harness written in this session. No baseline or other solver code was copied.

## Design

The player’s initial row identifies the hallway. Removing it separates rooms; each room search includes its hallway door square. Reverse-push dead squares prevent boxes escaping into the hallway. A* minimizes pushes independently in each room. A subset assignment DP finds the exact minimum matching between boxes and goals using reverse-push distances, an admissible lower bound. Sorted box positions plus the smallest reachable player square form a transposition key. Lower-cost revisits reopen states. Ties use heuristic then insertion order.

Deadlock checks reject unreachable goal assignments, static dead squares (including corners), and immovable box groups. The group test repeatedly removes boxes that could move with already removed boxes absent; any remaining off-goal box proves a deadlock. This also detects full 2×2 blocks.

Each room gets 120,000 A* expansions, followed on exhaustion by fresh weighted searches (weight 2: 65,000; weight 5: 45,000). Each pass also stops at 450,000 generated nodes. Thus instance expansion allowances are proportional to the fixed room counts 1:1:2:3:4, at most 2,530,000 expansions for a whole set. The fallback favors low remaining push count while retaining alternatives. It remains bounded; exhaustion writes a valid empty answer. No general bounded solver can promise a completion in all cases. All practice rooms completed in the optimal first pass.

Push sequences are stitched with BFS shortest walks in the full current board, including hallway walks between rooms. No reference data is read by main.ts.

## Practice comparison

Measured with Node v24.22.1, using the kit’s unmodified scorer and runnable plain-astar 1.0.0 baseline. Instance points are on the 0–1,000 scale.

| Instance | Solver replay | Solver points | Baseline points | Baseline replay |
|---|---|---:|---:|---|
| i001 | solved in 13 pushes (P* 13) | 1000 | 1000 | solved in 13 pushes (P* 13) |
| i002 | solved in 16 pushes (P* 16) | 1000 | 0 | the replay ends with a box off its goal, after 0 moves and 0 pushes |
| i003 | solved in 29 pushes (P* 29) | 1000 | 0 | the replay ends with a box off its goal, after 0 moves and 0 pushes |
| i004 | solved in 47 pushes (P* 47) | 1000 | 0 | the replay ends with a box off its goal, after 0 moves and 0 pushes |
| i005 | solved in 60 pushes (P* 60) | 1000 | 0 | the replay ends with a box off its goal, after 0 moves and 0 pushes |

Total score: **1000000 / 1,000,000**, versus baseline **200000 / 1,000,000**. Both answered 5 instances in valid format. Solver times: 172.544 ms and 204.255 ms; baseline: 5510.213 ms. These are external harness measurements, never solver search inputs.

## Verification

Two fresh output directories produced byte-identical solution files and identical scorer results. SHA-256 digests and byte lengths are in checks-v1/results.json. Both solver runs passed runtime guards that throw on clock, random, and network API use. Static inspection permits only node:fs and node:path imports and the two contractual directory environment overrides. No network requests were made. The solver reads only its input levels and writes output solutions.

Repository working-tree file bytes: **56931**; conservative snapshot bytes including relative path lengths: **60196**, across 85 files, excluding .git. All files are counted, with no starter exemptions. Limit: 1,048,576 bytes.

Reproduce: `node checks-v1/verify.mjs /absolute/path/to/kit`. The harness enforces a 60-second timeout per run and a 384-MiB V8 heap limit. It reads only this repository and the supplied kit.

## Unconfirmed

- Unreleased scored set and official Node 22 sandbox have not been tested.
- Weighted fallback is bounded and cannot guarantee completion of every possible room.
- The 60-second worst-case runtime and 512-MB total RSS limit are not certified by practice runs.

No submission, source bundle, or push was performed.

Additional correctness check: 16 independently reverse-scrambled small rooms matched an exhaustive breadth first push oracle at the exact optimum. Forcing the optimal search budget to zero also solved all 16 rooms through the weighted fallback.
