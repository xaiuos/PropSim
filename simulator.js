// ─── Monte Carlo simulation ──────────────────────────────────────────────────
// Pure Bernoulli model — each trade is an independent coin flip.
// Win: equity += risk * RR. Loss: equity -= risk.
// No fat tails, no stress, no autocorrelation, no gap risk.
// ddType: 'static' | 'eod' | 'intraday'

function monteCarlo(
  acct, pt, dd, wr, rr, riskPct, tpd, days, sims, unlimited,
  ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt
) {
  const cap      = unlimited ? 300000 : tpd * days;
  const upper    = acct * (1 + pt / 100);
  const ddDollar = (acct * dd) / 100;

  let passed = 0, busted = 0, timedOut = 0;

  for (let s = 0; s < sims; s++) {
    let eq    = acct;
    let lower = acct - ddDollar;
    let peak  = acct;
    let done  = false;

    for (let t = 0; t < cap; t++) {
      const dayStart = t % tpd === 0;
      if (dayStart && t > 0 && useDailyLimit) {
        // daily loss limit reset handled below
      }

      const win$  = fixedRisk ? fixedRiskAmt * rr  : (eq * riskPct / 100) * rr;
      const loss$ = fixedRisk ? fixedRiskAmt        :  eq * riskPct / 100;

      if (Math.random() < wr) {
        eq += win$;
      } else {
        eq -= loss$;
      }

      if (ddType === 'eod' && (t + 1) % tpd === 0 && eq > peak) {
        peak  = eq;
        lower = peak - ddDollar;
      } else if (ddType === 'intraday' && eq > peak) {
        peak  = eq;
        lower = peak - ddDollar;
      }

      if (eq >= upper) { passed++; done = true; break; }
      if (eq <= lower) { busted++;  done = true; break; }
    }

    if (!done) timedOut++;
  }

  return { passRate: passed/sims, bustRate: busted/sims, timeoutRate: timedOut/sims };
}

function collectPaths(
  acct, pt, dd, wr, rr, riskPct, tpd, days, unlimited,
  ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt,
  sims, maxSample
) {
  const cap      = unlimited ? Math.min(tpd * 60, 2000) : tpd * days;
  const upper    = acct * (1 + pt / 100);
  const ddDollar = (acct * dd) / 100;

  const passPaths = [], bustPaths = [], passFloors = [], bustFloors = [];

  for (let s = 0; s < sims; s++) {
    if (passPaths.length >= maxSample && bustPaths.length >= maxSample) break;

    let eq    = acct;
    let lower = acct - ddDollar;
    let peak  = acct;
    let done  = false;

    const path  = [acct];
    const floor = [lower];

    for (let t = 0; t < cap; t++) {
      const win$  = fixedRisk ? fixedRiskAmt * rr  : (eq * riskPct / 100) * rr;
      const loss$ = fixedRisk ? fixedRiskAmt        :  eq * riskPct / 100;

      if (Math.random() < wr) {
        eq += win$;
      } else {
        eq -= loss$;
      }

      if (ddType === 'eod' && (t + 1) % tpd === 0 && eq > peak) {
        peak  = eq;
        lower = peak - ddDollar;
      } else if (ddType === 'intraday' && eq > peak) {
        peak  = eq;
        lower = peak - ddDollar;
      }

      path.push(eq);
      floor.push(lower);

      if (eq >= upper) {
        if (passPaths.length < maxSample) { passPaths.push(path); passFloors.push(floor); }
        done = true; break;
      }
      if (eq <= lower) {
        if (bustPaths.length < maxSample) { bustPaths.push(path); bustFloors.push(floor); }
        done = true; break;
      }
    }
  }

  return { passPaths, bustPaths, passFloors, bustFloors };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function singlePathStats(path) {
  return { trades: path.length - 1, peak: Math.max(...path), final: path[path.length - 1] };
}

function streakChance(p, k, n) {
  if (k > n) return 0;
  if (k === 0) return 100;
  const q = 1 - p;
  const f = new Array(n + 1).fill(0);
  f[0] = 1;
  for (let i = 1; i <= n; i++) {
    f[i] = f[i - 1];
    if (i === k)    f[i] -= Math.pow(p, k);
    else if (i > k) f[i] -= Math.pow(p, k) * q * f[i - k - 1];
    if (f[i] < 0) f[i] = 0;
    if (f[i] > 1) f[i] = 1;
  }
  return parseFloat(((1 - f[n]) * 100).toFixed(1));
}

function fmtSigned(n) { return (n >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(n)).toLocaleString(); }
function fmtAbs(n)    { return '$' + Math.abs(Math.round(n)).toLocaleString(); }
function getDDType()        { return document.querySelector('#dd-type .seg-btn.active').dataset.val; }
function getRiskMode()      { return document.querySelector('#risk-mode .seg-btn.active').dataset.val; }
function getDaysUnlimited() { return !document.getElementById('days-toggle').checked; }
function getDailyLimit()    { return document.getElementById('daily-toggle').checked; }

let sizeChart = null, passPathChart = null, failPathChart = null, pathTimer = null, updateTimer = null, heavyTimer = null;

// ─── Main update ──────────────────────────────────────────────────────────────

function update() {
  const acct          = +document.getElementById('acct').value;
  const pt            = +document.getElementById('pt').value;
  const dd            = +document.getElementById('dd').value;
  const wr            = +document.getElementById('wr').value / 100;
  const rr            = +document.getElementById('rr').value;
  const risk          = +document.getElementById('risk').value / 100;
  const tpd           = +document.getElementById('tpd').value;
  const days          = +document.getElementById('days').value;
  const unlimited     = getDaysUnlimited();
  const ddType        = getDDType();
  const fixedRisk     = getRiskMode() === 'fixed';
  const fixedRiskAmt  = +document.getElementById('risk-fixed').value;
  const useDailyLimit = getDailyLimit();
  const dailyLimitAmt = +document.getElementById('daily-limit').value;
  const challengeFee  = +document.getElementById('challenge-fee').value;
  const lossDisplay = fixedRisk ? fixedRiskAmt : acct * risk;
  const winDisplay  = fixedRisk ? fixedRiskAmt * rr : acct * risk * rr;
  const evRealistic = wr * winDisplay - (1 - wr) * lossDisplay;
  const wrBreakeven  = 1 / (1 + rr);
  const target       = (acct * pt) / 100;
  const ddAmount     = (acct * dd) / 100;
  const loseRate     = 1 - wr;
  const kellyF       = wr - loseRate / rr;
  const kellyPct     = kellyF * 100;
  const halfKelly    = (kellyF / 2) * 100;
  const pf           = (wr * rr) / loseRate;

  document.getElementById('win-dollar').textContent  = '+$' + Math.round(winDisplay).toLocaleString();
  document.getElementById('loss-dollar').textContent = '-$' + Math.round(lossDisplay).toLocaleString();
  document.getElementById('win-sub').textContent     = fixedRisk
    ? 'fixed amount — does not compound'
    : (risk * rr * 100).toFixed(3) + '% of account per win';
  document.getElementById('loss-sub').textContent    = fixedRisk
    ? 'fixed amount — does not compound'
    : (risk * 100).toFixed(3) + '% of account per loss';
  document.getElementById('win-tag').textContent     = 'wins to pass: '   + Math.ceil(target / winDisplay);
  document.getElementById('loss-tag').textContent    = 'losses to bust: ' + Math.floor(ddAmount / lossDisplay);

  const evEl = document.getElementById('ev-val');
  evEl.textContent = fmtSigned(evRealistic);
  evEl.className   = 'mval ' + (evRealistic >= 0 ? 'color-green' : 'color-red');

  document.getElementById('target-dollar').textContent = fmtAbs(target);
  document.getElementById('target-trades').textContent  = Math.ceil(target / winDisplay) + ' wins (best case)';
  document.getElementById('dd-dollar').textContent      = fmtAbs(ddAmount);
  if (ddType === 'eod') {
    document.getElementById('dd-trades').textContent = 'trailing — floor rises each EOD';
  } else if (ddType === 'intraday') {
    document.getElementById('dd-trades').textContent = 'trailing — floor rises on every new peak';
  } else {
    document.getElementById('dd-trades').textContent = Math.floor(ddAmount / lossDisplay) + ' losses max';
  }

  const riskPctForMC = fixedRisk ? (fixedRiskAmt / acct) * 100 : risk * 100;
  const res = monteCarlo(
    acct, pt, dd, wr, rr, riskPctForMC, tpd, days, 3000, unlimited,
    ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt);

  const passEl = document.getElementById('pass-pct');
  passEl.textContent = (res.passRate * 100).toFixed(1) + '%';
  passEl.className   = 'mval ' + (res.passRate > 0.4 ? 'color-green' : res.passRate > 0.2 ? 'color-amber' : 'color-red');

  const msubParts = [];
  if (unlimited)           msubParts.push('no day limit');
  if (ddType !== 'static') msubParts.push(ddType + ' trailing');
  if (fixedRisk)           msubParts.push('fixed $');
  if (useDailyLimit)       msubParts.push('daily limit');
  document.getElementById('pass-msub').textContent = msubParts.length ? msubParts.join(' · ') : '3000 MC paths';

  document.getElementById('pass-bar-label').textContent = (res.passRate    * 100).toFixed(1) + '%';
  document.getElementById('bust-bar-label').textContent = (res.bustRate    * 100).toFixed(1) + '%';
  document.getElementById('time-bar-label').textContent = (res.timeoutRate * 100).toFixed(1) + '%';
  document.getElementById('pass-bar').style.width = Math.min(res.passRate    * 100, 100) + '%';
  document.getElementById('bust-bar').style.width = Math.min(res.bustRate    * 100, 100) + '%';
  document.getElementById('time-bar').style.width = Math.min(res.timeoutRate * 100, 100) + '%';
  document.getElementById('timeout-row').style.opacity = unlimited ? '0.3' : '1';

  const streakN = unlimited ? tpd * 60 : tpd * days;
  document.getElementById('streak-note').textContent = unlimited
    ? 'No day limit — streak probability over 60-day equivalent (' + (tpd * 60) + ' trades).'
    : 'Over ' + (tpd * days) + ' trades (' + tpd + '/day × ' + days + ' days).';

  const streaks = [
    { label: '3 wins in a row',              wins: 3, losses: 0, p: wr,       k: 3 },
    { label: '5 wins in a row',              wins: 5, losses: 0, p: wr,       k: 5 },
    { label: '3 losses in a row',            wins: 0, losses: 3, p: loseRate, k: 3 },
    { label: '5 losses in a row',            wins: 0, losses: 5, p: loseRate, k: 5 },
    { label: '7 losses in a row',            wins: 0, losses: 7, p: loseRate, k: 7 },
    { label: 'Avg day (' + tpd + ' trades)', wins: Math.round(tpd * wr), losses: tpd - Math.round(tpd * wr), p: null, k: null },
  ];

  const sg = document.getElementById('streak-grid');
  sg.innerHTML = '';
  streaks.forEach(s => {
    const net      = s.wins * winDisplay - s.losses * lossDisplay;
    const pct      = ((net / acct) * 100).toFixed(3);
    const pnlColor = net >= 0 ? '#6ee7b7' : '#fca5a5';
    const probPct  = s.p !== null ? streakChance(s.p, s.k, streakN) : null;
    let probClass  = 'prob-low';
    if (probPct !== null) { if (probPct >= 70) probClass = 'prob-high'; else if (probPct >= 30) probClass = 'prob-med'; }
    const div = document.createElement('div');
    div.className = 'streak-box';
    div.innerHTML =
      '<div class="streak-title">' + s.label + '</div>' +
      '<div class="streak-pnl" style="color:' + pnlColor + ';">' + fmtSigned(net) + '</div>' +
      '<div class="streak-acct">' + pct + '% of account</div>' +
      (probPct !== null
        ? '<div class="streak-prob-row"><span class="streak-prob-label">chance at least once</span><span class="streak-prob-val ' + probClass + '">' + probPct + '%</span></div>'
        : '<div class="streak-prob-row"><span class="streak-prob-label">expected avg day outcome</span></div>');
    sg.appendChild(div);
  });

  const al = document.getElementById('alert-area');
  al.innerHTML = '';
  const maxLosses = Math.floor(ddAmount / lossDisplay);
  const prob5loss = streakChance(loseRate, 5, streakN);
  if (ddType === 'static' && maxLosses <= 3) {
    al.innerHTML = '<div class="alert-box alert-warn">Only ' + maxLosses + ' losses before bust. A 5-loss streak has ' + prob5loss + '% chance — gap risk can make individual losses 2–4× larger.</div>';
  } else if (evRealistic < 0) {
    al.innerHTML = '<div class="alert-box alert-warn">Negative realistic EV ' + fmtSigned(evRealistic) + '/trade. Breakeven WR for RR ' + rr.toFixed(3) + ' is ' + (wrBreakeven * 100).toFixed(2) + '%. Current: ' + (wr * 100).toFixed(3) + '%.</div>';
  } else if (res.passRate > 0.44) {
    al.innerHTML = '<div class="alert-box alert-info">Pass rate above 44% — well above the 12.4% Topstep 2024 industry average.</div>';
  }

  // Economics
  const kellyEl = document.getElementById('kelly-val');
  if (kellyF <= 0) {
    kellyEl.textContent = 'N/A'; kellyEl.className = 'mval color-red';
    document.getElementById('kelly-sub').textContent = 'negative EV — Kelly says do not trade';
  } else {
    kellyEl.textContent = kellyPct.toFixed(2) + '%'; kellyEl.className = 'mval color-purple';
    document.getElementById('kelly-sub').textContent = 'half-Kelly: ' + halfKelly.toFixed(2) + '%';
  }

  const pfEl = document.getElementById('pf-val');
  pfEl.textContent = pf.toFixed(3);
  if (pf >= 2.0)      { pfEl.className = 'mval color-green';  document.getElementById('pf-sub').textContent = 'excellent (≥ 2.0)'; }
  else if (pf >= 1.5) { pfEl.className = 'mval color-green';  document.getElementById('pf-sub').textContent = 'good (1.5–2.0)'; }
  else if (pf >= 1.0) { pfEl.className = 'mval color-amber';  document.getElementById('pf-sub').textContent = 'marginal (1.0–1.5)'; }
  else                { pfEl.className = 'mval color-red';    document.getElementById('pf-sub').textContent = 'losing strategy (< 1.0)'; }

  const attEl = document.getElementById('attempts-val');
  if (res.passRate > 0) {
    attEl.textContent = (1 / res.passRate).toFixed(1) + 'x'; attEl.className = 'mval color-amber';
    document.getElementById('attempts-sub').textContent = 'expected cost: ' + fmtAbs((1 / res.passRate) * challengeFee);
  } else {
    attEl.textContent = '∞'; attEl.className = 'mval color-red';
    document.getElementById('attempts-sub').textContent = 'pass rate is 0%';
  }

  const sweepRisks = [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.2,1.4,1.6,1.8,2.0,2.5,3.0,4.0,5.0];
  let bestRate = -1, bestRisk = 0;
  sweepRisks.forEach(r => {
    const sr = monteCarlo(acct, pt, dd, wr, rr, r, tpd, days, 300, unlimited, ddType, fixedRisk, (acct*r)/100, useDailyLimit, dailyLimitAmt);
    if (sr.passRate > bestRate) { bestRate = sr.passRate; bestRisk = r; }
  });

  const optEl = document.getElementById('optimal-risk-val');
  const currentRiskPct = fixedRisk ? (fixedRiskAmt / acct) * 100 : risk * 100;
  const diff = currentRiskPct - bestRisk;
  optEl.textContent = bestRisk.toFixed(1) + '%'; optEl.className = 'mval color-purple';
  if (Math.abs(diff) < 0.3) {
    document.getElementById('optimal-risk-sub').textContent = 'current risk is near optimal ✓';
  } else if (diff > 0) {
    document.getElementById('optimal-risk-sub').textContent = 'current ' + currentRiskPct.toFixed(1) + '% is ' + diff.toFixed(1) + '% too high';
  } else {
    document.getElementById('optimal-risk-sub').textContent = 'current ' + currentRiskPct.toFixed(1) + '% is ' + Math.abs(diff).toFixed(1) + '% too low';
  }

  const ea = document.getElementById('economics-alert');
  ea.innerHTML = '';
  if (kellyF > 0) {
    const cr = currentRiskPct;
    if (cr > kellyPct * 1.5) {
      ea.innerHTML = '<div class="alert-box alert-warn">Current risk (' + cr.toFixed(2) + '%) is above Kelly (' + kellyPct.toFixed(2) + '%). Half-Kelly: ' + halfKelly.toFixed(2) + '%.</div>';
    } else if (cr >= halfKelly * 0.9 && cr <= halfKelly * 1.1) {
      ea.innerHTML = '<div class="alert-box alert-good">Current risk is near the half-Kelly optimal (' + halfKelly.toFixed(2) + '%). Recommended sizing for maximum risk-adjusted growth.</div>';
    }
  }

  // Funded economics runs fast (1500 sims) — fire immediately
  calculateFundedEconomics(res.passRate, challengeFee, wr, rr, riskPctForMC, tpd, ddType, fixedRisk, fixedRiskAmt);

  // Size chart (sweep) + path charts are heavier — debounce so slider drags feel instant
  clearTimeout(heavyTimer);
  heavyTimer = setTimeout(() => {
    updateSizeChart(acct, pt, dd, wr, rr, riskPctForMC, tpd, days, unlimited, ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt);
  }, 350);

  clearTimeout(pathTimer);
  pathTimer = setTimeout(() => {
    updatePathCharts(acct, pt, dd, wr, rr, riskPctForMC, tpd, days, unlimited, ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt);
  }, 600);
}

// ─── Funded phase ─────────────────────────────────────────────────────────────

function fundedMonteCarlo(
  fundedAcct, fundedTp, fundedDd, wr, rr, riskPct, tpd, sims,
  ddType, fixedRisk, fixedRiskAmt) {
  const upper    = fundedAcct * (1 + fundedTp / 100);
  const ddDollar = fundedAcct * fundedDd / 100;
  let paid = 0, busted = 0;

  for (let s = 0; s < sims; s++) {
    let eq = fundedAcct, lower = fundedAcct - ddDollar, peak = fundedAcct, t = 0;

    while (t < 200000) {
      const win$  = fixedRisk ? fixedRiskAmt * rr  : (eq * riskPct / 100) * rr;
      const loss$ = fixedRisk ? fixedRiskAmt        :  eq * riskPct / 100;

      if (Math.random() < wr) { eq += win$; } else { eq -= loss$; }
      t++;

      if (ddType === 'intraday' && eq > peak) { peak = eq; lower = peak - ddDollar; }
      if (ddType === 'eod' && t % tpd === 0 && eq > peak) { peak = eq; lower = peak - ddDollar; }

      if (eq >= upper) { paid++;   break; }
      if (eq <= lower) { busted++; break; }
    }
  }
  return { payoutRate: paid / sims, bustRate: busted / sims };
}

function calculateFundedEconomics(
  passRate, evalChallengeFee, wr, rr, riskPctForMC, tpd,
  ddType, fixedRisk, fixedRiskAmt) {
  const fundedAcct    = +document.getElementById('funded-acct').value;
  const activationFee = +document.getElementById('activation-fee').value;
  const payoutSplit   = +document.getElementById('payout-split').value / 100;
  const fundedTp      = +document.getElementById('funded-tp').value;
  const fundedDd      = +document.getElementById('funded-dd').value;

  const { payoutRate } = fundedMonteCarlo(fundedAcct, fundedTp, fundedDd, wr, rr, riskPctForMC, tpd, 1500, ddType, fixedRisk, fixedRiskAmt);

  const payoutAmt       = fundedAcct * (fundedTp / 100) * payoutSplit;
  const fullCycleP      = passRate * payoutRate;
  const grossPerAttempt = passRate * payoutRate * payoutAmt;
  const costPerAttempt  = evalChallengeFee + passRate * activationFee;
  const netEV           = grossPerAttempt - costPerAttempt;
  const avgCostToFund   = passRate > 0 ? (evalChallengeFee / passRate) + activationFee : Infinity;
  const avgAttempts     = passRate > 0 ? 1 / passRate : Infinity;

  const fpLabel = document.getElementById('funded-payout-bar-label');
  const fpBar   = document.getElementById('funded-payout-bar');
  if (fpLabel && fpBar) {
    fpLabel.textContent = (fullCycleP * 100).toFixed(1) + '%';
    fpBar.style.width   = Math.min(fullCycleP * 100, 100) + '%';
    document.getElementById('funded-payout-row').style.opacity = passRate > 0 ? '1' : '0.3';
  }

  document.getElementById('f-pass-eval').textContent = (passRate * 100).toFixed(1) + '%';
  document.getElementById('f-pass-eval').className   = 'mval ' + (passRate > 0.4 ? 'color-green' : passRate > 0.2 ? 'color-amber' : 'color-red');
  document.getElementById('f-payout-prob').textContent = (payoutRate * 100).toFixed(1) + '%';
  document.getElementById('f-full-prob').textContent   = (fullCycleP * 100).toFixed(1) + '%';
  document.getElementById('f-full-prob').className     = 'mval ' + (fullCycleP > 0.3 ? 'color-green' : fullCycleP > 0.1 ? 'color-purple' : 'color-red');
  document.getElementById('f-payout-amt').textContent     = '$' + Math.round(payoutAmt).toLocaleString();
  document.getElementById('f-payout-amt-sub').textContent = (payoutSplit * 100).toFixed(0) + '% of $' + Math.round(fundedAcct * fundedTp / 100).toLocaleString() + ' profit';
  document.getElementById('f-cost-to-fund').textContent = passRate > 0 ? '$' + Math.round(avgCostToFund).toLocaleString() : '∞';
  document.getElementById('f-cost-sub').textContent = passRate > 0 ? Math.ceil(avgAttempts) + ' avg attempts × $' + evalChallengeFee + (activationFee > 0 ? ' + $' + activationFee + ' activation' : '') : 'pass rate is 0%';
  document.getElementById('f-gross-payout').textContent = '$' + Math.round(grossPerAttempt).toLocaleString();

  const netEl = document.getElementById('f-net-profit');
  netEl.textContent = (netEV >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(netEV)).toLocaleString();
  netEl.className   = 'mval ' + (netEV >= 0 ? 'color-green' : 'color-red');

  const beEl = document.getElementById('f-breakeven');
  if (netEV > 0) { beEl.textContent = '1'; beEl.className = 'mval color-green'; document.getElementById('f-breakeven-sub').textContent = 'positive EV from attempt 1'; }
  else           { beEl.textContent = '∞'; beEl.className = 'mval ' + (netEV === 0 ? 'color-amber' : 'color-red'); document.getElementById('f-breakeven-sub').textContent = netEV === 0 ? 'zero EV' : 'negative EV — no breakeven'; }

  const fa = document.getElementById('funded-alert');
  fa.innerHTML = '';
  if (passRate === 0) {
    fa.innerHTML = '<div class="alert-box alert-warn">Pass rate is 0% — impossible to get funded.</div>';
  } else if (payoutRate < 0.1) {
    fa.innerHTML = '<div class="alert-box alert-warn">Funded payout probability very low (' + (payoutRate * 100).toFixed(1) + '%). Gap risk and stress tilt make funded DD too tight.</div>';
  } else if (netEV >= 0) {
    fa.innerHTML = '<div class="alert-box alert-good">+$' + Math.round(netEV).toLocaleString() + ' expected profit per attempt. Full cycle success: ' + (fullCycleP * 100).toFixed(1) + '%.</div>';
  } else {
    fa.innerHTML = '<div class="alert-box alert-warn">-$' + Math.abs(Math.round(netEV)).toLocaleString() + ' expected per attempt. Raise WR, payout split, or lower fees to turn positive.</div>';
  }
}

// ─── Path charts ──────────────────────────────────────────────────────────────

let storedPassPaths = [], storedBustPaths = [], storedPassFloors = [], storedBustFloors = [];
let storedUpper = 0, storedFloor0 = 0;

function updatePathCharts(acct, pt, dd, wr, rr, riskPct, tpd, days, unlimited, ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt) {
  const { passPaths, bustPaths, passFloors, bustFloors } = collectPaths(acct, pt, dd, wr, rr, riskPct, tpd, days, unlimited, ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt, 1200, 300);
  storedPassPaths = passPaths; storedBustPaths = bustPaths;
  storedPassFloors = passFloors; storedBustFloors = bustFloors;
  storedUpper = acct * (1 + pt / 100);
  storedFloor0 = acct * (1 - dd / 100);
  document.getElementById('pass-path-meta').textContent = passPaths.length ? passPaths.length + ' passing accounts sampled — showing 1 random' : 'No passing accounts — pass rate may be very low';
  document.getElementById('fail-path-meta').textContent = bustPaths.length ? bustPaths.length + ' failing accounts sampled — showing 1 random' : 'No failing accounts — bust rate may be very low';
  document.getElementById('pass-reroll-btn').disabled = passPaths.length === 0;
  document.getElementById('fail-reroll-btn').disabled = bustPaths.length === 0;
  drawRandomPassPath();
  drawRandomBustPath();
}

function drawRandomPassPath() {
  if (!storedPassPaths.length) return;
  const idx = Math.floor(Math.random() * storedPassPaths.length);
  drawSinglePath('passPathChart', passPathChart, storedPassPaths[idx], storedPassFloors[idx], storedUpper, storedFloor0, '#6ee7b7', c => { passPathChart = c; });
  renderSinglePathStats('pass-path-stats', storedPassPaths[idx], storedUpper, '#6ee7b7');
}

function drawRandomBustPath() {
  if (!storedBustPaths.length) return;
  const idx = Math.floor(Math.random() * storedBustPaths.length);
  drawSinglePath('failPathChart', failPathChart, storedBustPaths[idx], storedBustFloors[idx], storedUpper, storedFloor0, '#fca5a5', c => { failPathChart = c; });
  renderSinglePathStats('fail-path-stats', storedBustPaths[idx], storedUpper, '#fca5a5');
}

function drawSinglePath(canvasId, existingChart, path, floorPath, upper, floor0, lineColor, onCreated) {
  if (existingChart) existingChart.destroy();
  if (!path || !path.length) { onCreated(null); return; }
  const n = path.length;
  const labels = Array.from({ length: n }, (_, i) => i);
  const chart = new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Equity',         data: path,                                                         borderColor: lineColor,                   backgroundColor: lineColor + '12', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0 },
        { label: 'Profit target',  data: Array(n).fill(Math.round(upper)),                            borderColor: 'rgba(110,231,183,0.5)',      borderWidth: 1.5, borderDash: [6,4], pointRadius: 0, fill: false },
        { label: 'Drawdown floor', data: floorPath && floorPath.length === n ? floorPath : Array(n).fill(Math.round(floor0)), borderColor: 'rgba(252,165,165,0.45)', borderWidth: 1.5, borderDash: [3,3], pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(15,12,41,0.92)', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, titleColor: 'rgba(255,255,255,0.6)', bodyColor: 'rgba(255,255,255,0.8)',
          callbacks: { title: items => 'Trade ' + items[0].label, label: item => ' ' + item.dataset.label + ': $' + Number(item.raw).toLocaleString() } },
      },
      scales: {
        y: { ticks: { callback: v => '$' + (v/1000).toFixed(1) + 'K', font:{size:11}, color:'rgba(255,255,255,0.35)' }, grid:{color:'rgba(255,255,255,0.05)'}, border:{color:'rgba(255,255,255,0.1)'} },
        x: { ticks: { callback: (v,i) => i % Math.max(1, Math.floor(n/8)) === 0 ? v : '', font:{size:11}, color:'rgba(255,255,255,0.35)' }, grid:{display:false}, border:{color:'rgba(255,255,255,0.1)'}, title:{display:true,text:'trade number',color:'rgba(255,255,255,0.25)',font:{size:11}} },
      },
    },
  });
  onCreated(chart);
}

function renderSinglePathStats(containerId, path, upper, color) {
  const el = document.getElementById(containerId);
  if (!path || !path.length) { el.innerHTML = ''; return; }
  const s = singlePathStats(path);
  const passed = path[path.length - 1] >= upper;
  el.innerHTML = [
    { label: 'Trades taken', val: s.trades },
    { label: 'Peak equity',  val: '$' + Math.round(s.peak).toLocaleString() },
    { label: passed ? 'Final equity (passed)' : 'Final equity (busted)', val: '$' + Math.round(s.final).toLocaleString() },
  ].map(it => '<div class="path-stat"><div class="ps-label">' + it.label + '</div><div class="ps-val" style="color:' + color + ';">' + it.val + '</div></div>').join('');
}

function updateSizeChart(acct, pt, dd, wr, rr, riskPct, tpd, days, unlimited, ddType, fixedRisk, fixedRiskAmt, useDailyLimit, dailyLimitAmt) {
  const riskPoints = [0.1,0.2,0.4,0.6,0.8,1.0,1.2,1.5,1.8,2.0,2.5,3.0,3.5,4.0,5.0];
  const passRates = [], bustRates = [], labels = [];
  riskPoints.forEach(r => {
    const res = monteCarlo(acct, pt, dd, wr, rr, r, tpd, days, 600, unlimited, ddType, fixedRisk, (acct*r)/100, useDailyLimit, dailyLimitAmt);
    passRates.push(parseFloat((res.passRate*100).toFixed(1)));
    bustRates.push(parseFloat((res.bustRate*100).toFixed(1)));
    labels.push(fixedRisk ? '$' + Math.round((acct*r)/100).toLocaleString() : r.toFixed(1) + '%');
  });
  document.getElementById('chart-title').textContent = fixedRisk ? 'Pass rate vs fixed risk amount' : 'Pass rate vs position size (% of account)';
  if (sizeChart) sizeChart.destroy();
  sizeChart = new Chart(document.getElementById('sizeChart'), {
    type: 'line',
    data: { labels, datasets: [
      { label:'Pass rate', data:passRates, borderColor:'#6ee7b7', backgroundColor:'rgba(110,231,183,0.08)', borderWidth:2, pointRadius:3, pointBackgroundColor:'#6ee7b7', fill:true },
      { label:'Bust rate', data:bustRates, borderColor:'#fca5a5', backgroundColor:'rgba(252,165,165,0.05)', borderWidth:2, pointRadius:3, pointBackgroundColor:'#fca5a5', fill:true, borderDash:[5,3] },
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{mode:'index',intersect:false,backgroundColor:'rgba(15,12,41,0.9)',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,titleColor:'rgba(255,255,255,0.7)',bodyColor:'rgba(255,255,255,0.6)'} },
      scales:{
        y:{min:0,max:100,ticks:{callback:v=>v+'%',font:{size:11},color:'rgba(255,255,255,0.35)'},grid:{color:'rgba(255,255,255,0.06)'},border:{color:'rgba(255,255,255,0.1)'}},
        x:{ticks:{font:{size:11},color:'rgba(255,255,255,0.35)',autoSkip:false,maxRotation:45},grid:{display:false},border:{color:'rgba(255,255,255,0.1)'}},
      },
    },
  });
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function setupSegCtrl(ctrlId, onChangeFn) {
  document.getElementById(ctrlId).querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.getElementById(ctrlId).querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      onChangeFn(this.dataset.val);
    });
  });
}

setupSegCtrl('dd-type', val => {
  const hints = {
    static:   'Floor fixed from starting balance — never moves',
    eod:      'Floor rises to (peak EOD equity − DD$) — ratchets up at end of each day',
    intraday: 'Floor rises after every trade that sets a new equity high — most aggressive',
  };
  document.getElementById('dd-type-hint').textContent = hints[val] || '';
  update();
});

setupSegCtrl('risk-mode', val => {
  document.getElementById('risk-mode-hint').textContent = val === 'pct'
    ? 'Risk scales with current equity each trade'
    : 'Same dollar amount risked on every trade regardless of equity';
  document.getElementById('risk-pct-row').classList.toggle('hidden', val === 'fixed');
  document.getElementById('risk-fixed-row').classList.toggle('hidden', val === 'pct');
  update();
});

function setupToggle(checkboxId, rowId, statusId, onColor, offColor) {
  document.getElementById(checkboxId).addEventListener('change', function() {
    const on = this.checked;
    document.getElementById(rowId).classList.toggle('disabled', !on);
    const badge = document.getElementById(statusId);
    badge.textContent = on ? 'ON' : 'OFF';
    badge.className   = 'toggle-status ' + (on ? onColor : offColor);
    update();
  });
}

setupToggle('days-toggle',  'days-row',  'days-status',  'color-purple', 'color-red');
setupToggle('daily-toggle', 'daily-row', 'daily-status', 'color-purple', 'color-red');

function bindSlider(id, outId, fmt) {
  const slider = document.getElementById(id);
  const label  = document.getElementById(outId);
  slider.addEventListener('input', function() {
    label.textContent = fmt(this.value);
    clearTimeout(updateTimer);
    updateTimer = setTimeout(update, 80);
  });
  label.style.cursor = 'pointer';
  label.title = 'Click to type a value';
  label.addEventListener('click', function() {
    const min = parseFloat(slider.min), max = parseFloat(slider.max), step = parseFloat(slider.step) || 1;
    const input = document.createElement('input');
    input.type = 'text'; input.value = parseFloat(slider.value).toString();
    input.className = 'val-input'; input.style.width = label.offsetWidth + 'px';
    label.replaceWith(input); input.select();
    function commit() {
      let num = parseFloat(input.value);
      if (isNaN(num)) num = parseFloat(slider.value);
      num = Math.min(max, Math.max(min, num));
      const steps = Math.round((num - min) / step);
      num = Math.min(max, Math.max(min, parseFloat((min + steps * step).toFixed(10))));
      slider.value = num; label.textContent = fmt(num);
      input.replaceWith(label); update();
    }
    function cancel() { label.textContent = fmt(slider.value); input.replaceWith(label); }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
    input.addEventListener('blur', commit);
  });
}

document.getElementById('pass-reroll-btn').addEventListener('click', drawRandomPassPath);
document.getElementById('fail-reroll-btn').addEventListener('click', drawRandomBustPath);

bindSlider('acct',             'acct-out',             v => '$' + Number(v).toLocaleString());
bindSlider('pt',               'pt-out',               v => v + '%');
bindSlider('dd',               'dd-out',               v => v + '%');
bindSlider('wr',               'wr-out',               v => parseFloat(v).toFixed(3) + '%');
bindSlider('rr',               'rr-out',               v => parseFloat(v).toFixed(3));
bindSlider('risk',             'risk-out',             v => parseFloat(v).toFixed(3) + '%');
bindSlider('risk-fixed',       'risk-fixed-out',       v => '$' + Number(v).toLocaleString());
bindSlider('tpd',              'tpd-out',              v => v);
bindSlider('days',             'days-out',             v => v);
bindSlider('daily-limit',      'daily-limit-out',      v => '$' + Number(v).toLocaleString());
bindSlider('challenge-fee',    'challenge-fee-out',    v => '$' + Number(v).toLocaleString());
bindSlider('funded-acct',      'funded-acct-out',      v => '$' + Number(v).toLocaleString());
bindSlider('activation-fee',   'activation-fee-out',   v => '$' + Number(v).toLocaleString());
bindSlider('payout-split',     'payout-split-out',     v => v + '%');
bindSlider('funded-tp',        'funded-tp-out',        v => parseFloat(v).toFixed(1) + '%');
bindSlider('funded-dd',        'funded-dd-out',        v => parseFloat(v).toFixed(1) + '%');


update();
