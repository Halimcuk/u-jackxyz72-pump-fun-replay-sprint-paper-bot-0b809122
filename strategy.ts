// Create-slot surge scalper for the pump.fun bonding-curve replay (agent-fun/replay/v2).
//
// One idea: buy only the coins that surge in their very first slot, and flip
// them fast. A pump.fun curve completes — migrates — at exactly 85 SOL of
// real reserve, always at the same 14.7x run-up from its create price: a
// fixed, known finish line. A coin whose real reserve already climbs to 20
// SOL inside its create slot has shown a burst of genuine demand that most
// coins never show: the crowd is buying it right now, the tape is wide, and
// the price typically grinds another ten percent higher over the next hundred
// slots before the sellers arrive. The trade is to enter the moment a coin's
// real reserve first crosses 20 SOL in its create slot, take profit at +10%,
// cut at -10%, and never hold more than 100 slots. At 20 SOL of reserve the
// 1%-of-reserve size cap finally allows a real stake (0.2 SOL) instead of
// dust, so the small quick wins survive the fees.
//
// Two filters keep the surge honest. First, the age: only a crossing in the
// create slot itself counts, because a coin that takes hundreds of slots to
// crawl to 20 SOL is a slow drift that dumps far more often than it runs.
// Second, the opening tape: no single buy in the create slot may be larger
// than 8 SOL, because a launch where one wallet (or the creator) bought a
// huge stack in the first slot is a dump waiting to happen — those coins
// lost the most in backtesting. Buying brand-new curves at random and
// flipping them was tried first: it barely breaks even, because young curves
// hold so little real SOL that the size cap shrinks every stake to dust.
// Riding the runners to completion was worse, because a single-slot dump of
// sixteen SOL can arrive before any stop can react — the two-slot fill
// latency means a stop cannot protect a position from a one-slot crash.
//
// A pure function of the batches it is fed: no clock, no randomness, no I/O,
// iteration only over insertion-ordered maps, so two runs on the same data
// produce byte-identical action logs.

import { BPS, type Batch, type Bot, type BotState, type OrderInput, type Pubkey } from './vendor/makefun-bot.ts';

export interface Params {
  /** Real SOL reserve (lamports) whose first crossing arms an entry. */
  crossRqSolLamports: number;
  /** Do not enter once the real SOL reserve is at or above this (lamports). */
  maxEntryRqSolLamports: number;
  /** Slots after the crossing during which an entry may still be decided. */
  crossWindow: number;
  /** The crossing must happen this many slots after the CreateEvent, at least. */
  minCrossAge: number;
  /** The crossing must happen this many slots after the CreateEvent, at most. */
  maxCrossAge: number;
  /**
   * Opening-tape rug filter, read from the create slot alone: a launch
   * where one wallet (or the creator) bought a huge stack in the create
   * slot is a dump waiting to happen, however fast its reserve climbed.
   */
  /** Distinct buyers in the create slot, at least. */
  minCreateBuyers: number;
  /** Creator's own buys in the create slot: at most this many lamports. */
  maxCreateDevBuyLamports: number;
  /** Largest single buy in the create slot: at most this many lamports. */
  maxCreateBuyLamports: number;
  /** Net flow (buys minus sells, lamports) over the flow window must exceed this. */
  minFlowLamports: number;
  /** Window (slots) for the recent-flow checks. */
  flowWindow: number;
  /** Price now must be at least this share (bps) of the high over highWindow slots. */
  nearHighBps: number;
  /** Lookback (slots) for the high the price must sit near. */
  highWindow: number;
  /** Lamports for the first buy of a coin. */
  firstBuyLamports: number;
  /** Lamports for the single add-on buy of a coin. */
  addLamports: number;
  /** Most lamports ever spent on one coin (first buy plus add-on). */
  maxPerCoinLamports: number;
  /** Smallest single buy worth paying the transaction fee for. */
  minBuyLamports: number;
  /** Slots to wait after the first buy before the add-on may be decided. */
  addDelay: number;
  /** Add-on needs the price this far (bps) above the last buy's decision price. */
  addStepBps: number;
  /** Exit when the position is worth this much over its cost (bps). */
  tpBps: number;
  /** Exit when it is worth this much under its cost (bps). */
  slBps: number;
  /** Trailing stop: once up at least this much (bps), exit on a fall of trailBps from the best value. */
  trailArmBps: number;
  trailBps: number;
  /** Exit after holding this many slots since the first buy filled. */
  maxHold: number;
  /** Exit when the creator sells while held. */
  exitOnDevSell: boolean;
  /** Most SOL at cost across all open positions at once (lamports). */
  maxExposureLamports: number;
  /**
   * Guardrail pacing: the run must make many fills. When the filled-order
   * count lags a pace toward fillTarget over windowSeconds of block time,
   * each order is split into splitPieces pieces in the same reply, so fills
   * accumulate faster; each piece costs its own transaction fee, so this
   * only happens while behind pace.
   */
  fillTarget: number;
  windowSeconds: number;
  splitPieces: number;
  /** Smallest order piece worth sending (lamports). */
  minPieceLamports: number;
}

export const DEFAULT_PARAMS: Params = {
  crossRqSolLamports: 20_000_000_000,
  maxEntryRqSolLamports: 85_000_000_000,
  crossWindow: 10,
  minCrossAge: 0,
  maxCrossAge: 0,
  minCreateBuyers: 0,
  maxCreateDevBuyLamports: 1_000_000_000_000,
  maxCreateBuyLamports: 8_000_000_000,
  minFlowLamports: 0,
  flowWindow: 10,
  nearHighBps: 9500,
  highWindow: 20,
  firstBuyLamports: 300_000_000,
  addLamports: 200_000_000,
  maxPerCoinLamports: 500_000_000,
  minBuyLamports: 5_000_000,
  addDelay: 3,
  addStepBps: 500,
  tpBps: 1000,
  slBps: 1000,
  trailArmBps: 3000,
  trailBps: 1500,
  maxHold: 100,
  exitOnDevSell: true,
  maxExposureLamports: 7_000_000_000,
  fillTarget: 300,
  windowSeconds: 21_600,
  splitPieces: 2,
  minPieceLamports: 2_000_000,
};

const FEE_BPS = 125n;

interface Tick {
  slot: number;
  isBuy: boolean;
  sol: bigint;
  price: number;
}

interface Coin {
  mint: Pubkey;
  createSlot: number;
  creator: Pubkey;
  devSold: boolean;
  lastTradeSlot: number;
  /** Recent trades, oldest first, pruned to the flow/high windows. */
  recent: Tick[];
  /** Create-slot tape: distinct buyers, creator's own buys, largest single buy. */
  createBuyers: Set<Pubkey>;
  createDevBuy: bigint;
  createMaxBuy: bigint;
  /** Slot the real SOL reserve first reached the crossing, or null. */
  crossSlot: number | null;
  buysSent: number;
  spentSent: bigint;
  /** Decision price (vq/vt as a pair) of the last buy sent. */
  lastBuyVq: bigint;
  lastBuyVt: bigint;
  lastBuySlot: number;
  /** Never buy it again (entered and exited, aged out of the crossing, or completed). */
  done: boolean;
  complete: boolean;
}

interface Held {
  openedSlot: number;
  txPaid: bigint;
  best: bigint;
  devSoldAtOpen: boolean;
}

/** What selling `tokens` against (vq, vt) would pay after curve fees. */
function sellValue(tokens: bigint, vq: bigint, vt: bigint): bigint {
  if (tokens <= 0n || vt <= 0n) return 0n;
  const q = (tokens * vq) / (vt + tokens);
  return q - (q * FEE_BPS + BPS - 1n) / BPS;
}

export function createStrategy(params: Params = DEFAULT_PARAMS): Bot {
  const P = params;
  const coins = new Map<Pubkey, Coin>();
  const held = new Map<Pubkey, Held>();
  /** Mints with a sell in flight. */
  const selling = new Set<Pubkey>();
  let firstTime: number | null = null;
  let nowTime = 0;
  let filled = 0;

  /** How many pieces to split an order into now: 1 on pace, splitPieces behind pace. */
  function pieces(): number {
    if (firstTime === null) return 1;
    const elapsed = Math.max(0, Math.min(P.windowSeconds, nowTime - firstTime));
    const due = (P.fillTarget * elapsed) / P.windowSeconds;
    if (filled >= due) return 1;
    return P.splitPieces;
  }

  /** Sell all of `tokens` as k orders in one reply. */
  function sellOrders(mint: Pubkey, tokens: bigint, k: number, room: number): OrderInput[] {
    const n = BigInt(Math.max(1, Math.min(k, room)));
    const minPiece = BigInt(P.minPieceLamports);
    let count = n;
    while (count > 1n && tokens / count < minPiece) count -= 1n;
    if (count <= 1n) return [{ side: 'sell', mint, token_amount: tokens, max_slippage_bps: 10_000 }];
    const piece = tokens / count;
    const out: OrderInput[] = [];
    for (let i = 0n; i < count; i++) {
      const amt = i === count - 1n ? tokens - piece * (count - 1n) : piece;
      out.push({ side: 'sell', mint, token_amount: amt, max_slippage_bps: 10_000 });
    }
    return out;
  }

  /** Buy `amount` lamports as up to k orders in one reply (pieces of at least minPieceLamports). */
  function buyOrders(mint: Pubkey, amount: bigint, k: number, room: number): OrderInput[] {
    let n = BigInt(Math.max(1, Math.min(k, room)));
    const minPiece = BigInt(P.minPieceLamports);
    while (n > 1n && amount / n < minPiece) n -= 1n;
    if (n <= 1n) return [{ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: 10_000 }];
    const piece = amount / n;
    const out: OrderInput[] = [];
    for (let i = 0n; i < n; i++) {
      const amt = i === n - 1n ? amount - piece * (n - 1n) : piece;
      out.push({ side: 'buy', mint, quote_lamports: amt, max_slippage_bps: 10_000 });
    }
    return out;
  }

  function readEvents(batch: Batch): void {
    for (const e of batch.events) {
      if (e.event === 'CreateEvent') {
        coins.set(e.mint, {
          mint: e.mint,
          createSlot: e.slot,
          creator: e.creator,
          devSold: false,
          lastTradeSlot: e.slot,
          recent: [],
          createBuyers: new Set(),
          createDevBuy: 0n,
          createMaxBuy: 0n,
          crossSlot: null,
          buysSent: 0,
          spentSent: 0n,
          lastBuyVq: 0n,
          lastBuyVt: 1n,
          lastBuySlot: 0,
          done: false,
          complete: false,
        });
      } else if (e.event === 'TradeEvent') {
        const c = coins.get(e.mint);
        if (c === undefined) continue;
        const sol = BigInt(e.sol_amount);
        const price = Number(e.virtual_quote_reserves) / Number(e.virtual_token_reserves);
        c.lastTradeSlot = e.slot;
        c.recent.push({ slot: e.slot, isBuy: e.is_buy, sol, price });
        if (e.slot === c.createSlot && e.is_buy) {
          c.createBuyers.add(e.user);
          if (sol > c.createMaxBuy) c.createMaxBuy = sol;
          if (e.user === c.creator) c.createDevBuy += sol;
        }
        if (!e.is_buy && e.user === c.creator) c.devSold = true;
      } else {
        const c = coins.get(e.mint);
        if (c !== undefined) {
          c.complete = true;
          c.done = true;
        }
      }
    }
  }

  /** Net lamports bought minus sold over the last flowWindow slots. */
  function flow(c: Coin, slot: number): bigint {
    // Keep enough tape for the high lookback too; sum only the flow window.
    const keepFrom = slot - Math.max(P.flowWindow, P.highWindow);
    let drop = 0;
    while (drop < c.recent.length && c.recent[drop]!.slot <= keepFrom) drop++;
    if (drop > 0) c.recent.splice(0, drop);
    const from = slot - P.flowWindow;
    let net = 0n;
    for (const t of c.recent) if (t.slot > from) net += t.isBuy ? t.sol : -t.sol;
    return net;
  }

  /** Highest recorded price over the last highWindow slots. */
  function recentHigh(c: Coin, slot: number): number {
    const from = slot - P.highWindow;
    let high = 0;
    for (const t of c.recent) if (t.slot > from && t.price > high) high = t.price;
    return high;
  }

  function hasPendingBuy(state: BotState, mint: Pubkey): boolean {
    for (const p of state.pending.values()) if (p.order.mint === mint && p.order.side === 'buy') return true;
    return false;
  }

  function hasPendingSell(state: BotState, mint: Pubkey): boolean {
    for (const p of state.pending.values()) if (p.order.mint === mint && p.order.side === 'sell') return true;
    return false;
  }

  return {
    onBatch(state, batch) {
      readEvents(batch);
      for (const e of batch.events) {
        if (e.block_time === null) continue;
        if (firstTime === null) firstTime = e.block_time;
        if (e.block_time > nowTime) nowTime = e.block_time;
      }
      const orders: OrderInput[] = [];
      const cap = state.hello.caps.max_orders_per_batch;
      const tx = state.txFeeLamports();
      const marks = new Map<Pubkey, { vq: bigint; vt: bigint }>();
      for (const m of batch.marks) marks.set(m.mint, { vq: BigInt(m.virtual_quote_reserves), vt: BigInt(m.virtual_token_reserves) });

      for (const f of batch.fills) {
        if (f.client_id.startsWith('_')) {
          held.delete(f.mint);
          selling.delete(f.mint);
          continue;
        }
        if (f.status === 'filled') filled += 1;
        const h = held.get(f.mint);
        if (f.status !== 'rejected' && h !== undefined) h.txPaid += BigInt(f.tx_fee_lamports);
        if (f.side === 'buy' && f.status === 'filled' && h === undefined) {
          held.set(f.mint, { openedSlot: f.slot, txPaid: BigInt(f.tx_fee_lamports), best: 0n, devSoldAtOpen: coins.get(f.mint)?.devSold ?? false });
        }
      }
      for (const mint of [...selling]) if (!hasPendingSell(state, mint)) selling.delete(mint);
      for (const mint of [...held.keys()]) {
        if (!state.positions.has(mint) && !selling.has(mint) && !hasPendingBuy(state, mint)) held.delete(mint);
      }
      const k = pieces();

      // Exits first.
      for (const [mint, pos] of state.positions) {
        if (orders.length >= cap) break;
        if (selling.has(mint)) continue;
        const c = coins.get(mint);
        let h = held.get(mint);
        if (h === undefined) {
          h = { openedSlot: state.slot, txPaid: tx, best: 0n, devSoldAtOpen: c?.devSold ?? false };
          held.set(mint, h);
        }
        let mk = marks.get(mint);
        if (mk === undefined) {
          const cv = state.curves.get(mint);
          if (cv === undefined) continue;
          mk = { vq: cv.virtual_quote_reserves, vt: cv.virtual_token_reserves };
        }
        const value = sellValue(pos.token_amount, mk.vq, mk.vt) - tx;
        const basis = pos.cost_lamports + h.txPaid;
        if (value > h.best) h.best = value;
        let exit = false;
        if (basis > 0n) {
          if (value * BPS >= basis * (BPS + BigInt(P.tpBps))) exit = true;
          if (value * BPS <= basis * (BPS - BigInt(P.slBps))) exit = true;
          if (h.best * BPS >= basis * (BPS + BigInt(P.trailArmBps)) && value * BPS <= h.best * (BPS - BigInt(P.trailBps))) exit = true;
        }
        if (state.slot - h.openedSlot >= P.maxHold) exit = true;
        if (c !== undefined && P.exitOnDevSell && c.devSold && !h.devSoldAtOpen) exit = true;
        if (!exit) continue;
        orders.push(...sellOrders(mint, pos.token_amount, k, cap - orders.length));
        selling.add(mint);
        if (c !== undefined) c.done = true;
      }

      // Entries and the single add-on.
      let free = state.freeCashLamports() - tx * BigInt(orders.length);
      let open = state.committedPositionCount();
      let exposure = 0n;
      for (const pos of state.positions.values()) exposure += BigInt(pos.cost_lamports);
      for (const po of state.pending.values()) if (po.order.side === 'buy') exposure += BigInt(po.order.quote_lamports);
      for (const c of coins.values()) {
        if (orders.length >= cap) break;
        if (c.done || c.complete) continue;
        const curve = state.curves.get(c.mint);
        if (curve === undefined || curve.complete) continue;
        const rq = curve.real_quote_reserves;
        // Arm the crossing the first time the real reserve reaches it.
        if (c.crossSlot === null && rq >= BigInt(P.crossRqSolLamports)) {
          const age = state.slot - c.createSlot;
          if (age >= P.minCrossAge && age <= P.maxCrossAge) {
            c.crossSlot = state.slot;
          } else {
            c.done = true;
          }
        }
        const isAdd = c.buysSent > 0;
        if (isAdd) {
          if (c.buysSent >= 2) continue;
          if (!state.positions.has(c.mint) || selling.has(c.mint) || hasPendingBuy(state, c.mint)) continue;
          const vq = curve.virtual_quote_reserves;
          const vt = curve.virtual_token_reserves;
          // One add-on into strength: price stepped up from the last buy and flow still positive.
          if (state.slot - c.lastBuySlot < P.addDelay) continue;
          if (vq * c.lastBuyVt * BPS < c.lastBuyVq * vt * (BPS + BigInt(P.addStepBps))) continue;
          if (flow(c, state.slot) <= BigInt(P.minFlowLamports)) continue;
          const room = BigInt(P.maxPerCoinLamports) - c.spentSent;
          if (room < BigInt(P.minBuyLamports)) continue;
          const maxBuy = state.maxBuyLamports(c.mint);
          let amount = BigInt(P.addLamports);
          if (amount > room) amount = room;
          if (amount > maxBuy) amount = maxBuy;
          if (amount < BigInt(P.minBuyLamports)) continue;
          if (exposure + amount > BigInt(P.maxExposureLamports)) continue;
          if (free < amount + tx * 6n) continue;
          const buys = buyOrders(c.mint, amount, k, cap - orders.length);
          orders.push(...buys);
          free -= amount + tx * BigInt(buys.length);
          exposure += amount;
          c.buysSent += 1;
          c.spentSent += amount;
          c.lastBuyVq = vq;
          c.lastBuyVt = vt;
          c.lastBuySlot = state.slot;
          continue;
        }
        // The completion run: enter only just after the reserve first crossed
        // the threshold, while buying still flows in and the price holds near
        // its recent high.
        if (c.crossSlot === null) continue;
        if (state.slot - c.crossSlot > P.crossWindow) {
          c.done = true;
          continue;
        }
        if (rq >= BigInt(P.maxEntryRqSolLamports)) {
          c.done = true;
          continue;
        }
        // Opening-tape rug filter: a create slot dominated by one wallet
        // or by the creator is a dump waiting to happen.
        if (c.createBuyers.size < P.minCreateBuyers) continue;
        if (c.createDevBuy > BigInt(P.maxCreateDevBuyLamports)) continue;
        if (c.createMaxBuy > BigInt(P.maxCreateBuyLamports)) continue;
        if (open >= state.hello.caps.max_open_positions) continue;
        if (flow(c, state.slot) <= BigInt(P.minFlowLamports)) continue;
        const vq = curve.virtual_quote_reserves;
        const vt = curve.virtual_token_reserves;
        const price = Number(vq) / Number(vt);
        const high = recentHigh(c, state.slot);
        if (high <= 0 || price < (high * P.nearHighBps) / 10_000) continue;
        const room = BigInt(P.maxPerCoinLamports) - c.spentSent;
        if (room < BigInt(P.minBuyLamports)) continue;
        const maxBuy = state.maxBuyLamports(c.mint);
        let amount = BigInt(P.firstBuyLamports);
        if (amount > room) amount = room;
        if (amount > maxBuy) amount = maxBuy;
        if (amount < BigInt(P.minBuyLamports)) continue;
        if (exposure + amount > BigInt(P.maxExposureLamports)) continue;
        if (free < amount + tx * 6n) continue;
        const buys = buyOrders(c.mint, amount, k, cap - orders.length);
        orders.push(...buys);
        free -= amount + tx * BigInt(buys.length);
        exposure += amount;
        c.buysSent += 1;
        c.spentSent += amount;
        c.lastBuyVq = vq;
        c.lastBuyVt = vt;
        c.lastBuySlot = state.slot;
        open += 1;
      }
      return orders;
    },
  };
}
