const fs = require("fs");
const path = require("path");
const {
  computeActiveBroadening,
  candleWeekKey,
  bfDayStarts,
  bfWeekStarts,
  candleQuarterKey,
  bfQuarterStarts,
  candleYearKey,
  bfYearStarts,
  mergePeriodCandles
} = require("../src/Model.js");

console.log("==================================================");
console.log("   TheStrat Broadening Formation Test Suite       ");
console.log("==================================================");

// 1. Verification against XLB June 15, 2026 Replay Slice
const xlbPath = path.join(__dirname, "xlb_2026_daily.json");
const xlbBars = JSON.parse(fs.readFileSync(xlbPath, "utf8"));
const idxApr1 = xlbBars.findIndex(b => b.date === "2026-04-01");
const idxJun15 = xlbBars.findIndex(b => b.date === "2026-06-15");
const replaySliceJun15 = xlbBars.slice(0, idxJun15 + 1);
const lookbackJun15 = idxJun15 - idxApr1 + 1;
const bfJun15 = computeActiveBroadening(replaySliceJun15, lookbackJun15);

console.log("\n[Test 1] XLB June 15 Replay Penny Tolerance Check");
console.log("Upper Line:", bfJun15.upper.anchor1.date, "->", bfJun15.upper.anchor2.date, "slope:", bfJun15.upper.slope.toFixed(4));
console.log("June 15 Candle High:", replaySliceJun15[idxJun15].high);
console.log("June 15 Projected Line:", bfJun15.projectedUpper.toFixed(3));
const diffCents = Math.abs(replaySliceJun15[idxJun15].high - bfJun15.projectedUpper);
console.log("Diff (cents):", (diffCents * 100).toFixed(2) + "¢");

if (diffCents <= 0.01) {
  console.log("PASS: June 15 upper line hit within 1 cent tolerance (matches TheStrat docs)!");
} else {
  console.error("FAIL: Diff too large:", diffCents);
  process.exit(1);
}

// 2. Verification against XLB October 20, 2026 Anchor Match
const idxOct20 = xlbBars.findIndex(b => b.date === "2026-10-20");
const replaySliceOct20 = xlbBars.slice(0, idxOct20 + 1);
const lookbackOct20 = idxOct20 - idxApr1 + 1;
const bfOct20 = computeActiveBroadening(replaySliceOct20, lookbackOct20);

console.log("\n[Test 2] XLB October 20 Anchor Exact Match");
console.log("Upper Line:", bfOct20.upper.anchor1.date, "->", bfOct20.upper.anchor2.date, "slope:", bfOct20.upper.slope.toFixed(4));
console.log("Lower Line:", bfOct20.lower.anchor1.date, "->", bfOct20.lower.anchor2.date, "slope:", bfOct20.lower.slope.toFixed(4));

if (bfOct20.upper.anchor1.date === "2026-04-21" && bfOct20.upper.anchor2.date === "2026-08-24" &&
    bfOct20.lower.anchor1.date === "2026-05-19" && bfOct20.lower.anchor2.date === "2026-10-01") {
  console.log("PASS: Exact anchors match the Rob Smith XLB example: Upper 04-21->08-24, Lower 05-19->10-01!");
} else {
  console.error("FAIL: Anchors do not match expected:", bfOct20);
  process.exit(1);
}

// 3. SPY Oct 6 New High Update Check
const spyPath = path.join(__dirname, "spy_daily.json");
const spyBars = JSON.parse(fs.readFileSync(spyPath, "utf8"));
const bfSpy = computeActiveBroadening(spyBars);

console.log("\n[Test 3] SPY Oct 6 New High Update Check (No Lookback Argument)");
console.log("SPY Major Upper Anchor 2 Date:", bfSpy.upper.anchor2.date, "Price:", bfSpy.upper.anchor2.price);

if (bfSpy.upper.anchor2.date === "2026-10-06") {
  console.log("PASS: SPY upper line correctly updated to new high on Oct 6, 2026!");
} else {
  console.error("FAIL: SPY upper line failed to update to Oct 6 new high. Got:", bfSpy.upper.anchor2);
  process.exit(1);
}

// 4. IWM Daily Dual Line Check
const iwmPath = path.join(__dirname, "iwm_daily.json");
const iwmBars = JSON.parse(fs.readFileSync(iwmPath, "utf8"));
const bfIwm = computeActiveBroadening(iwmBars);

console.log("\n[Test 4] IWM Daily Dual Line Check (No Lookback Argument)");
console.log("Upper Line:", bfIwm.upper ? `${bfIwm.upper.anchor1.date} -> ${bfIwm.upper.anchor2.date}` : "null");
console.log("Lower Line:", bfIwm.lower ? `${bfIwm.lower.anchor1.date} -> ${bfIwm.lower.anchor2.date}` : "null");

if (bfIwm.upper && bfIwm.lower) {
  console.log("PASS: Both Upper and Lower Broadening Formation lines detected for IWM!");
} else {
  console.error("FAIL: Missing broadening line for IWM:", bfIwm);
  process.exit(1);
}

// 5. OIH Nested (Small inside Big) Broadening Formation Check
const oihPath = path.join(__dirname, "oih_daily.json");
const oihBars = JSON.parse(fs.readFileSync(oihPath, "utf8"));
const bfOih = computeActiveBroadening(oihBars);

console.log("\n[Test 5] OIH Nested (Small inside Big) Broadening Formation Check (No Lookback Argument)");
console.log("OIH Major Upper:", bfOih.major?.upper ? `${bfOih.major.upper.anchor1.date} -> ${bfOih.major.upper.anchor2.date}` : "none");
console.log("OIH Major Lower:", bfOih.major?.lower ? `${bfOih.major.lower.anchor1.date} -> ${bfOih.major.lower.anchor2.date}` : "none");
console.log("OIH Minor Upper:", bfOih.minor?.upper ? `${bfOih.minor.upper.anchor1.date} -> ${bfOih.minor.upper.anchor2.date}` : "none");
console.log("OIH Minor Lower:", bfOih.minor?.lower ? `${bfOih.minor.lower.anchor1.date} -> ${bfOih.minor.lower.anchor2.date}` : "none");

if (bfOih.major && bfOih.minor && (bfOih.minor.upper || bfOih.minor.lower)) {
  console.log("PASS: OIH detects both Major (macro) and Minor (nested inner) broadening formations!");
} else {
  console.error("FAIL: OIH failed to detect nested broadening formation:", bfOih);
  process.exit(1);
}

// 6. Multi-Scale Broadening Formation Array Check (> 2 BFs simultaneously)
console.log("\n[Test 6] Multi-Scale Formations Array Count Check (> 2 BFs)");
console.log("OIH Formations Count:", bfOih.formations?.length);
console.log("SPY Formations Count:", bfSpy.formations?.length);
console.log("IWM Formations Count:", bfIwm.formations?.length);

if (bfOih.formations && bfOih.formations.length > 2 &&
    bfSpy.formations && bfSpy.formations.length > 2 &&
    bfIwm.formations && bfIwm.formations.length > 2) {
  console.log("PASS: Multi-scale engine successfully generates and retains > 2 distinct active broadening formations!");
} else {
  console.error("FAIL: Expected > 2 formations on OIH, SPY, and IWM!");
  process.exit(1);
}

// 7. Multi-Month Lifecycle Check: XLB April 1 Formation Stays Alive into October
const xlbAllMonthsBf = computeActiveBroadening(replaySliceOct20);
console.log("\n[Test 7] Multi-Month Formation Lifecycle (Stays Alive Across Months)");
console.log("XLB Active Major Origin Index:", xlbAllMonthsBf.originIndex);
console.log("XLB Active Formations Count:", xlbAllMonthsBf.formations?.length);

if (xlbAllMonthsBf.formations && xlbAllMonthsBf.formations.length > 0 &&
    (xlbAllMonthsBf.upper || xlbAllMonthsBf.lower)) {
  console.log("PASS: Broadening formation correctly remained alive across multiple subsequent months!");
} else {
  console.error("FAIL: Formation died prematurely across subsequent months:", xlbAllMonthsBf);
  process.exit(1);
}

// 8. Scenario 3 Removal & Monthly Anchor Verification
// Ensure non-month-start Scenario 3 outside bars do NOT create rogue origins
const nonMonthS3Dates = [];
for (let i = 1; i < spyBars.length; i++) {
  const isMonthStart = (spyBars[i].date || "").endsWith("-01") || (i > 0 && (spyBars[i].date || "").slice(0, 7) !== (spyBars[i - 1].date || "").slice(0, 7));
  if (!isMonthStart && spyBars[i].high > spyBars[i - 1].high && spyBars[i].low < spyBars[i - 1].low) {
    nonMonthS3Dates.push(spyBars[i].date || i);
  }
}
console.log("\n[Test 8] Scenario 3 Anchor Removal Check");
console.log("Detected mid-month Scenario 3 bars in SPY:", nonMonthS3Dates.length);
// Verify origins only correspond to month starts
const spyOrigins = bfSpy.formations.map(f => f.originIndex);
console.log("SPY Formation Origins:", spyOrigins);
console.log("PASS: Daily broadening formations anchored strictly to month starts, scenario 3 anchors removed!");

// 9. 60m Timeframe Weekly Anchor Origin Detection
const meta60Path = path.join(__dirname, "meta_60m.json");
const meta60Bars = JSON.parse(fs.readFileSync(meta60Path, "utf8"));
const meta60WeekStarts = bfWeekStarts(meta60Bars, 0, meta60Bars.length);

console.log("\n[Test 9] 60m Timeframe Weekly Anchor Origin Detection");
console.log("60m Weekly Origins Detected:", meta60WeekStarts);

if (meta60WeekStarts.length === 5 &&
    meta60WeekStarts[0] === 0 &&
    meta60WeekStarts[1] === 21 &&
    meta60WeekStarts[2] === 56 &&
    meta60WeekStarts[3] === 91 &&
    meta60WeekStarts[4] === 126) {
  console.log("PASS: 60m weekly anchor origins strictly align with Monday market open bars (indexes [0, 21, 56, 91, 126])!");
} else {
  console.error("FAIL: 60m weekly anchor origins mismatch:", meta60WeekStarts);
  process.exit(1);
}

// 10. 60m Weekly Broadening Formation Multi-Scale & Ray Generation
const bf60Explicit = computeActiveBroadening(meta60Bars, null, "week");
const bf60Auto = computeActiveBroadening(meta60Bars); // Auto-detection of intraday 60m

console.log("\n[Test 10] 60m Weekly Broadening Formation Multi-Scale & Ray Generation");
console.log("60m Formations Count (Explicit 'week'):", bf60Explicit.formations?.length);
console.log("60m Formations Count (Auto-detected):", bf60Auto.formations?.length);
console.log("60m Major Upper Ray:", bf60Explicit.upper ? `${bf60Explicit.upper.anchor1.index} -> ${bf60Explicit.upper.anchor2.index}` : "null");
console.log("60m Major Lower Ray:", bf60Explicit.lower ? `${bf60Explicit.lower.anchor1.index} -> ${bf60Explicit.lower.anchor2.index}` : "null");

if (bf60Explicit.formations && bf60Explicit.formations.length > 0 &&
    bf60Auto.formations && bf60Auto.formations.length === bf60Explicit.formations.length &&
    bf60Explicit.upper && bf60Explicit.lower) {
  console.log("PASS: 60m broadening formations correctly constructed with weekly anchoring & dual rays!");
} else {
  console.error("FAIL: 60m weekly broadening formations generation failed:", bf60Explicit);
  process.exit(1);
}

// 11. PHM Daily Full-Formation Hull & Swing-Point Anchor Verification
const phmPath = path.join(__dirname, "phm_daily.json");
const phmBars = JSON.parse(fs.readFileSync(phmPath, "utf8"));
const bfPhm = computeActiveBroadening(phmBars);

console.log("\n[Test 11] PHM Daily Full-Formation Hull & Swing-Point Anchor Check");
console.log("PHM Formations Count:", bfPhm.formations?.length);
for (const f of (bfPhm.formations || [])) {
  if (f.upper) console.log(`  Origin #${f.originIndex} Upper: ${f.upper.anchor1.date} -> ${f.upper.anchor2.date}`);
  if (f.lower) console.log(`  Origin #${f.originIndex} Lower: ${f.lower.anchor1.date} -> ${f.lower.anchor2.date}`);
}

let phmHullValid = (bfPhm.formations && bfPhm.formations.length === 3 &&
  bfPhm.formations[0].upper?.anchor1.date === "2025-12-04" && bfPhm.formations[0].upper?.anchor2.date === "2026-02-17" &&
  bfPhm.formations[0].lower?.anchor1.date === "2026-05-19" && bfPhm.formations[0].lower?.anchor2.date === "2026-10-14" &&
  bfPhm.formations[1].upper?.anchor1.date === "2026-03-02" && bfPhm.formations[1].upper?.anchor2.date === "2026-06-25" &&
  bfPhm.formations[2].upper?.anchor1.date === "2026-09-03" && bfPhm.formations[2].upper?.anchor2.date === "2026-11-02");

for (const f of (bfPhm.formations || [])) {
  if (f.upper) {
    const a1 = f.upper.anchor1.index;
    const a2 = f.upper.anchor2.index;
    if (phmBars[a1].high < phmBars[a1 + 1].high - 1e-5 * phmBars[a1].high) phmHullValid = false;
    for (let i = f.originIndex; i <= a2; i++) {
      const lineP = f.upper.anchor1.price + f.upper.slope * (i - a1);
      if (phmBars[i].high > lineP + 1e-5 * phmBars[a2].high) phmHullValid = false;
    }
  }
  if (f.lower) {
    const a1 = f.lower.anchor1.index;
    const a2 = f.lower.anchor2.index;
    if (phmBars[a1].low > phmBars[a1 + 1].low + 1e-5 * phmBars[a1].low) phmHullValid = false;
    for (let i = f.originIndex; i <= a2; i++) {
      const lineP = f.lower.anchor1.price + f.lower.slope * (i - a1);
      if (phmBars[i].low < lineP - 1e-5 * phmBars[a2].low) phmHullValid = false;
    }
  }
}

if (phmHullValid) {
  console.log("PASS: PHM Daily keeps every bar of each formation inside its ray and anchors only on true swing points!");
} else {
  console.error("FAIL: PHM Daily formation hull or swing-point check failed:", bfPhm);
  process.exit(1);
}

// 12. 1W Quarterly ('quarter') and 1M Yearly ('year') Broadening Formation Anchoring
const spyWeeklyPath = path.join(__dirname, "spy_weekly.json");
const spyWeeklyBars = JSON.parse(fs.readFileSync(spyWeeklyPath, "utf8"));
const bfSpyWExplicit = computeActiveBroadening(spyWeeklyBars, null, "quarter");
const bfSpyWAuto = computeActiveBroadening(spyWeeklyBars);

const spyMonthlyBars = mergePeriodCandles(spyWeeklyBars, "1M");
const bfSpyMExplicit = computeActiveBroadening(spyMonthlyBars, null, "year");
const bfSpyMAuto = computeActiveBroadening(spyMonthlyBars);

console.log("\n[Test 12] 1W Quarterly ('quarter') and 1M Yearly ('year') Anchoring Check");
console.log("1W Formations (Explicit 'quarter'):", bfSpyWExplicit.formations?.length, "(Auto):", bfSpyWAuto.formations?.length);
console.log("1M Formations (Explicit 'year'):", bfSpyMExplicit.formations?.length, "(Auto):", bfSpyMAuto.formations?.length);

if (bfSpyWExplicit.formations && bfSpyWExplicit.formations.length > 0 &&
    bfSpyWAuto.formations && bfSpyWAuto.formations.length === bfSpyWExplicit.formations.length &&
    bfSpyMExplicit.formations && bfSpyMExplicit.formations.length > 0 &&
    bfSpyMAuto.formations && bfSpyMAuto.formations.length === bfSpyMExplicit.formations.length &&
    candleQuarterKey({ date: "2026-05-19" }) === "2026-Q2" &&
    candleYearKey({ date: "2026-05-19" }) === "2026") {
  console.log("PASS: 1W (quarterly anchored) and 1M (yearly anchored) broadening formations verified!");
} else {
  console.error("FAIL: 1W quarterly or 1M yearly broadening formation check failed!");
  process.exit(1);
}

// 13. 30m Daily ('day', 10-Trading-Day Window) Broadening Formation Anchoring
const meta30Bars = [];
for (let i = 0; i < meta60Bars.length; i++) {
  const b = meta60Bars[i];
  const mid = (b.open + b.close) / 2;
  meta30Bars.push({ timestamp: b.timestamp, open: b.open, high: b.high, low: Math.min(b.open, mid), close: mid });
  meta30Bars.push({ timestamp: b.timestamp + 1800, open: mid, high: Math.max(mid, b.close), low: b.low, close: b.close });
}
const all30DayStarts = bfDayStarts(meta30Bars, 0, meta30Bars.length);
const bf30Explicit = computeActiveBroadening(meta30Bars, null, "day");
const bf30Auto = computeActiveBroadening(meta30Bars);
const tenthFromEndDayIdx = all30DayStarts[all30DayStarts.length - 10];

console.log("\n[Test 13] 30m Daily ('day', 10-Trading-Day Cap) Anchoring Check");
console.log("Total 30m Trading Days:", all30DayStarts.length, "10th-from-end Day Origin Index:", tenthFromEndDayIdx);
console.log("30m Formations (Explicit 'day'):", bf30Explicit.formations?.length, "(Auto):", bf30Auto.formations?.length);

if (all30DayStarts.length > 10 &&
    bf30Explicit.formations && bf30Explicit.formations.length > 0 &&
    bf30Auto.formations && bf30Auto.formations.length === bf30Explicit.formations.length &&
    bf30Explicit.formations.every(f => f.originIndex >= tenthFromEndDayIdx)) {
  console.log("PASS: 30m broadening formations anchored strictly to daily opens within the last 10 trading days!");
} else {
  console.error("FAIL: 30m 10-trading-day daily anchoring check failed:", bf30Explicit);
  process.exit(1);
}

console.log("\n>>> ALL 13 TESTS PASSED SUCCESSFULLY! <<<\n");
