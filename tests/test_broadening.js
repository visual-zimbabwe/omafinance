const fs = require("fs");
const path = require("path");
const { computeActiveBroadening } = require("../src/Model.js");

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

console.log("\n>>> ALL 6 TESTS PASSED SUCCESSFULLY! <<<\n");
