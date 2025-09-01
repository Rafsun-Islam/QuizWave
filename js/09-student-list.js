// ===== Student: list quizzes (styled to match css/student-home.css) =====
async function loadStudentQuizzes() {
  const host = document.getElementById("quizList");
  if (!host) return;
  host.innerHTML = "Loading…";

  // Fetch published quizzes, newest first
  const { data: quizzes, error } = await client
    .from("quizzes")
    .select("id, title, description, time_limit, created_at")
    .eq("status", "Published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Student] loadStudentQuizzes:", error);
    host.innerHTML = `<div class="card">Failed to load quizzes.</div>`;
    return;
  }

  // Empty state
  if (!quizzes?.length) {
    host.innerHTML = `
      <section class="section">
        <h3>Available Quizzes</h3>
        <div id="availableQuizzesList">
          <div class="card" style="text-align:left">
            <h3>No published quizzes yet</h3>
            <p class="muted">Please check back later or ask your teacher to publish a quiz.</p>
          </div>
        </div>
      </section>`;
    return;
  }

  // Helpers
  const displayTimeLimit = (mins) => {
    if (!mins || Number(mins) <= 0) return "No time limit";
    const m = Number(mins);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60),
      r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  };
  const fmtDate = (d) => {
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return "";
    }
  };

  // Build cards your CSS can style
  const cards = quizzes
    .map((q) => {
      const title = (q.title || "(untitled)").trim();
      const desc = (q.description || "").trim();
      const time = displayTimeLimit(q.time_limit);
      const date = fmtDate(q.created_at);

      return `
      <article class="quiz-card">
        <h3 class="title">${escapeHtml(title)}</h3>
        ${desc ? `<p class="muted">${escapeHtml(desc)}</p>` : ""}
        <div class="meta-chips">
          <span class="chip soft">⏱ ${escapeHtml(time)}</span>
          <span class="chip">📅 ${escapeHtml(date)}</span>
        </div>
        <div class="actions spaced">
          <a class="btn primary" href="student-quiz.html?quiz=${
            q.id
          }">Take Quiz</a>
          <a class="btn ghost" href="leaderboards.html?quiz=${
            q.id
          }">Leaderboard</a>
        </div>
      </article>
    `;
    })
    .join("");

  // Inject sections/containers your CSS targets (inside #quizList)
  host.innerHTML = `
    <section class="section">
      <h3>Available Quizzes</h3>
      <div id="availableQuizzesList">
        ${cards}
      </div>
    </section>
  `;

  // (Optional) If you later add "In Progress", render as:
  // host.innerHTML += `
  //   <section class="section">
  //     <h3>Continue</h3>
  //     <div id="inProgressList"> … </div>
  //   </section>
  // `;
}
