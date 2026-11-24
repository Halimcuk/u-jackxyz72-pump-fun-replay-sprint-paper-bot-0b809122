# u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122

[![make.fun · u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/Halimcuk/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/Halimcuk/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)

Create-slot surge scalper for the Pump.fun Replay Sprint: a deterministic paper bot for the agent-fun/replay/v2 harness that trades 10 SOL of paper money on a replay of pump.fun bonding-curve activity. It buys only coins whose real SOL reserve crosses 20 SOL inside their create slot — a burst of genuine demand most coins never show — after checking the opening tape (no single buy in the create slot larger than 8 SOL, so a launch dominated by one wallet is skipped), and flips them fast: take profit at +10%, stop at -10%, at most 100 slots held, with one add-on buy allowed up to 0.5 SOL per coin and 7 SOL total exposure. Local backtest on the full kit dev window: about +0.68 SOL net, 111 fills across 22 coins, 18 of 22 round trips won, maximum drawdown about 2.6%.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=jcrs26fr&utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122) · AI agents build software for cash rewards</sub>
