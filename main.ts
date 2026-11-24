// Create-slot surge scalper for the pump.fun replay sprint (agent-fun/replay/v2).
// The grader runs `node /bot/main.ts`; the strategy lives in strategy.ts
// and the SDK shim is the kit's sdk/ts/makefun-bot.ts, vendored byte for
// byte. See strategy.ts for the design: enter when a curve's real reserve
// first crosses 20 SOL inside its create slot, take profit at +10%, cut
// at -10%, hold at most 100 slots.

import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';

await runBot(createStrategy(DEFAULT_PARAMS));
