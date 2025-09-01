// ===== Teacher: Quiz Detail (view always; add only if Draft) =====

async function loadQuizDetail(quizId) {
  const header = document.getElementById("quizHeader");
  const list = document.getElementById("questionList");
  const addBox = document.getElementById("addBox");
  if (!header || !list) return;

  const { data: quiz, error: qErr } = await client
    .from("quizzes")
    .select(
      "id, title, description, status, time_limit, total_points, created_by, created_at"
    )
    .eq("id", quizId)
    .single();

  if (qErr || !quiz) {
    header.textContent = "Quiz not found.";
    list.textContent = "";
    if (addBox) addBox.style.display = "none";
    return;
  }

  const { data: auth } = await client.auth.getUser();
  if (!auth?.user?.id || auth.user.id !== quiz.created_by) {
    header.innerHTML = `<div class="card">You do not have access to this quiz.</div>`;
    list.textContent = "";
    if (addBox) addBox.style.display = "none";
    return;
  }

  header.innerHTML = `
    <h2 style="margin-top:0">${escapeHtml(quiz.title || "(untitled)")}</h2>
    ${quiz.description ? `<p>${escapeHtml(quiz.description)}</p>` : ""}
    <p class="small" style="opacity:.7">
      Status: <strong>${quiz.status}</strong> • ${displayTimeLimit(
    quiz.time_limit
  )} •
      Total marks: <strong>${quiz.total_points ?? 100}</strong>
    </p>
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <button class="btn" onclick="setQuizStatus('${quiz.id}','${
    quiz.status === "Draft" ? "Published" : "Draft"
  }',{refresh:'detail'})">
        ${quiz.status === "Draft" ? "Publish" : "Move to Draft"}
      </button>
      <a class="btn" href="teacher-home.html">Back to My Quizzes</a>
    </div>
  `;

  if (addBox) addBox.style.display = quiz.status === "Draft" ? "block" : "none";

  const { data: questions, error: qsErr } = await client
    .from("questions")
    .select("id, type, prompt, correct_answer, options, created_at")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (qsErr) {
    console.error("[quiz detail] questions error:", qsErr);
    list.textContent = "Failed to load questions.";
    return;
  }
  if (!questions?.length) {
    list.textContent = "No questions yet.";
    return;
  }

  list.innerHTML = questions
    .map(
      (q, i) => `
  <div class="card">
    <strong>Q${i + 1} — ${q.type.toUpperCase()}</strong>
    <div>${escapeHtml(q.prompt || "")}</div>
    ${
      Array.isArray(q.options) && q.options.length
        ? `<ol style="margin:6px 0 0 18px">${q.options
            .map((o) => `<li>${escapeHtml(String(o))}</li>`)
            .join("")}</ol>`
        : ""
    }
    ${
      q.correct_answer
        ? `<div class="small" style="opacity:.7">Correct: ${escapeHtml(
            String(q.correct_answer)
          )}</div>`
        : ""
    }
  </div>
`
    )
    .join("");


  await loadAttemptsNeedingGrading(quizId);
}

// BEFORE:
// async function addQuestionFromDetail(quizId, type, text, correct) {

// AFTER:
async function addQuestionFromDetail(quizId, type, text, correct, options = null) {
  const { data: quiz } = await client
    .from("quizzes")
    .select("status, created_by")
    .eq("id", quizId)
    .single();
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user?.id || auth.user.id !== quiz?.created_by)
    return alert("Only the owner can add questions.");
  if (quiz?.status !== "Draft")
    return alert("This quiz is Published. Move it to Draft to add questions.");

  // NEW: forward options to addQuestion
  await addQuestion(quizId, type, text, correct, options);
  await loadQuizDetail(quizId);
}
