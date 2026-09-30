/* Two Worlds Agent Lab: record an agent's trace, check it against the key, score it. */
(function () {
  "use strict";

  var QS = window.QUESTIONS;
  var GROUPS = window.GROUPS;
  var BY_ID = {};
  QS.forEach(function (q) { BY_ID[q.id] = q; });
  var STORE_KEY = "twoWorldsLab.v1";

  var GROUP_NOTES = {
    A: "One book or the calculator should be enough. Does the agent reach for the right one?",
    B: "Small talk and general knowledge. The best route uses no tools at all.",
    C: "The books don't have the answer. A good agent says so instead of inventing one.",
    D: "Questions that look like they need one tool but need another, or need two tools in a row.",
    E: "Questions that need both books, and sometimes the calculator too.",
    F: "Near-miss names, a contradiction inside a book, and journeys spread across chapters."
  };
  var TOOL_NAMES = { M: "Mereholt book", D: "Drift book", C: "Calculator" };
  var TROPE_IDS = ["A1", "A4", "A7", "A11"];
  var CONS_DEFAULT = ["E5", "F5", "F7"];

  // ---------- state ----------
  function blank() {
    return {
      team: "", model: "", q: {}, cost: "", loops: false,
      cons: CONS_DEFAULT.map(function (id) { return { id: id, runs: [{ r: "", a: "" }, { r: "", a: "" }, { r: "", a: "" }] }; }),
      trope: {}
    };
  }
  var S = blank();
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) { var saved = JSON.parse(raw); S = Object.assign(blank(), saved); }
  } catch (e) { /* storage unavailable: work in memory only */ }
  // The consistency questions are fixed; drop runs saved against any other question.
  S.cons = CONS_DEFAULT.map(function (id, i) {
    var row = S.cons && S.cons[i];
    return row && row.id === id ? row : blank().cons[i];
  });
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { } }
  function qs(id) {
    if (!S.q[id]) S.q[id] = { tools: [], none: false, calls: "", agent: "", checked: false, answer: null, routeOverride: null };
    return S.q[id];
  }

  // ---------- scoring ----------
  function recorded(st) { return st && (st.none || st.tools.length > 0); }
  function autoRoute(q, st) {
    var used = st.none ? [] : st.tools.slice();
    if (q.calc_optional) used = used.filter(function (t) { return t !== "C"; });
    used.sort();
    return q.accept.some(function (set) { return set.slice().sort().join() === used.join(); }) ? 1 : 0;
  }
  function routeScore(q) {
    var st = S.q[q.id];
    if (!st || !st.checked || !recorded(st)) return null;
    return st.routeOverride !== null && st.routeOverride !== undefined ? st.routeOverride : autoRoute(q, st);
  }
  function answerScore(q) {
    var st = S.q[q.id];
    return st && st.checked && st.answer !== null && st.answer !== undefined ? st.answer : null;
  }
  function isScored(q) { return answerScore(q) !== null && routeScore(q) !== null; }
  function tally(list) {
    var n = 0, a = 0, r = 0;
    list.forEach(function (q) { if (isScored(q)) { n++; a += answerScore(q); r += routeScore(q); } });
    return { n: n, a: a, r: r };
  }
  function pct(x, n) { return n ? Math.round((100 * x) / n) : null; }
  function fmtScore(x) { return (Math.round(x * 10) / 10).toString(); }
  function rubricPts(p) { return p === null ? null : p >= 80 ? 2 : p >= 50 ? 1 : 0; }

  // ---------- helpers ----------
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function copyText(text, btn) {
    function done(ok) {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? "Copied" : "Select and copy";
      setTimeout(function () { btn.textContent = old; }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  }

  // ---------- question cards ----------
  var qWrap = document.getElementById("questions");
  var nav = document.getElementById("groupnav");

  function renderQuestions() {
    qWrap.innerHTML = "";
    nav.innerHTML = "";
    Object.keys(GROUPS).forEach(function (g) {
      var list = QS.filter(function (q) { return q.group === g; });
      var a = el("a", { href: "#grp-" + g, "data-group": g });
      a.innerHTML = g + " · " + esc(GROUPS[g]) + "<span></span>";
      nav.appendChild(a);

      var head = el("div", { class: "group-head", id: "grp-" + g });
      head.innerHTML = '<span class="gl">' + g + '</span><h2>' + esc(GROUPS[g]) + '</h2><p>' + esc(GROUP_NOTES[g]) + '</p>';
      qWrap.appendChild(head);
      list.forEach(function (q) { qWrap.appendChild(card(q)); });
    });
    updateNav();
  }

  function card(q) {
    var st = qs(q.id);
    var c = el("article", { class: "q", id: "q-" + q.id, "data-id": q.id });
    var toggles = ["M", "D", "C"].map(function (t) {
      return '<button type="button" class="tog t-' + t + '" data-tool="' + t + '" aria-pressed="' + (st.tools.indexOf(t) >= 0) + '">' + TOOL_NAMES[t] + '</button>';
    }).join("") + '<button type="button" class="tog t-none" data-tool="none" aria-pressed="' + st.none + '">No tools</button>';

    c.innerHTML =
      '<div class="q-head"><span class="q-id">' + q.id + '</span><div class="q-text">' + q.question + '</div>' +
      '<button type="button" class="btn btn-quiet q-copy">Copy</button></div>' +
      '<div class="record">' +
        '<div><span class="fieldlabel">Tools the trace shows</span><div class="toggles">' + toggles + '</div></div>' +
        '<div class="calls"><label class="fieldlabel" for="calls-' + q.id + '">Model calls</label><input type="number" min="0" max="99" inputmode="numeric" id="calls-' + q.id + '" value="' + esc(st.calls) + '"></div>' +
        '<div class="agent-ans"><label class="fieldlabel" for="ans-' + q.id + '">Agent\'s answer (optional)</label><textarea id="ans-' + q.id + '" rows="2" placeholder="Paste or summarize what it said">' + esc(st.agent) + '</textarea></div>' +
      '</div>' +
      '<div class="check-row"><button type="button" class="btn btn-solid do-check">Check against the key</button><span class="hint"></span></div>' +
      '<div class="key" hidden></div>';
    paintCard(c, q);
    return c;
  }

  function paintCard(c, q) {
    var st = qs(q.id);
    var checkBtn = c.querySelector(".do-check");
    var hint = c.querySelector(".hint");
    var key = c.querySelector(".key");
    var status = c.querySelector(".q-status");
    if (!status) { status = el("span", { class: "q-status" }); c.querySelector(".q-head").insertBefore(status, c.querySelector(".q-copy")); }

    c.querySelectorAll(".tog").forEach(function (b) {
      var t = b.getAttribute("data-tool");
      b.setAttribute("aria-pressed", String(t === "none" ? st.none : st.tools.indexOf(t) >= 0));
    });

    checkBtn.hidden = st.checked;
    checkBtn.disabled = !recorded(st);
    hint.textContent = st.checked ? "" : recorded(st) ? "" : "Record the tools first (or No tools).";

    if (st.checked) {
      key.hidden = false;
      var auto = recorded(st) ? autoRoute(q, st) : null;
      var route = routeScore(q);
      key.innerHTML =
        '<dl>' +
          '<dt>Expected tools</dt><dd>' + q.tools + '</dd>' +
          '<dt>Answer</dt><dd>' + q.answer + '</dd>' +
          (q.evidence ? '<dt>Evidence</dt><dd>' + q.evidence + '</dd>' : '') +
          (q.watch ? '<dt>Watch for</dt><dd>' + q.watch + '</dd>' : '') +
        '</dl>' +
        (q.rule ? '<div class="rule">' + esc(q.rule) + '</div>' : '') +
        '<div class="marks">' +
          '<div class="mark-box"><span class="fieldlabel">Answer</span><div class="seg" data-kind="answer">' +
            seg([[1, "✓"], [0.5, "½"], [0, "✗"]], st.answer) + '</div></div>' +
          '<div class="mark-box"><span class="fieldlabel">Route</span><div class="seg" data-kind="route">' +
            seg([[1, "✓"], [0, "✗"]], route) + '</div>' +
            '<span class="auto">' + (auto === null ? "Record the tools to score the route." :
              'Scored from your tools: <b class="' + (auto ? "ok" : "no") + '">' + (auto ? "✓ matches" : "✗ doesn't match") + '</b>' +
              (st.routeOverride !== null && st.routeOverride !== undefined ? " · you changed it" : " · tap to change")) + '</span></div>' +
        '</div>';
    } else {
      key.hidden = true;
      key.innerHTML = "";
    }
    var scored = isScored(q);
    status.textContent = scored ? "Scored" : st.checked ? "Mark it" : recorded(st) ? "Recorded" : "";
    status.className = "q-status" + (scored ? " scored" : "");
  }

  function seg(opts, current) {
    return opts.map(function (o) {
      return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (current === o[0]) + '">' + o[1] + '</button>';
    }).join("");
  }

  qWrap.addEventListener("click", function (e) {
    var c = e.target.closest(".q");
    if (!c) return;
    var q = BY_ID[c.getAttribute("data-id")];
    var st = qs(q.id);
    var b;
    if ((b = e.target.closest(".tog"))) {
      var t = b.getAttribute("data-tool");
      if (t === "none") { st.none = !st.none; if (st.none) st.tools = []; }
      else {
        st.none = false;
        var i = st.tools.indexOf(t);
        if (i >= 0) st.tools.splice(i, 1); else st.tools.push(t);
      }
      st.routeOverride = null;
    } else if (e.target.closest(".do-check")) {
      if (!recorded(st)) return;
      st.checked = true;
    } else if ((b = e.target.closest(".seg button"))) {
      var v = parseFloat(b.getAttribute("data-v"));
      var kind = b.parentNode.getAttribute("data-kind");
      if (kind === "answer") st.answer = st.answer === v ? null : v;
      else st.routeOverride = v === autoRoute(q, st) ? null : v;
    } else if ((b = e.target.closest(".q-copy"))) {
      copyText(q.copy, b);
      return;
    } else { return; }
    save();
    paintCard(c, q);
    refreshScores();
  });

  qWrap.addEventListener("input", function (e) {
    var c = e.target.closest(".q");
    if (!c) return;
    var st = qs(c.getAttribute("data-id"));
    if (e.target.id.indexOf("calls-") === 0) st.calls = e.target.value;
    if (e.target.id.indexOf("ans-") === 0) st.agent = e.target.value;
    save();
    refreshScores();
  });

  function updateNav() {
    nav.querySelectorAll("a").forEach(function (a) {
      var g = a.getAttribute("data-group");
      var list = QS.filter(function (q) { return q.group === g; });
      var done = list.filter(isScored).length;
      a.querySelector("span").textContent = done + "/" + list.length;
      a.classList.toggle("done", done === list.length);
    });
  }

  // ---------- header scores ----------
  function refreshScores() {
    var t = tally(QS);
    document.getElementById("sumAnswer").textContent = t.n ? pct(t.a, t.n) + "%" : "—";
    document.getElementById("sumRoute").textContent = t.n ? pct(t.r, t.n) + "%" : "—";
    document.getElementById("sumDone").textContent = t.n + " / " + QS.length;
    updateNav();
    renderSummary();
  }

  // ---------- summary ----------
  function groupList(gs) { return QS.filter(function (q) { return gs.indexOf(q.group) >= 0; }); }
  function avgCalls() {
    var vals = QS.map(function (q) { return S.q[q.id] && parseFloat(S.q[q.id].calls); }).filter(function (v) { return !isNaN(v); });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function rubric() {
    var right = tally(groupList(["A", "D", "E", "F"]));
    var needless = tally(groupList(["B"]));
    var limits = tally(groupList(["C"]));
    var all = tally(QS);
    var rows = [
      { dim: "Right tool", from: "Route on groups A, D, E, F", p: pct(right.r, right.n), n: right.n },
      { dim: "No needless tool", from: "Route on group B", p: pct(needless.r, needless.n), n: needless.n },
      { dim: "Knows its limits", from: "Answers on group C", p: pct(limits.a, limits.n), n: limits.n },
      { dim: "Answer quality", from: "Answers on all groups", p: pct(all.a, all.n), n: all.n }
    ];
    rows.forEach(function (r) { r.pts = rubricPts(r.p); });
    var cost = S.cost === "" ? null : parseInt(S.cost, 10);
    var total = rows.reduce(function (s, r) { return s + (r.pts || 0); }, 0) + (cost || 0);
    var complete = rows.every(function (r) { return r.pts !== null; }) && cost !== null;
    return { rows: rows, cost: cost, total: total, complete: complete };
  }

  function renderSummary() {
    // groups
    var h = '<thead><tr><th>Group</th><th class="num">Scored</th><th class="num">Answer</th><th class="num">Route</th></tr></thead><tbody>';
    Object.keys(GROUPS).forEach(function (g) {
      var list = groupList([g]);
      var t = tally(list);
      h += '<tr><td>' + g + ' · ' + esc(GROUPS[g]) + '</td><td class="num">' + t.n + ' / ' + list.length + '</td>' +
        '<td class="num">' + (t.n ? fmtScore(t.a) + ' (' + pct(t.a, t.n) + '%)' : '—') + '</td>' +
        '<td class="num">' + (t.n ? fmtScore(t.r) + ' (' + pct(t.r, t.n) + '%)' : '—') + '</td></tr>';
    });
    var all = tally(QS);
    h += '<tr class="total"><td>Total</td><td class="num">' + all.n + ' / ' + QS.length + '</td>' +
      '<td class="num">' + (all.n ? fmtScore(all.a) + ' (' + pct(all.a, all.n) + '%)' : '—') + '</td>' +
      '<td class="num">' + (all.n ? fmtScore(all.r) + ' (' + pct(all.r, all.n) + '%)' : '—') + '</td></tr></tbody>';
    document.getElementById("groupTable").innerHTML = h;

    // rubric (keep the cost controls if already rendered, so typing isn't interrupted)
    var R = rubric();
    var rt = document.getElementById("rubricTable");
    var avg = avgCalls();
    var body = '<thead><tr><th>Dimension</th><th>Comes from</th><th class="num">Your %</th><th class="num">Score</th></tr></thead><tbody>';
    R.rows.forEach(function (r) {
      body += '<tr><td>' + r.dim + '</td><td>' + r.from + '</td><td class="num">' + (r.p === null ? '—' : r.p + '%') + '</td>' +
        '<td class="num big">' + (r.pts === null ? '—' : r.pts) + '</td></tr>';
    });
    body += '<tr><td>Cost &amp; steps</td><td>Average model calls: <b>' + (avg === null ? '—' : (Math.round(avg * 10) / 10)) + '</b>. ' +
      '<label><input type="checkbox" id="loops"' + (S.loops ? ' checked' : '') + '> It looped on at least one question</label><br>' +
      '<span class="fine">2 = no loops and a sensible number of calls · 1 = a few extra calls · 0 = a loop or runaway calls</span></td>' +
      '<td class="num"></td><td class="num"><select id="costSel" aria-label="Cost and steps score">' +
      ['', '2', '1', '0'].map(function (v) { return '<option value="' + v + '"' + (S.cost === v ? ' selected' : '') + '>' + (v === '' ? '—' : v) + '</option>'; }).join('') +
      '</select></td></tr>';
    body += '<tr class="total"><td>Total</td><td>' + (R.complete ? '' : '<span class="fine">Score at least one question in every group, and pick a Cost &amp; steps score.</span>') + '</td><td></td>' +
      '<td class="num big"><span class="hl">' + R.total + ' / 10</span></td></tr></tbody>';
    rt.innerHTML = body;

    renderCons();
    renderTrope();
  }

  document.getElementById("rubricTable").addEventListener("change", function (e) {
    if (e.target.id === "costSel") S.cost = e.target.value;
    if (e.target.id === "loops") S.loops = e.target.checked;
    save();
    renderSummary();
  });

  // consistency
  function renderCons() {
    var h = '<thead><tr><th>Question</th><th>Run 1</th><th>Run 2</th><th>Run 3</th><th>Same every time?</th></tr></thead><tbody>';
    S.cons.forEach(function (row, i) {
      h += '<tr><td><b>' + row.id + '</b>' +
        '<div class="fine">' + (BY_ID[row.id] ? BY_ID[row.id].copy : '') + '</div></td>';
      row.runs.forEach(function (run, j) {
        h += '<td><select data-ci="' + i + '" data-run="' + j + '" data-f="r" aria-label="Row ' + (i + 1) + ' run ' + (j + 1) + ' route">' +
          [['', 'Route'], ['1', 'Route ✓'], ['0', 'Route ✗']].map(function (o) { return '<option value="' + o[0] + '"' + (run.r === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select><br><select data-ci="' + i + '" data-run="' + j + '" data-f="a" aria-label="Row ' + (i + 1) + ' run ' + (j + 1) + ' answer">' +
          [['', 'Answer'], ['1', 'Answer ✓'], ['0.5', 'Answer ½'], ['0', 'Answer ✗']].map(function (o) { return '<option value="' + o[0] + '"' + (run.a === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select></td>';
      });
      var full = row.runs.every(function (r) { return r.r !== '' && r.a !== ''; });
      var same = full && row.runs.every(function (r) { return r.r === row.runs[0].r && r.a === row.runs[0].a; });
      h += '<td>' + (full ? (same ? '<b>Yes</b>' : '<b>No</b>. What changed?') : '—') + '</td></tr>';
    });
    document.getElementById("consTable").innerHTML = h + '</tbody>';
  }
  document.getElementById("consTable").addEventListener("change", function (e) {
    var t = e.target, i = +t.getAttribute("data-ci"), f = t.getAttribute("data-f");
    S.cons[i].runs[+t.getAttribute("data-run")][f] = t.value;
    save();
    renderCons();
  });

  // trope
  function renderTrope() {
    var tb = document.getElementById("tropeTable");
    if (tb.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
    var h = '<thead><tr><th>Question</th><th>The cliché to watch for</th><th>Gave the cliché?</th><th>Notes</th></tr></thead><tbody>';
    TROPE_IDS.forEach(function (id) {
      var q = BY_ID[id], t = S.trope[id] || { g: '', n: '' };
      h += '<tr><td><b>' + id + '</b> ' + q.question + '</td><td>' + q.watch + '</td>' +
        '<td><select data-tid="' + id + '" data-f="g" aria-label="' + id + ' gave the cliché">' +
        [['', '—'], ['yes', 'Yes'], ['no', 'No']].map(function (o) { return '<option value="' + o[0] + '"' + (t.g === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select></td><td><input type="text" data-tid="' + id + '" data-f="n" value="' + esc(t.n) + '" aria-label="' + id + ' notes"></td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  function tropeChange(e) {
    var id = e.target.getAttribute("data-tid");
    if (!id) return;
    S.trope[id] = S.trope[id] || { g: '', n: '' };
    S.trope[id][e.target.getAttribute("data-f")] = e.target.value;
    save();
  }
  document.getElementById("tropeTable").addEventListener("change", tropeChange);
  document.getElementById("tropeTable").addEventListener("input", tropeChange);

  // ---------- who ----------
  ["team", "model"].forEach(function (k) {
    var inp = document.getElementById(k);
    inp.value = S[k] || "";
    inp.addEventListener("input", function () { S[k] = inp.value; save(); });
  });

  // ---------- export ----------
  function csvCell(v) {
    var s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function markText(v) { return v === 1 ? "✓" : v === 0.5 ? "½" : v === 0 ? "✗" : ""; }
  function buildCsv() {
    var lines = [];
    lines.push(["Team", S.team].map(csvCell).join(","));
    lines.push(["Model", S.model].map(csvCell).join(","));
    lines.push("");
    lines.push(["Question", "Group", "Text", "Tools called", "Model calls", "Agent's answer", "Answer", "Route"].join(","));
    QS.forEach(function (q) {
      var st = S.q[q.id] || {};
      var tools = st.none ? "none" : (st.tools || []).map(function (t) { return TOOL_NAMES[t]; }).join(" + ");
      lines.push([q.id, GROUPS[q.group], q.copy, tools, st.calls || "", st.agent || "", markText(answerScore(q)), markText(routeScore(q))].map(csvCell).join(","));
    });
    lines.push("");
    lines.push(["Group", "Scored", "Answer score", "Route score"].join(","));
    Object.keys(GROUPS).forEach(function (g) {
      var t = tally(groupList([g]));
      lines.push([g + " " + GROUPS[g], t.n, fmtScore(t.a), fmtScore(t.r)].map(csvCell).join(","));
    });
    var R = rubric();
    lines.push("");
    lines.push("Rubric dimension,Score");
    R.rows.forEach(function (r) { lines.push([r.dim, r.pts === null ? "" : r.pts].map(csvCell).join(",")); });
    lines.push(["Cost & steps", R.cost === null ? "" : R.cost].map(csvCell).join(","));
    lines.push(["Total (out of 10)", R.total].map(csvCell).join(","));
    return "﻿" + lines.join("\r\n");
  }
  function summaryText() {
    var all = tally(QS), R = rubric();
    var out = ["Two Worlds Agent Lab", "Team: " + (S.team || "—") + "   Model: " + (S.model || "—"),
      "Scored " + all.n + " of " + QS.length + " questions. Answers " + (all.n ? pct(all.a, all.n) + "%" : "—") + ", Route " + (all.n ? pct(all.r, all.n) + "%" : "—") + ".", ""];
    Object.keys(GROUPS).forEach(function (g) {
      var t = tally(groupList([g]));
      out.push(g + ". " + GROUPS[g] + ": answers " + fmtScore(t.a) + "/" + t.n + ", route " + fmtScore(t.r) + "/" + t.n);
    });
    out.push("");
    R.rows.forEach(function (r) { out.push(r.dim + ": " + (r.pts === null ? "—" : r.pts)); });
    out.push("Cost & steps: " + (R.cost === null ? "—" : R.cost));
    out.push("Rubric total: " + R.total + " / 10");
    return out.join("\n");
  }
  var msg = document.getElementById("exportMsg");
  document.getElementById("dlCsv").addEventListener("click", function () {
    var blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    var name = (S.team || "agent").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "agent";
    a.href = URL.createObjectURL(blob);
    a.download = "two-worlds-" + name + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    msg.textContent = "Downloaded " + a.download + ".";
  });
  document.getElementById("copySummary").addEventListener("click", function (e) {
    copyText(summaryText(), e.currentTarget);
  });
  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });
  var confirmBox = document.getElementById("resetConfirm");
  document.getElementById("resetBtn").addEventListener("click", function () { confirmBox.hidden = false; });
  document.getElementById("resetNo").addEventListener("click", function () { confirmBox.hidden = true; });
  document.getElementById("resetYes").addEventListener("click", function () {
    S = blank();
    save();
    confirmBox.hidden = true;
    document.getElementById("team").value = "";
    document.getElementById("model").value = "";
    renderQuestions();
    refreshScores();
    msg.textContent = "Cleared. You're starting fresh.";
  });

  // ---------- tabs ----------
  var header = document.querySelector(".top");
  function fitSticky() {
    var h = header.offsetHeight;
    nav.style.top = h + "px";
    document.querySelectorAll(".group-head, .q").forEach(function (n) { n.style.scrollMarginTop = (h + 56) + "px"; });
  }
  function showTab(name) {
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.getAttribute("data-tab") === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function route() {
    var h = (location.hash || "").slice(1);
    if (h === "setup" || h === "score" || h === "summary") { showTab(h); window.scrollTo(0, 0); }
    else if (/^(grp-|q-)/.test(h)) { showTab("score"); }
    else showTab("setup");
    fitSticky();
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", fitSticky);

  renderQuestions();
  refreshScores();
  route();
})();
