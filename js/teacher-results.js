// js/teacher-results.js
// Results panel for Teacher Quiz Detail: Top-5 + option distribution

let __top5Chart, __optDistChart;

function destroyChart(ch) {
  try {
    ch && ch.destroy && ch.destroy();
  } catch (_) {}
}

function makeBarChart(ctx, labels, data) {
  destroyChart(__top5Chart);
  __top5Chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Score", data }] },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function makePieChart(ctx, labels, data) {
  destroyChart(__optDistChart);
  __optDistChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ label: "Responses", data }] },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

// -------- Top 5 --------
async function loadTop5ForQuiz(quizId) {
  const { data: attempts, error } = await client
    .from("attempts")
    .select("user_id, score")
    .eq("quiz_id", quizId)
    .not("score", "is", null)
    .order("score", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("[top5] attempts error", error);
    return [];
  }

  const bestByUser = new Map();
  (attempts || []).forEach((a) => {
    const prev = bestByUser.get(a.user_id);
    if (!prev || (a.score ?? -Infinity) > (prev.score ?? -Infinity)) {
      bestByUser.set(a.user_id, a);
    }
  });

  const arr = Array.from(bestByUser.values())
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 5);

  const ids = arr.map((x) => x.user_id);
  let names = {};
  if (ids.length) {
    const { data: profs } = await client
      .from("profiles")
      .select("id,name,username,email")
      .in("id", ids);
    (profs || []).forEach((p) => {
      names[p.id] = p.name || p.username || p.email || p.id;
    });
  }

  return arr.map((x) => ({
    user_id: x.user_id,
    name: names[x.user_id] || x.user_id,
    score: Number(x.score || 0),
  }));
}

async function renderTop5(quizId) {
  const listEl = document.getElementById("top5List");
  const ctx = document.getElementById("top5Chart");
  if (!listEl || !ctx) return;

  listEl.innerHTML = '<li class="muted">Loading…</li>';
  const rows = await loadTop5ForQuiz(quizId);

  if (!rows.length) {
    listEl.innerHTML = '<li class="muted">No graded attempts yet.</li>';
    destroyChart(__top5Chart);
    return;
  }

  listEl.innerHTML = "";
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${r.name} — ${r.score}`;
    listEl.appendChild(li);
  });

  makeBarChart(
    ctx,
    rows.map((r) => r.name),
    rows.map((r) => r.score)
  );
}

// -------- Option distribution --------
async function fetchQuestions(quizId) {
  const { data, error } = await client
    .from("questions")
    .select("id, type, prompt, options, correct_answer")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[optDist] questions error", error);
    return [];
  }
  return data || [];
}

async function loadOptionDistribution(quizId, questionId) {
  const { data: attempts, error: aErr } = await client
    .from("attempts")
    .select("id")
    .eq("quiz_id", quizId);
  if (aErr) {
    console.error("[optDist] attempts error", aErr);
    return { counts: {}, total: 0 };
  }

  const attemptIds = (attempts || []).map((a) => a.id);
  if (!attemptIds.length) return { counts: {}, total: 0 };

  const { data: answers, error: ansErr } = await client
    .from("attempt_answers")
    .select("answer")
    .eq("question_id", questionId)
    .in("attempt_id", attemptIds);
  if (ansErr) {
    console.error("[optDist] attempt_answers error", ansErr);
    return { counts: {}, total: 0 };
  }

  const norm = (s) => {
    if (s == null) return null;
    const t = String(s).trim();
    if (/^[A-Da-d]$/.test(t)) return t.toUpperCase();
    if (/^(true|false)$/i.test(t)) return t.toLowerCase();
    return t;
  };

  const counts = {};
  let total = 0;
  (answers || []).forEach((a) => {
    const k = norm(a.answer);
    if (!k) return;
    counts[k] = (counts[k] || 0) + 1;
    total++;
  });

  return { counts, total };
}

async function renderOptionDistribution(quizId) {
  const select = document.getElementById("questionSelect");
  const ctx = document.getElementById("optDistChart");
  const tbody = document.querySelector("#optDistTable tbody");
  if (!select || !ctx || !tbody) return;

  // Build dropdown once
  if (!select.options.length) {
    const qs = await fetchQuestions(quizId);
    qs.forEach((q, idx) => {
      const opt = document.createElement("option");
      opt.value = q.id;
      const label = `Q${idx + 1} — ${q.type.toUpperCase()}: ${String(
        q.prompt || ""
      ).slice(0, 60)}`;
      opt.textContent = label;
      opt.dataset.type = q.type;
      opt.dataset.options = JSON.stringify(
        Array.isArray(q.options)
          ? q.options
          : q.type === "tf"
          ? ["true", "false"]
          : []
      );
      select.appendChild(opt);
    });
    if (!select.options.length) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="muted">No questions</td></tr>';
      destroyChart(__optDistChart);
      return;
    }
  }

  const chosen = select.value || select.options[0].value;
  select.value = chosen;

  const { counts } = await loadOptionDistribution(quizId, chosen);

  // Render labels/values
  const optData = select.options[select.selectedIndex]?.dataset || {};
  let labels = [];
  try {
    labels = JSON.parse(optData.options || "[]");
  } catch {
    labels = [];
  }

  let chartLabels = [],
    chartValues = [];
  if (labels.length >= 2) {
    const letters = ["A", "B", "C", "D"];
    chartLabels = letters
      .slice(0, labels.length)
      .map((L, i) => `${L}. ${labels[i]}`);
    chartValues = letters.slice(0, labels.length).map((L) => counts[L] || 0);
  } else {
    const keys = Object.keys(counts).sort();
    chartLabels = keys;
    chartValues = keys.map((k) => counts[k] || 0);
  }

  makePieChart(ctx, chartLabels, chartValues);

  // Table
  tbody.innerHTML = "";
  const sum = chartValues.reduce((a, b) => a + b, 0) || 0;
  if (!sum) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="muted">No answers yet.</td></tr>';
  } else {
    for (let i = 0; i < chartLabels.length; i++) {
      const count = chartValues[i];
      const pct = sum ? ((count * 100) / sum).toFixed(1) : "0.0";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${chartLabels[i]}</td><td>${count}</td><td>${pct}%</td>`;
      tbody.appendChild(tr);
    }
  }
}

// Public hook for the page
function wireResultsUI(quizId) {
  const btn = document.getElementById("showResultsBtn");
  const panel = document.getElementById("resultsPanel");
  const qsel = document.getElementById("questionSelect");
  if (!btn || !panel) return;

  btn.addEventListener("click", async () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      await renderTop5(quizId);
      await renderOptionDistribution(quizId);
    }
  });

  qsel?.addEventListener("change", async () => {
    await renderOptionDistribution(quizId);
  });
}

window.wireResultsUI = wireResultsUI;
