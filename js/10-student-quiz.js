// ===== Student: take quiz (random order + shuffled MCQ options; radios for MCQ/TF) =====
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadQuizForStudent(quizId) {
  const body =
    document.getElementById("quizBody") ||
    document.getElementById("quizContainer");
  if (!body) {
    console.error("Missing #quizBody / #quizContainer");
    return;
  }

  // Constrain page width using your base.css .container rule
  const mainEl = document.getElementById("quizContainer");
  if (mainEl && !mainEl.classList.contains("container")) {
    mainEl.classList.add("container");
  }

  // Fetch quiz
  const { data: quiz, error: qErr } = await client
    .from("quizzes")
    .select(
      "id, title, description, status, created_by, time_limit, total_points"
    )
    .eq("id", quizId)
    .single();
  if (qErr || !quiz) {
    body.innerHTML = `<div class="card"><div class="container">Quiz not found.</div></div>`;
    return;
  }

  const { data: auth } = await client.auth.getUser();
  const isOwner = !!(auth?.user?.id && auth.user.id === quiz.created_by);
  if (quiz.status !== "Published" && !isOwner) {
    body.innerHTML = `<div class="card"><div class="container">This quiz is not published yet.</div></div>`;
    return;
  }

  // Fetch questions
  const { data: questions, error: qsErr } = await client
    .from("questions")
    .select("id, type, prompt, correct_answer, options, created_at")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (qsErr) {
    console.error("[student quiz] questions error:", qsErr);
    body.innerHTML = `<div class="card"><div class="container">Couldn't load questions.</div></div>`;
    return;
  }

  const title = escapeHtml(quiz.title || "(untitled)");
  const desc = escapeHtml(quiz.description || "");

  // Header block (keeps your existing timer element in HTML)
  body.innerHTML = `
    <div class="card">
      <div class="container" style="text-align:left">
        <h2>${title}</h2>
        ${desc ? `<p class="muted">${desc}</p>` : ""}
      </div>
    </div>
  `;

  if (!questions?.length) {
    body.innerHTML += `<div class="card"><div class="container">No questions added yet.</div></div>`;
    return;
  }

  // Shuffle question order; track render state for submit()
  const shuffled = shuffleArray([...questions]);
  const letters = ["A", "B", "C", "D"];
  const state = { quizId, questions: shuffled, choices: {} };

  // Render questions (emit markup that matches student-quiz.css)
  shuffled.forEach((q, idx) => {
    let card = `<div class="card"><div class="container" style="text-align:left">`;
    card += `<div class="question-header"><h3>Q${idx + 1}</h3></div>`;
    card += `<div class="question-stem"><p>${escapeHtml(
      q.prompt || ""
    )}</p></div>`;

    if (q.type === "tf") {
      // True / False block
      card += `<div class="options">`;
      card += `
        <label class="option">
          <input type="radio" name="q${idx}" value="true">
          <span class="badge">T</span>
          <span class="label">True</span>
        </label>
        <label class="option">
          <input type="radio" name="q${idx}" value="false">
          <span class="badge">F</span>
          <span class="label">False</span>
        </label>
      `;
      card += `</div>`;
    } else if (q.type === "mcq") {
      const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      if (opts.length < 2) {
        card += `<div class="muted">No options available for this MCQ.</div>`;
      } else {
        // Determine correct option by letter OR text, then shuffle
        let correctIdx = -1;
        if (/^[A-Da-d]$/.test(String(q.correct_answer || ""))) {
          correctIdx = letters.indexOf(String(q.correct_answer).toUpperCase());
        } else {
          const needle = String(q.correct_answer || "")
            .trim()
            .toLowerCase();
          correctIdx = opts.findIndex(
            (o) => String(o).trim().toLowerCase() === needle
          );
        }
        if (correctIdx < 0) correctIdx = 0;

        let choices = opts.map((text, i) => ({
          text: String(text),
          isCorrect: i === correctIdx,
        }));
        choices = shuffleArray(choices);
        choices.forEach((c, i) => (c.label = letters[i]));
        state.choices[idx] = choices;

        // Emit .options + label.option rows that your CSS styles
        card += `<div class="options">`;
        card += choices
          .map(
            (c, i) => `
              <label class="option">
                <input type="radio" name="q${idx}" value="${i}">
                <span class="badge">${c.label}</span>
                <span class="label">${escapeHtml(c.text)}</span>
              </label>
            `
          )
          .join("");
        card += `</div>`;
      }
    } else {
      // Essay
      card += `<textarea class="input" name="q${idx}" rows="4" placeholder="Your answer"></textarea>`;
    }

    card += `</div></div>`; // close .container + .card
    body.innerHTML += card;
  });

  // Footer actions (uses your .btn styles; .quiz-actions class is optional)
  body.innerHTML += `
    <div class="quiz-footer">
      <div class="container">
        <div class="quiz-actions">
          <button class="btn primary" onclick="submitQuiz('${quizId}')">Submit</button>
        </div>
      </div>
    </div>
  `;

  // Save state for submit(); keep your timer behavior
  window.__QUIZ_STATE__ = state;

  startQuizTimer(quizId, quiz.time_limit, () => {
    alert("Time’s up! Auto-submitting your quiz.");
    submitQuiz(quizId, { auto: true });
  });
}
