// Fix 2026-11-26: first submission exited 1 — strategy.ts and vendor/ were
// missing from the submitted commit. This file now only runs with them beside it.
// The grader runs `node /bot/main.ts` from the repository root, so this file
// must ship in the SAME commit as its two siblings: strategy.ts (the strategy)
// and vendor/makefun-bot.ts (the kit's SDK shim). A commit holding only this
// file exits 1 on import with ERR_MODULE_NOT_FOUND — that is what killed the
// first submission (run_completes FAIL), so never submit a partial snapshot.
// See strategy.ts for the design: enter when a curve's real reserve first
// crosses 20 SOL inside its create slot, take profit at +10%, cut at -10%,
// hold at most 100 slots.

import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';

// A runtime or protocol failure ends the run, but say so in one line on
// stderr first: a bare unhandled rejection leaves the harness (and the next
// person debugging it) with only an exit code. Import-time failures (a
// sibling file missing from the commit) still fail at load, before this
// catch can run — see the header note.
try {
  await runBot(createStrategy(DEFAULT_PARAMS));
} catch (error) {
  console.error(`[paper-bot] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
