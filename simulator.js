function monteCarlo(
  acct,
  pt,
  dd,
  wr,
  rr,
  riskPct,
  tpd,
  days,
  sims,
  unlimited,
  eodTrailing,
  fixedRisk,
  fixedRiskAmt,
  useDailyLimit,
  dailyLimitAmt
) {
  const cap = unlimited ? 100000 : tpd * days;
  const upper = acct * (1 + pt / 100);
  const ddDollar = (acct * dd) / 100;

  let passed = 0;
  let busted = 0;
  let timedOut = 0;

  for (let s = 0; s < sims; s++) {
    let eq = acct;
    let lower = acct - ddDollar;
    let eodPeak = acct;
    let dayLoss = 0;
    let done = false;

    for (let t = 0; t < cap; t++) {
      if (t % tpd === 0) dayLoss = 0;

      if (!(useDailyLimit && dayLoss >= dailyLimitAmt)) {
        const loss = fixedRisk ? fixedRiskAmt : (eq * riskPct) / 100;
        const win = fixedRisk ? fixedRiskAmt * rr : ((eq * riskPct) / 100) * rr;
        const isWin = Math.random() < wr;

        eq += isWin ? win : -loss;
        if (!isWin) dayLoss += loss;
      }

      if (eodTrailing && (t + 1) % tpd === 0 && eq > eodPeak) {
        eodPeak = eq;
        lower = eodPeak - ddDollar;
      }

      if (eq >= upper) {
        passed++;
        done = true;
        break;
      }
      if (eq <= lower) {
        busted++;
        done = true;
        break;
      }
    }

    if (!done) timedOut++;
  }

  return {
    passRate: passed / sims,
    bustRate: busted / sims,
    timeoutRate: timedOut / sims,
  };
}

function collectPaths(
  acct,
  pt,
  dd,
  wr,
  rr,
  riskPct,
  tpd,
  days,
  unlimited,
  eodTrailing,
  fixedRisk,
  fixedRiskAmt,
  useDailyLimit,
  dailyLimitAmt,
  sims,
  maxSample
) {
  const cap = unlimited ? Math.min(tpd * 60, 2000) : tpd * days;
  const upper = acct * (1 + pt / 100);
  const ddDollar = (acct * dd) / 100;

  const passPaths = [];
  const bustPaths = [];
  const passFloors = [];
  const bustFloors = [];

  for (let s = 0; s < sims; s++) {
    if (passPaths.length >= maxSample && bustPaths.length >= maxSample) break;

    let eq = acct;
    let lower = acct - ddDollar;
    let eodPeak = acct;
    let dayLoss = 0;
    let done = false;

    const path = [acct];
    const floor = [lower];

    for (let t = 0; t < cap; t++) {
      if (t % tpd === 0) dayLoss = 0;

      if (!(useDailyLimit && dayLoss >= dailyLimitAmt)) {
        const loss = fixedRisk ? fixedRiskAmt : (eq * riskPct) / 100;
        const win = fixedRisk ? fixedRiskAmt * rr : ((eq * riskPct) / 100) * rr;
        const isWin = Math.random() < wr;

        eq += isWin ? win : -loss;
        if (!isWin) dayLoss += loss;
      }

      if (eodTrailing && (t + 1) % tpd === 0 && eq > eodPeak) {
        eodPeak = eq;
        lower = eodPeak - ddDollar;
      }

      path.push(eq);
      floor.push(lower);

      if (eq >= upper) {
        if (passPaths.length < maxSample) {
          passPaths.push(path);
          passFloors.push(floor);
        }
        done = true;
        break;
      }

      if (eq <= lower) {
        if (bustPaths.length < maxSample) {
          bustPaths.push(path);
          bustFloors.push(floor);
        }
        done = true;
        break;
      }
    }
  }

  return { passPaths, bustPaths, passFloors, bustFloors };
}

function pathStats(paths) {
  if (!paths.length) return { count: 0, avg: 0, min: 0, max: 0 };

  const lengths = paths.map((p) => p.length - 1);

  return {
    count: paths.length,
    avg: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    min: Math.min(...lengths),
    max: Math.max(...lengths),
  };
}

function singlePathStats(path) {
  return {
    trades: path.length - 1,
    peak: Math.max(...path),
    final: path[path.length - 1],
  };
}

function streakChance(p, k, n) {
  if (k > n) return 0;
  if (k === 0) return 100;

  const q = 1 - p;
  const f = new Array(n + 1).fill(0);
  f[0] = 1;

  for (let i = 1; i <= n; i++) {
    f[i] = f[i - 1];
    if (i === k) f[i] -= Math.pow(p, k);
    else if (i > k) f[i] -= Math.pow(p, k) * q * f[i - k - 1];
    if (f[i] < 0) f[i] = 0;
    if (f[i] > 1) f[i] = 1;
  }

  return parseFloat(((1 - f[n]) * 100).toFixed(1));
}

function fmtSigned(n) {
  return (n >= 0 ? "+" : "-") + "$" + Math.abs(Math.round(n)).toLocaleString();
}

function fmtAbs(n) {
  return "$" + Math.abs(Math.round(n)).toLocaleString();
}

function getDDType() {
  return document.querySelector("#dd-type .seg-btn.active").dataset.val;
}

function getRiskMode() {
  return document.querySelector("#risk-mode .seg-btn.active").dataset.val;
}

function getDaysUnlimited() {
  return !document.getElementById("days-toggle").checked;
}

function getDailyLimit() {
  return document.getElementById("daily-toggle").checked;
}

let sizeChart = null;
let passPathChart = null;
let failPathChart = null;
let pathTimer = null;

function update() {
  const acct = +document.getElementById("acct").value;
  const pt = +document.getElementById("pt").value;
  const dd = +document.getElementById("dd").value;
  const wr = +document.getElementById("wr").value / 100;
  const rr = +document.getElementById("rr").value;
  const risk = +document.getElementById("risk").value / 100;
  const tpd = +document.getElementById("tpd").value;
  const days = +document.getElementById("days").value;
  const unlimited = getDaysUnlimited();
  const eodTrailing = getDDType() === "eod";
  const fixedRisk = getRiskMode() === "fixed";
  const fixedRiskAmt = +document.getElementById("risk-fixed").value;
  const useDailyLimit = getDailyLimit();
  const dailyLimitAmt = +document.getElementById("daily-limit").value;
  const challengeFee = +document.getElementById("challenge-fee").value;

  const lossDisplay = fixedRisk ? fixedRiskAmt : acct * risk;
  const winDisplay = fixedRisk ? fixedRiskAmt * rr : acct * risk * rr;

  const ev = wr * winDisplay - (1 - wr) * lossDisplay;
  const wrBreakeven = 1 / (1 + rr);

  const target = (acct * pt) / 100;
  const ddAmount = (acct * dd) / 100;
  const loseRate = 1 - wr;

  const kellyF = wr - loseRate / rr;
  const kellyPct = kellyF * 100;
  const halfKelly = (kellyF / 2) * 100;

  const pf = (wr * rr) / loseRate;

  document.getElementById("win-dollar").textContent =
    "+$" + Math.round(winDisplay).toLocaleString();
  document.getElementById("loss-dollar").textContent =
    "-$" + Math.round(lossDisplay).toLocaleString();
  document.getElementById("win-sub").textContent = fixedRisk
    ? "fixed amount — does not compound"
    : (risk * rr * 100).toFixed(3) + "% of account per win";
  document.getElementById("loss-sub").textContent = fixedRisk
    ? "fixed amount — does not compound"
    : (risk * 100).toFixed(3) + "% of account per loss";
  document.getElementById("win-tag").textContent =
    "wins to pass: " + Math.ceil(target / winDisplay);
  document.getElementById("loss-tag").textContent =
    "losses to bust: " + Math.floor(ddAmount / lossDisplay);

  const evEl = document.getElementById("ev-val");
  evEl.textContent = fmtSigned(ev);
  evEl.className = "mval " + (ev >= 0 ? "color-green" : "color-red");

  document.getElementById("target-dollar").textContent = fmtAbs(target);
  document.getElementById("target-trades").textContent =
    Math.ceil(target / winDisplay) + " wins (best case)";
  document.getElementById("dd-dollar").textContent = fmtAbs(ddAmount);
  document.getElementById("dd-trades").textContent = eodTrailing
    ? "trailing — floor rises each EOD"
    : Math.floor(ddAmount / lossDisplay) + " losses max (static)";

  const riskPctForMC = fixedRisk ? (fixedRiskAmt / acct) * 100 : risk * 100;
  const res = monteCarlo(
    acct,
    pt,
    dd,
    wr,
    rr,
    riskPctForMC,
    tpd,
    days,
    20000,
    unlimited,
    eodTrailing,
    fixedRisk,
    fixedRiskAmt,
    useDailyLimit,
    dailyLimitAmt
  );

  const passEl = document.getElementById("pass-pct");
  passEl.textContent = (res.passRate * 100).toFixed(1) + "%";
  passEl.className =
    "mval " +
    (res.passRate > 0.4
      ? "color-green"
      : res.passRate > 0.2
      ? "color-amber"
      : "color-red");

  const msubParts = [];
  if (unlimited) msubParts.push("no day limit");
  if (eodTrailing) msubParts.push("EOD trailing");
  if (fixedRisk) msubParts.push("fixed $ risk");
  if (useDailyLimit) msubParts.push("daily limit on");
  document.getElementById("pass-msub").textContent = msubParts.length
    ? msubParts.join(" · ")
    : "20000 MC paths";

  document.getElementById("pass-bar-label").textContent =
    (res.passRate * 100).toFixed(1) + "%";
  document.getElementById("bust-bar-label").textContent =
    (res.bustRate * 100).toFixed(1) + "%";
  document.getElementById("time-bar-label").textContent =
    (res.timeoutRate * 100).toFixed(1) + "%";
  document.getElementById("pass-bar").style.width =
    Math.min(res.passRate * 100, 100) + "%";
  document.getElementById("bust-bar").style.width =
    Math.min(res.bustRate * 100, 100) + "%";
  document.getElementById("time-bar").style.width =
    Math.min(res.timeoutRate * 100, 100) + "%";
  document.getElementById("timeout-row").style.opacity = unlimited
    ? "0.3"
    : "1";

  const streakN = unlimited ? tpd * 60 : tpd * days;
  document.getElementById("streak-note").textContent = unlimited
    ? "No day limit — streak probability shown over 60-day equivalent (" +
      tpd * 60 +
      " trades)."
    : "Over " +
      tpd * days +
      " total trades (" +
      tpd +
      "/day × " +
      days +
      " days).";

  const streaks = [
    { label: "3 wins in a row", wins: 3, losses: 0, p: wr, k: 3 },
    { label: "5 wins in a row", wins: 5, losses: 0, p: wr, k: 5 },
    { label: "3 losses in a row", wins: 0, losses: 3, p: loseRate, k: 3 },
    { label: "5 losses in a row", wins: 0, losses: 5, p: loseRate, k: 5 },
    { label: "7 losses in a row", wins: 0, losses: 7, p: loseRate, k: 7 },
    {
      label: "Avg day (" + tpd + " trades)",
      wins: Math.round(tpd * wr),
      losses: tpd - Math.round(tpd * wr),
      p: null,
      k: null,
    },
  ];

  const sg = document.getElementById("streak-grid");
  sg.innerHTML = "";

  streaks.forEach((s) => {
    const net = s.wins * winDisplay - s.losses * lossDisplay;
    const pct = ((net / acct) * 100).toFixed(3);
    const pnlColor = net >= 0 ? "#6ee7b7" : "#fca5a5";
    const probPct = s.p !== null ? streakChance(s.p, s.k, streakN) : null;

    let probClass = "prob-low";
    if (probPct !== null) {
      if (probPct >= 70) probClass = "prob-high";
      else if (probPct >= 30) probClass = "prob-med";
    }

    const div = document.createElement("div");
    div.className = "streak-box";
    div.innerHTML =
      '<div class="streak-title">' +
      s.label +
      "</div>" +
      '<div class="streak-pnl" style="color:' +
      pnlColor +
      ';">' +
      fmtSigned(net) +
      "</div>" +
      '<div class="streak-acct">' +
      pct +
      "% of account</div>" +
      (probPct !== null
        ? '<div class="streak-prob-row"><span class="streak-prob-label">chance at least once</span><span class="streak-prob-val ' +
          probClass +
          '">' +
          probPct +
          "%</span></div>"
        : '<div class="streak-prob-row"><span class="streak-prob-label">expected avg day outcome</span></div>');

    sg.appendChild(div);
  });

  const al = document.getElementById("alert-area");
  al.innerHTML = "";
  const maxLosses = Math.floor(ddAmount / lossDisplay);
  const prob5loss = streakChance(loseRate, 5, streakN);

  if (!eodTrailing && maxLosses <= 3) {
    al.innerHTML =
      '<div class="alert-box alert-warn">Only ' +
      maxLosses +
      " consecutive losses before bust. A 5-loss streak has a " +
      prob5loss +
      "% chance of occurring — that would blow the account.</div>";
  } else if (ev < 0) {
    al.innerHTML =
      '<div class="alert-box alert-warn">Negative EV ' +
      fmtSigned(ev) +
      " per trade. Breakeven win rate for RR " +
      rr.toFixed(3) +
      " is " +
      (wrBreakeven * 100).toFixed(2) +
      "%. Current: " +
      (wr * 100).toFixed(3) +
      "%.</div>";
  } else if (res.passRate > 0.44) {
    al.innerHTML =
      '<div class="alert-box alert-info">Pass rate above 44% — well above the 12.4% Topstep 2024 industry average.</div>';
  }

  const kellyEl = document.getElementById("kelly-val");
  const kellySub = document.getElementById("kelly-sub");

  if (kellyF <= 0) {
    kellyEl.textContent = "N/A";
    kellyEl.className = "mval color-red";
    kellySub.textContent = "negative EV — Kelly says do not trade";
  } else {
    kellyEl.textContent = kellyPct.toFixed(2) + "%";
    kellyEl.className = "mval color-purple";
    kellySub.textContent =
      "half-Kelly: " + halfKelly.toFixed(2) + "% (recommended)";
  }

  const pfEl = document.getElementById("pf-val");
  const pfSub = document.getElementById("pf-sub");
  pfEl.textContent = pf.toFixed(3);

  if (pf >= 2.0) {
    pfEl.className = "mval color-green";
    pfSub.textContent = "excellent (≥ 2.0)";
  } else if (pf >= 1.5) {
    pfEl.className = "mval color-green";
    pfSub.textContent = "good (1.5 – 2.0)";
  } else if (pf >= 1.0) {
    pfEl.className = "mval color-amber";
    pfSub.textContent = "marginal (1.0 – 1.5)";
  } else {
    pfEl.className = "mval color-red";
    pfSub.textContent = "losing strategy (< 1.0)";
  }

  const attEl = document.getElementById("attempts-val");
  const attSub = document.getElementById("attempts-sub");

  if (res.passRate > 0) {
    const expAttempts = 1 / res.passRate;
    attEl.textContent = expAttempts.toFixed(1) + "x";
    attEl.className = "mval color-amber";
    attSub.textContent =
      "expected challenge cost: " + fmtAbs(expAttempts * challengeFee);
  } else {
    attEl.textContent = "∞";
    attEl.className = "mval color-red";
    attSub.textContent = "pass rate is 0%";
  }

  const sweepRisks = [
    0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0,
    2.5, 3.0, 4.0, 5.0,
  ];
  let bestRate = -1;
  let bestRisk = 0;

  sweepRisks.forEach((r) => {
    const sr = monteCarlo(
      acct,
      pt,
      dd,
      wr,
      rr,
      r,
      tpd,
      days,
      800,
      unlimited,
      eodTrailing,
      fixedRisk,
      fixedRisk ? (acct * r) / 100 : 0,
      useDailyLimit,
      dailyLimitAmt
    );
    if (sr.passRate > bestRate) {
      bestRate = sr.passRate;
      bestRisk = r;
    }
  });

  const optEl = document.getElementById("optimal-risk-val");
  const optSub = document.getElementById("optimal-risk-sub");
  const currentRiskPct = fixedRisk ? (fixedRiskAmt / acct) * 100 : risk * 100;
  const diff = currentRiskPct - bestRisk;

  optEl.textContent = bestRisk.toFixed(1) + "%";
  optEl.className = "mval color-purple";

  if (Math.abs(diff) < 0.3) {
    optSub.textContent = "current risk is near optimal ✓";
  } else if (diff > 0) {
    optSub.textContent =
      "current " +
      currentRiskPct.toFixed(1) +
      "% is " +
      diff.toFixed(1) +
      "% too high";
  } else {
    optSub.textContent =
      "current " +
      currentRiskPct.toFixed(1) +
      "% is " +
      Math.abs(diff).toFixed(1) +
      "% too low";
  }

  const ea = document.getElementById("economics-alert");
  ea.innerHTML = "";

  if (kellyF > 0) {
    const cr = fixedRisk ? (fixedRiskAmt / acct) * 100 : risk * 100;
    if (cr > kellyPct * 1.5) {
      ea.innerHTML =
        '<div class="alert-box alert-warn">Current risk (' +
        cr.toFixed(2) +
        "%) is above Kelly (" +
        kellyPct.toFixed(2) +
        "%). Over-betting — reduces long-run growth and increases bust probability. Half-Kelly recommendation: " +
        halfKelly.toFixed(2) +
        "%.</div>";
    } else if (cr >= halfKelly * 0.9 && cr <= halfKelly * 1.1) {
      ea.innerHTML =
        '<div class="alert-box alert-good">Current risk is near the half-Kelly optimal (' +
        halfKelly.toFixed(2) +
        "%). This is the recommended sizing for maximum risk-adjusted growth.</div>";
    }
  }

  updateSizeChart(
    acct,
    pt,
    dd,
    wr,
    rr,
    riskPctForMC,
    tpd,
    days,
    unlimited,
    eodTrailing,
    fixedRisk,
    fixedRiskAmt,
    useDailyLimit,
    dailyLimitAmt
  );

  clearTimeout(pathTimer);
  pathTimer = setTimeout(() => {
    updatePathCharts(
      acct,
      pt,
      dd,
      wr,
      rr,
      riskPctForMC,
      tpd,
      days,
      unlimited,
      eodTrailing,
      fixedRisk,
      fixedRiskAmt,
      useDailyLimit,
      dailyLimitAmt
    );
  }, 400);
}

let storedPassPaths = [];
let storedBustPaths = [];
let storedPassFloors = [];
let storedBustFloors = [];
let storedUpper = 0;
let storedFloor0 = 0;

function updatePathCharts(
  acct,
  pt,
  dd,
  wr,
  rr,
  riskPct,
  tpd,
  days,
  unlimited,
  eodTrailing,
  fixedRisk,
  fixedRiskAmt,
  useDailyLimit,
  dailyLimitAmt
) {
  const { passPaths, bustPaths, passFloors, bustFloors } = collectPaths(
    acct,
    pt,
    dd,
    wr,
    rr,
    riskPct,
    tpd,
    days,
    unlimited,
    eodTrailing,
    fixedRisk,
    fixedRiskAmt,
    useDailyLimit,
    dailyLimitAmt,
    1200,
    300
  );

  storedPassPaths = passPaths;
  storedBustPaths = bustPaths;
  storedPassFloors = passFloors;
  storedBustFloors = bustFloors;
  storedUpper = acct * (1 + pt / 100);
  storedFloor0 = acct * (1 - dd / 100);

  document.getElementById("pass-path-meta").textContent = passPaths.length
    ? passPaths.length + " passing accounts sampled — showing 1 random"
    : "No passing accounts — pass rate may be very low";

  document.getElementById("fail-path-meta").textContent = bustPaths.length
    ? bustPaths.length + " failing accounts sampled — showing 1 random"
    : "No failing accounts — bust rate may be very low";

  const passBtn = document.getElementById("pass-reroll-btn");
  const failBtn = document.getElementById("fail-reroll-btn");
  passBtn.disabled = passPaths.length === 0;
  failBtn.disabled = bustPaths.length === 0;

  drawRandomPassPath();
  drawRandomBustPath();
}

function drawRandomPassPath() {
  if (!storedPassPaths.length) return;
  const idx = Math.floor(Math.random() * storedPassPaths.length);
  const path = storedPassPaths[idx];
  const floor = storedPassFloors[idx];
  drawSinglePath(
    "passPathChart",
    passPathChart,
    path,
    floor,
    storedUpper,
    storedFloor0,
    "#6ee7b7",
    (chart) => {
      passPathChart = chart;
    }
  );
  renderSinglePathStats("pass-path-stats", path, storedUpper, "#6ee7b7");
}

function drawRandomBustPath() {
  if (!storedBustPaths.length) return;
  const idx = Math.floor(Math.random() * storedBustPaths.length);
  const path = storedBustPaths[idx];
  const floor = storedBustFloors[idx];
  drawSinglePath(
    "failPathChart",
    failPathChart,
    path,
    floor,
    storedUpper,
    storedFloor0,
    "#fca5a5",
    (chart) => {
      failPathChart = chart;
    }
  );
  renderSinglePathStats("fail-path-stats", path, storedUpper, "#fca5a5");
}

function drawSinglePath(
  canvasId,
  existingChart,
  path,
  floorPath,
  upper,
  floor0,
  lineColor,
  onCreated
) {
  if (existingChart) existingChart.destroy();
  if (!path || !path.length) {
    onCreated(null);
    return;
  }

  const n = path.length;
  const labels = Array.from({ length: n }, (_, i) => i);
  const targetLine = Array(n).fill(Math.round(upper));
  const floorLine =
    floorPath && floorPath.length === n
      ? floorPath
      : Array(n).fill(Math.round(floor0));

  const chart = new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Equity",
          data: path,
          borderColor: lineColor,
          backgroundColor: lineColor + "12",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
        {
          label: "Profit target",
          data: targetLine,
          borderColor: "rgba(110,231,183,0.5)",
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: "Drawdown floor",
          data: floorLine,
          borderColor: "rgba(252,165,165,0.45)",
          borderWidth: 1.5,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(15,12,41,0.92)",
          borderColor: "rgba(255,255,255,0.15)",
          borderWidth: 1,
          titleColor: "rgba(255,255,255,0.6)",
          bodyColor: "rgba(255,255,255,0.8)",
          callbacks: {
            title: (items) => "Trade " + items[0].label,
            label: (item) =>
              " " +
              item.dataset.label +
              ": $" +
              Number(item.raw).toLocaleString(),
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => "$" + (v / 1000).toFixed(1) + "K",
            font: { size: 11 },
            color: "rgba(255,255,255,0.35)",
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          border: { color: "rgba(255,255,255,0.1)" },
        },
        x: {
          ticks: {
            callback: (v, i) =>
              i % Math.max(1, Math.floor(n / 8)) === 0 ? v : "",
            font: { size: 11 },
            color: "rgba(255,255,255,0.35)",
          },
          grid: { display: false },
          border: { color: "rgba(255,255,255,0.1)" },
          title: {
            display: true,
            text: "trade number",
            color: "rgba(255,255,255,0.25)",
            font: { size: 11 },
          },
        },
      },
    },
  });

  onCreated(chart);
}

function renderSinglePathStats(containerId, path, upper, color) {
  const el = document.getElementById(containerId);
  if (!path || !path.length) {
    el.innerHTML = "";
    return;
  }

  const stats = singlePathStats(path);
  const passed = path[path.length - 1] >= upper;

  const items = [
    { label: "Trades taken", val: stats.trades },
    {
      label: "Peak equity",
      val: "$" + Math.round(stats.peak).toLocaleString(),
    },
    {
      label: passed ? "Final equity (passed)" : "Final equity (busted)",
      val: "$" + Math.round(stats.final).toLocaleString(),
    },
  ];

  el.innerHTML = items
    .map(
      (it) =>
        '<div class="path-stat">' +
        '<div class="ps-label">' +
        it.label +
        "</div>" +
        '<div class="ps-val" style="color:' +
        color +
        ';">' +
        it.val +
        "</div>" +
        "</div>"
    )
    .join("");
}

function updateSizeChart(
  acct,
  pt,
  dd,
  wr,
  rr,
  riskPct,
  tpd,
  days,
  unlimited,
  eodTrailing,
  fixedRisk,
  fixedRiskAmt,
  useDailyLimit,
  dailyLimitAmt
) {
  const riskPoints = [
    0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0,
  ];
  const passRates = [];
  const bustRates = [];
  const labels = [];

  riskPoints.forEach((r) => {
    const fAmt = (acct * r) / 100;
    const res = monteCarlo(
      acct,
      pt,
      dd,
      wr,
      rr,
      r,
      tpd,
      days,
      1200,
      unlimited,
      eodTrailing,
      fixedRisk,
      fAmt,
      useDailyLimit,
      dailyLimitAmt
    );
    passRates.push(parseFloat((res.passRate * 100).toFixed(1)));
    bustRates.push(parseFloat((res.bustRate * 100).toFixed(1)));
    labels.push(
      fixedRisk ? "$" + Math.round(fAmt).toLocaleString() : r.toFixed(1) + "%"
    );
  });

  document.getElementById("chart-title").textContent = fixedRisk
    ? "Pass rate vs fixed risk amount"
    : "Pass rate vs position size (% of account)";

  if (sizeChart) sizeChart.destroy();

  sizeChart = new Chart(document.getElementById("sizeChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Pass rate",
          data: passRates,
          borderColor: "#6ee7b7",
          backgroundColor: "rgba(110,231,183,0.08)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#6ee7b7",
          fill: true,
        },
        {
          label: "Bust rate",
          data: bustRates,
          borderColor: "#fca5a5",
          backgroundColor: "rgba(252,165,165,0.05)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#fca5a5",
          fill: true,
          borderDash: [5, 3],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(15,12,41,0.9)",
          borderColor: "rgba(255,255,255,0.15)",
          borderWidth: 1,
          titleColor: "rgba(255,255,255,0.7)",
          bodyColor: "rgba(255,255,255,0.6)",
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            callback: (v) => v + "%",
            font: { size: 11 },
            color: "rgba(255,255,255,0.35)",
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          border: { color: "rgba(255,255,255,0.1)" },
        },
        x: {
          ticks: {
            font: { size: 11 },
            color: "rgba(255,255,255,0.35)",
            autoSkip: false,
            maxRotation: 45,
          },
          grid: { display: false },
          border: { color: "rgba(255,255,255,0.1)" },
        },
      },
    },
  });
}

function setupSegCtrl(ctrlId, onChangeFn) {
  document
    .getElementById(ctrlId)
    .querySelectorAll(".seg-btn")
    .forEach((btn) => {
      btn.addEventListener("click", function () {
        document
          .getElementById(ctrlId)
          .querySelectorAll(".seg-btn")
          .forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        onChangeFn(this.dataset.val);
      });
    });
}

setupSegCtrl("dd-type", (val) => {
  document.getElementById("dd-type-hint").textContent =
    val === "static"
      ? "Floor fixed from starting balance — never moves"
      : "Floor rises to (peak EOD equity − DD$) — ratchets up as you profit";
  update();
});

setupSegCtrl("risk-mode", (val) => {
  document.getElementById("risk-mode-hint").textContent =
    val === "pct"
      ? "Risk scales with current equity each trade"
      : "Same dollar amount risked on every trade regardless of equity";
  document
    .getElementById("risk-pct-row")
    .classList.toggle("hidden", val === "fixed");
  document
    .getElementById("risk-fixed-row")
    .classList.toggle("hidden", val === "pct");
  update();
});

function setupToggle(checkboxId, rowId, statusId, onColor, offColor) {
  document.getElementById(checkboxId).addEventListener("change", function () {
    const on = this.checked;
    document.getElementById(rowId).classList.toggle("disabled", !on);
    const badge = document.getElementById(statusId);
    badge.textContent = on ? "ON" : "OFF";
    badge.className = "toggle-status " + (on ? onColor : offColor);
    update();
  });
}

setupToggle(
  "days-toggle",
  "days-row",
  "days-status",
  "color-purple",
  "color-red"
);
setupToggle(
  "daily-toggle",
  "daily-row",
  "daily-status",
  "color-purple",
  "color-red"
);

// bindSlider wires up a range input + its display span.
// Clicking the span lets the user type a number directly.
// On Enter or blur: value is parsed, clamped to the slider's min/max/step,
// written back to the range, and update() fires.
function bindSlider(id, outId, fmt) {
  const slider = document.getElementById(id);
  const label  = document.getElementById(outId);

  // range → label (normal slider drag)
  slider.addEventListener("input", function () {
    label.textContent = fmt(this.value);
    update();
  });

  // label click → inline text input
  label.style.cursor = "pointer";
  label.title = "Click to type a value";

  label.addEventListener("click", function () {
    const min  = parseFloat(slider.min);
    const max  = parseFloat(slider.max);
    const step = parseFloat(slider.step) || 1;

    const input = document.createElement("input");
    input.type  = "text";
    input.value = parseFloat(slider.value).toString();
    input.className = "val-input";
    input.style.width = label.offsetWidth + "px";

    label.replaceWith(input);
    input.select();

    function commit() {
      let num = parseFloat(input.value);
      if (isNaN(num)) num = parseFloat(slider.value);

      // clamp to slider bounds
      num = Math.min(max, Math.max(min, num));

      // snap to step
      const steps = Math.round((num - min) / step);
      num = parseFloat((min + steps * step).toFixed(10));
      num = Math.min(max, Math.max(min, num));

      slider.value = num;
      label.textContent = fmt(num);
      input.replaceWith(label);
      update();
    }

    function cancel() {
      label.textContent = fmt(slider.value);
      input.replaceWith(label);
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter")  { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });

    input.addEventListener("blur", commit);
  });
}

document
  .getElementById("pass-reroll-btn")
  .addEventListener("click", drawRandomPassPath);
document
  .getElementById("fail-reroll-btn")
  .addEventListener("click", drawRandomBustPath);

bindSlider("acct", "acct-out", (v) => "$" + Number(v).toLocaleString());
bindSlider("pt", "pt-out", (v) => v + "%");
bindSlider("dd", "dd-out", (v) => v + "%");
bindSlider("wr", "wr-out", (v) => parseFloat(v).toFixed(3) + "%");
bindSlider("rr", "rr-out", (v) => parseFloat(v).toFixed(3));
bindSlider("risk", "risk-out", (v) => parseFloat(v).toFixed(3) + "%");
bindSlider(
  "risk-fixed",
  "risk-fixed-out",
  (v) => "$" + Number(v).toLocaleString()
);
bindSlider("tpd", "tpd-out", (v) => v);
bindSlider("days", "days-out", (v) => v);
bindSlider(
  "daily-limit",
  "daily-limit-out",
  (v) => "$" + Number(v).toLocaleString()
);
bindSlider(
  "challenge-fee",
  "challenge-fee-out",
  (v) => "$" + Number(v).toLocaleString()
);

update();
