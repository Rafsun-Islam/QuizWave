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
  body.innerHTML = "Loading…";

  // fetch quiz (incl total_points)
  const { data: quiz, error: qErr } = await client
    .from("quizzes")
    .select(
      "id, title, description, status, time_limit, total_points, created_by"
    )
    .eq("id", quizId)
    .single();
  if (qErr || !quiz) {
    body.innerHTML = `<div class="card">Quiz not found.</div>`;
    return;
  }

  const { data: auth } = await client.auth.getUser();
  const isOwner = !!(auth?.user?.id && auth.user.id === quiz.created_by);
  if (quiz.status !== "Published" && !isOwner) {
    body.innerHTML = `<div class="card">This quiz is not published yet.</div>`;
    return;
  }

  // Fetch questions (INCLUDE options)
  const { data: questions, error: qsErr } = await client
    .from("questions")
    .select("id, type, prompt, correct_answer, options, created_at")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (qsErr) {
    console.error("[student quiz] questions error:", qsErr);
    body.innerHTML = `<div class="card">Couldn't load questions.</div>`;
    return;
  }

  const title = escapeHtml(quiz.title || "(untitled)");
  const desc = escapeHtml(quiz.description || "");
  body.innerHTML = `
    <h2>${title}</h2>
    ${desc ? `<p>${desc}</p>` : ""}
    <p class="small" style="opacity:.7">${displayTimeLimit(quiz.time_limit)}</p>
    <div id="timer" class="small" style="margin-bottom:10px;"></div>
  `;

  if (!questions?.length) {
    body.innerHTML += `<div class="card">No questions added yet.</div>`;
    return;
  }

  // Shuffle the question order
  const shuffled = shuffleArray([...questions]);

  // Keep full render state (including shuffled MCQ choices) for submit()
  const letters = ["A", "B", "C", "D"];
  const state = { quizId, questions: shuffled, choices: {} };

  // Render questions
  shuffled.forEach((q, idx) => {
    let html = `<div class="card"><h3>Q${idx + 1}</h3><p>${escapeHtml(
      q.prompt || ""
    )}</p>`;

    if (q.type === "tf") {
      html += `
        <label><input type="radio" name="q${idx}" value="true"> True</label><br>
        <label><input type="radio" name="q${idx}" value="false"> False</label>
      `;
    } else if (q.type === "mcq") {
      const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      if (opts.length < 2) {
        html += `<div class="muted">No options available for this MCQ.</div>`;
      } else {
        // Find the correct option's ORIGINAL index using the stored letter (or text fallback)
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
        if (correctIdx < 0) correctIdx = 0; // safe default

        // Build choice objects, then shuffle them
        let choices = opts.map((text, i) => ({
          text: String(text),
          isCorrect: i === correctIdx,
        }));
        choices = shuffleArray(choices);
        // Assign display letters AFTER shuffle & store mapping for submit()
        choices.forEach((c, i) => {
          c.label = letters[i];
        });
        state.choices[idx] = choices;

        html += choices
          .map(
            (c, i) => `
          <label>
            <input type="radio" name="q${idx}" value="${i}">
            ${c.label}. ${escapeHtml(c.text)}
          </label><br>
        `
          )
          .join("");
      }
    } else {
      // essay
      html += `<textarea class="input" name="q${idx}" rows="4" placeholder="Your answer"></textarea>`;
    }

    html += `</div>`;
    body.innerHTML += html;
  });

  body.innerHTML += `<button class="btn" onclick="submitQuiz('${quizId}')">Submit</button>`;

  // Save state for submit()
  window.__QUIZ_STATE__ = state;

  startQuizTimer(quizId, quiz.time_limit, () => {
    alert("Time’s up! Auto-submitting your quiz.");
    submitQuiz(quizId, { auto: true });
  });
}
