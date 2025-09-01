// js/teacher-dashboard.js
// Teacher Dashboard: KPIs + Charts + Student names from profiles

(async function () {
  try {
    if (typeof requireLogin === "function") await requireLogin("Teacher");

    const byId = (id) => document.getElementById(id);
    const setText = (id, v) => {
      const el = byId(id);
      if (el) el.textContent = String(v);
    };
    setText("year", new Date().getFullYear());

    const prof = await (typeof getCurrentProfile === "function"
      ? getCurrentProfile()
      : null);
    if (prof?.name) setText("tName", prof.name);

    if (typeof client === "undefined") {
      console.error("Supabase client not defined");
      return;
    }

    const { data: { user } = {} } = await client.auth.getUser();
    if (!user) return;

    // --- Fetch quizzes created by this teacher ---
    const { data: quizzes = [], error: qErr } = await client
      .from("quizzes")
      .select("id,title,created_at")
      .eq("created_by", user.id);

    if (qErr) console.error("Quizzes error:", qErr);
    setText("kpiQuizzes", quizzes.length);

    // --- Fetch attempts for those quizzes ---
    const qids = quizzes.map((q) => q.id);
    let attempts = [];
    if (qids.length) {
      const { data: atts = [], error: aErr } = await client
        .from("attempts")
        .select("id,quiz_id,user_id,score,graded,needs_grading,created_at")
        .in("quiz_id", qids);

      if (aErr) console.error("Attempts error:", aErr);
      attempts = atts || [];
    }

    // --- KPIs ---
    const gradedCount = attempts.filter((a) => a.graded).length;
    const pendingCount = attempts.filter((a) => a.needs_grading).length;
    const uniqueStudentsSet = new Set(
      attempts.map((a) => a.user_id).filter(Boolean)
    );
    setText("kpiPending", pendingCount);
    setText("kpiStudents", uniqueStudentsSet.size);

    // --- Fetch student names from profiles (for Recent Attempts display) ---
    const nameMap = {};
    const studentIds = Array.from(uniqueStudentsSet);
    if (studentIds.length) {
      const { data: profs, error: pErr } = await client
        .from("profiles")
        .select("id,name")
        .in("id", studentIds);
      if (pErr) {
        console.warn(
          "Profiles lookup error (names will fallback to short IDs):",
          pErr
        );
      } else {
        (profs || []).forEach((p) => {
          nameMap[p.id] = p.name || p.id;
        });
      }
    }
    const displayStudent = (uid) =>
      nameMap[uid] || (uid ? uid.slice(0, 6) : "—");

    // --- Recent Attempts ---
    const tbody = document.querySelector("#recentAttempts tbody");
    if (tbody) {
      tbody.innerHTML = "";
      attempts
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10)
        .forEach((a) => {
          const tr = document.createElement("tr");
          const quizTitle =
            quizzes.find((q) => q.id === a.quiz_id)?.title || a.quiz_id;
          const status = a.graded
            ? "Graded"
            : a.needs_grading
            ? "Needs Grading"
            : "Pending";
          tr.innerHTML = `
            <td>${displayStudent(a.user_id)}</td>
            <td>${quizTitle}</td>
            <td>${status}</td>
            <td>${a.score ?? "—"}</td>
            <td>${new Date(a.created_at).toLocaleString()}</td>`;
          tbody.appendChild(tr);
        });
    }

    // --- Charts ---
    if (typeof window.Chart === "undefined") return;
    const makeChart = (id, cfg) => {
      const ctx = byId(id)?.getContext("2d");
      if (ctx) new Chart(ctx, cfg);
    };

    // Quizzes over time
    const months = {};
    quizzes.forEach((q) => {
      const d = new Date(q.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      months[key] = (months[key] || 0) + 1;
    });
    const mKeys = Object.keys(months).sort();
    if (mKeys.length) {
      makeChart("tQuizzesOverTime", {
        type: "line",
        data: {
          labels: mKeys,
          datasets: [{ label: "Quizzes", data: mKeys.map((k) => months[k]) }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }

    // Attempts status
    makeChart("tAttemptStatus", {
      type: "pie",
      data: {
        labels: ["Graded", "Needs Grading"],
        datasets: [{ data: [gradedCount, pendingCount] }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });

    // Avg score per quiz
    const avgMap = {};
    attempts
      .filter((a) => a.graded && a.score != null)
      .forEach((a) => {
        (avgMap[a.quiz_id] = avgMap[a.quiz_id] || []).push(a.score);
      });
    const avgLabels = Object.keys(avgMap).map(
      (id) => quizzes.find((q) => q.id === id)?.title || id
    );
    const avgData = Object.values(avgMap).map(
      (arr) => arr.reduce((x, y) => x + y, 0) / arr.length
    );
    if (avgLabels.length) {
      makeChart("tAvgScore", {
        type: "bar",
        data: {
          labels: avgLabels,
          datasets: [{ label: "Avg Score", data: avgData }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }
  } catch (e) {
    console.error("Dashboard error:", e);
  }
})();
