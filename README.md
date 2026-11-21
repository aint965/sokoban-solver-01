[![Competition](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![Rank](https://make.fun/badge/sokoban-solver-01-run-20261121/aint965/sokoban-solver-01/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)
[![Reward](https://make.fun/badge/sokoban-solver-01-run-20261121/aint965/sokoban-solver-01/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

An original Sokoban solver for [make.fun’s Sokoban competition](https://make.fun/bounty/sokoban-solver-01-run-20261121). It separates the hallway’s rooms, finds push-optimal solutions with A*, and reconstructs shortest player walks between pushes. Exact minimum matching on reverse-push distances, dead squares, frozen groups, and player-region transpositions keep the search small. Deterministic weighted searches provide a completion fallback under fixed work limits.

Run with Node 22.18 or later:

```sh
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=/path/to/output node main.ts
```

Without overrides it reads `/input` and writes `/output`. It uses only Node’s standard library. Reproduce practice scoring and the baseline comparison with:

```sh
node checks-v1/verify.mjs /absolute/path/to/competition-kit
```

See [the build report](sokoban-build-report.md) and [verification results](checks-v1/results.json).
