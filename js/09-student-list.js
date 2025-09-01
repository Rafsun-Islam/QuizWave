// ===== Student: list quizzes =====

async function loadStudentQuizzes() {
  const container = document.getElementById("quizList");
  if (!container) return;
  container.innerHTML = "Loading…";

  const { data: quizzes, error: qErr } = await client
    .from("quizzes")
    .select("id, title, description, time_limit, created_at")
    .eq("status", "Published")
    .order("created_at", { ascending: false });

  if (qErr) {
    console.error("[Student] loadStudentQuizzes error:", qErr);
    container.innerHTML = "Failed to load quizzes.";
    return;
  }
  if (!quizzes?.length) {
    container.innerHTML = `<div class="card">No published quizzes yet.</div>`;
    return;
  }

  container.innerHTML = quizzes
    .map((q) => {
      const title = q.title?.trim() ? q.title : "(untitled)";
      const desc = (q.description || "").trim();
      return `
      <div class="card">
        <h3>${escapeHtml(title)}</h3>
        ${desc ? `<p>${escapeHtml(desc)}</p>` : ""}
        <div class="small" style="opacity:.7">${displayTimeLimit(
          q.time_limit
        )}</div>
        <a class="btn" href="student-quiz.html?quiz=${q.id}">Take Quiz</a>
        <a class="btn" href="leaderboards.html?quiz=${
          q.id
        }" style="margin-left:8px">Leaderboard</a>
      </div>
    `;
    })
    .join("");
}

