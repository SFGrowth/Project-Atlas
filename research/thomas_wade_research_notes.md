# Thomas Wade Price Action Methodology — Research Notes

## Sources Consulted

1. Thomas Wade YouTube channel: https://www.youtube.com/@ThomasWade/videos
2. Wade Trading Academy website: https://wadetradingacademy.com/
3. Thomas Wade Price Action Indicators user guide: https://thomaswadepriceactionindicators.com/blogs/noticias/user-guide-thomas-wade-price-action-strategy
4. Al Brooks 2nd Entry Setup explanation: https://trasignal.com/blog/learn/al-brooks-2nd-entry-setup/
5. Two-legged pullback to MA (M2B/M2S): https://www.tradingsetupsreview.com/two-legged-pullback-to-moving-average-m2b-m2s/
6. Reddit community discussions on Thomas Wade methodology

---

## Core Identity of Thomas Wade's Methodology

Thomas Wade teaches a **price action-based scalping/day trading approach** primarily for ES/MES/MNQ futures on 2-minute and 5-minute charts. His methodology is heavily influenced by Al Brooks' price action concepts but simplified and adapted for scalping.

**Key characteristics:**
- Pure price action — no complex indicators
- Primary reference: 21-bar EMA (some sources say 20 EMA)
- Instrument: ES/MES futures (also applicable to MNQ)
- Timeframe: 2-minute primary (also 5-minute)
- Philosophy: "The highest probability setups are 2nd entries, its variations and confirmation setups at key entry points"

---

## The 0-1-2 Entry Framework (Core of Thomas Wade's System)

The NinjaTrader indicator implementation reveals the core logic:

### Structure Labels
- **0**: Start of a leg (the origin point of a move)
- **1**: First entry attempt (first pullback entry signal)
- **2L / 2S**: Second entry long / Second entry short (the primary trade setup)

### The Second Entry Concept
The second entry is the **primary and highest-probability setup** in Thomas Wade's system.

**Why second entries work:**
1. Price makes a move (impulse leg)
2. Price pulls back — countertrend traders enter (first attempt)
3. First entry attempt either fails or produces only a small move
4. Price pulls back again (second leg of pullback)
5. Countertrend traders are now trapped
6. Second entry triggers — trapped traders exit, trend resumes with momentum

---

## The Two-Legged Pullback (M2B / M2S)

This is the foundational setup — derived from Al Brooks, adopted by Thomas Wade.

### Long Setup (M2B — Move to Buy)
1. Strong uptrend confirmed
2. Two-legged pullback down toward the 20/21 EMA
3. Entry: above the bar that tested the EMA (signal bar)
4. Stop: below the signal bar or below the pullback low
5. Target: prior high, measured move, or resistance

### Short Setup (M2S — Move to Sell)
1. Strong downtrend confirmed
2. Two-legged pullback up toward the 20/21 EMA
3. Entry: below the bar that tested the EMA (signal bar)
4. Stop: above the signal bar or above the pullback high
5. Target: prior low, measured move, or support

### Leg Counting Rule (Al Brooks definition)
- Any bar that trades **above** the prior bar starts a new leg **up**
- Any bar that trades **below** the prior bar starts a new leg **down**
- High 1 (H1): first time a bar trades above the prior bar during a pullback in a bull move
- High 2 (H2): second buy signal after pullback makes another leg down or sideways
- Low 1 (L1): first time a bar trades below the prior bar during a pullback in a bear move
- Low 2 (L2): second sell signal after pullback makes another leg up or sideways

---

## EMA Rules

- **Primary EMA**: 21-bar EMA (Thomas Wade) / 20-bar EMA (Al Brooks)
- **EMA side rule**: Only take long setups ABOVE the EMA; only take short setups BELOW the EMA
- **Counter-trend filter**: Setups on the wrong side of EMA are dimmed/filtered out
- **EMA proximity filter**: Best entries occur when price is NEAR the EMA (within 3-4 ticks for ES)
- **EMA separation**: If price is too far from EMA, the setup is lower quality

---

## Signal Bar Quality Rules

A valid signal bar for a second entry long should:
- Close near its HIGH (bullish close)
- Reject lower prices (small lower wick or none)
- Not be a doji (indecision)
- Not be a shooting star
- Be a clear bullish bar (green/up bar)

A valid signal bar for a second entry short should:
- Close near its LOW (bearish close)
- Reject higher prices (small upper wick or none)
- Not be a doji
- Not be a hammer/pin bar
- Be a clear bearish bar (red/down bar)

---

## Location Rules (Key Entry Points)

Thomas Wade emphasises trading at **key entry points**. These are:
- Near the 21 EMA
- Near prior swing highs/lows
- Near VWAP
- Near opening range high/low
- Near previous day high/low
- Near round numbers / major levels

**Avoid entries:**
- In the middle of a range
- Far from any reference level
- Into obvious resistance/support (reaction zones)

---

## Structure Rules (BOS / CHOCH)

From Thomas Wade's videos on market structure:

**Break of Structure (BOS):**
- Price closes above a prior swing high in a bullish context = bullish BOS
- Price closes below a prior swing low in a bearish context = bearish BOS
- BOS confirms trend continuation

**Change of Character (CHOCH):**
- In a downtrend: price closes above a prior swing high = potential reversal signal
- In an uptrend: price closes below a prior swing low = potential reversal signal
- CHOCH does NOT confirm trend — it signals possible trend change
- After CHOCH, wait for BOS to confirm new trend direction

**Practical use:**
- Trade in the direction of BOS
- After CHOCH, wait for pullback and second entry in new direction
- Do NOT trade against the established BOS structure

---

## Trend Qualification Rules

Before taking any trade, Thomas Wade requires trend qualification:

1. **EMA alignment**: Price should be on the correct side of the 21 EMA
2. **EMA slope**: EMA should be sloping in the trade direction
3. **Higher highs / Higher lows**: For longs, market should be making HH/HL structure
4. **Lower highs / Lower lows**: For shorts, market should be making LH/LL structure
5. **BOS confirmation**: A recent BOS in the trade direction strengthens the case

---

## Session Rules

- Primary session: NYSE regular hours (9:30 AM – 4:00 PM ET)
- Avoid major economic news releases
- Opening range (first 30 minutes) can be traded but requires extra caution
- Best setups often occur mid-morning after initial volatility settles

---

## Filters That Block Trades

From the NinjaTrader indicator implementation:
1. **Doji filter**: Block entries on doji candles (indecision)
2. **Shooting star filter**: Block entries on shooting star candles
3. **EMA side filter**: Block counter-trend entries
4. **EMA proximity filter**: Block entries too far from EMA
5. **Bar color filter**: Block long entries on red bars, short entries on green bars
6. **Max bar size filter**: Block entries on excessively large bars (>10 ticks for ES)

---

## Second Entry Variations

Beyond the standard two-legged pullback, Thomas Wade also identifies:

1. **Failed Breakout (FBO)**: Price breaks a level, fails, reverses — entry on the reversal
2. **Failed Second Entry**: When a second entry itself fails, the next setup in the opposite direction can be high probability
3. **Confirmation setup**: Additional confluence factors strengthen the second entry

---

## Discretionary Elements (Not Yet Systematised)

The following aspects of Thomas Wade's methodology are discretionary and require systematic interpretation for Atlas:

1. **Exact leg counting**: Traders report inconsistency in how Thomas Wade counts legs in live videos
2. **"Feel" for trend quality**: He often references market "feel" that is hard to codify
3. **News context**: He avoids news but doesn't specify exact time windows
4. **Partial profit taking**: He mentions taking partial profits but doesn't specify exact rules
5. **Multiple timeframe context**: He references higher timeframe context but doesn't specify exact rules

---

## Key Differences from Standard Price Action

Thomas Wade's approach differs from generic price action in these ways:
- **Explicit second entry focus**: He specifically waits for the second attempt, not the first
- **EMA as primary reference**: The 21 EMA is the anchor for all entries
- **Simplicity**: He deliberately avoids complex indicator stacking
- **Scalping orientation**: Targets are typically 1-3R scalp moves, not swing trades
- **Discretionary override**: He always retains discretionary control over signal quality

---

## Proposed Atlas Systematisation

For Atlas, the following components can be objectively measured:

| Component | Discretionary Version | Proposed Atlas Rule |
|---|---|---|
| Trend direction | "Feel" for trend | EMA alignment score (fast > slow, price > EMA) |
| BOS/CHOCH | Visual identification | Swing high/low break with close confirmation |
| Leg counting | Inconsistent visual | Bar-by-bar higher/lower than prior bar rule |
| Signal bar quality | "Looks strong" | Close position ratio (close near high/low), body size vs ATR |
| EMA proximity | "Near the EMA" | Distance from EMA in ATR units (< 0.5 ATR = near) |
| Location quality | "Key entry point" | Distance from VWAP, prior levels, opening range |
| Session filter | "NYSE hours" | 09:30–16:00 ET session filter |
| News filter | "Avoid news" | ±5 minute window around major economic releases |

---

## Research Conclusion

Thomas Wade's methodology is fundamentally sound and systematisable. The core edge is:

**Trend + Two-legged pullback + EMA proximity + Strong signal bar + Clean location = High probability second entry**

The discretionary elements (leg counting consistency, "feel") can be replaced with objective rules that are measurable and backtestable.

Atlas should not copy Thomas Wade's system — it should build a superior systematic version that:
1. Uses objective leg counting rules
2. Scores signal bar quality numerically
3. Scores location quality numerically
4. Combines scores into a confidence score
5. Applies Guardian risk controls before entry
6. Validates every rule statistically before production

---

## Next Step

Write `Atlas_Strategy_Research_Spec.md` based on these findings.
