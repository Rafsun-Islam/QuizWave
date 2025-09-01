// ===== Submit quiz (supports shuffled questions + shuffled MCQ options) =====
async function submitQuiz(quizId, opts = {}) {
  // Fetch quiz for totals
  const { data: quiz } = await client
    .from("quizzes")
    .select("id, total_points")
    .eq("id", quizId)
    .single();
  if (!quiz) {
    alert("Failed to fetch quiz.");
    return;
  }

  // Use the exact render state (order + MCQ mapping)
  const st = window.__QUIZ_STATE__;
  let questionRows = Array.isArray(st?.questions) ? st.questions : [];
  const choicesByIdx = st?.choices || {};

  if (!questionRows.length) {
    // Fallback fetch if somehow missing (no shuffle mapping for MCQ then)
    const { data: questions } = await client
      .from("questions")
      .select("id, type, prompt, correct_answer, options, created_at")
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: true });
    questionRows = questions || [];
  }

  const qCount = questionRows.length;
  if (!qCount) {
    alert("No questions in this quiz.");
    return;
  }

  const perQ = Number(quiz.total_points || 100) / qCount;

  const answersByQuestion = {};
  let hasEssay = false;
  let autoPoints = 0;

  questionRows.forEach((q, idx) => {
    if (q.type === "essay") {
      const el = document.querySelector(`[name="q${idx}"]`);
      const val = el ? String(el.value || "") : "";
      hasEssay = true;
      answersByQuestion[q.id] = { value: val, isEssay: true, points: null };
      return;
    }

    const sel = document.querySelector(`[name="q${idx}"]:checked`);
    const val = sel ? String(sel.value || "") : "";

    if (q.type === "tf") {
      const ok =
        val.toLowerCase() ===
        String(q.correct_answer || "")
          .trim()
          .toLowerCase();
      const pts = ok ? perQ : 0;
      autoPoints += pts;
      answersByQuestion[q.id] = {
        value: val.toLowerCase(),
        isEssay: false,
        points: pts,
      };
    } else if (q.type === "mcq") {
      // Use the shuffled choices mapping we stored during render
      const choices = choicesByIdx[idx] || [];
      const i = Number(val);
      const chosen = Number.isInteger(i) ? choices[i] : null;
      const isCorrect = !!(chosen && chosen.isCorrect);
      const pts = isCorrect ? perQ : 0;
      autoPoints += pts;

      // Store the displayed LETTER as the student's answer
      const letter = chosen?.label || "";
      answersByQuestion[q.id] = { value: letter, isEssay: false, points: pts };
    } else {
      // fallback to text comparison
      const el = document.querySelector(`[name="q${idx}"]`);
      const v = el ? String(el.value || "") : "";
      const ok =
        v.trim().toLowerCase() ===
        String(q.correct_answer || "")
          .trim()
          .toLowerCase();
      const pts = ok ? perQ : 0;
      autoPoints += pts;
      answersByQuestion[q.id] = { value: v, isEssay: false, points: pts };
    }
  });

  const { data: auth } = await client.auth.getUser();
  if (!auth?.user?.id) {
    alert("Not logged in.");
    return;
  }

  const raw_points = autoPoints;
  const max_points = Number(quiz.total_points || 100);
  const percent = Math.round((raw_points / max_points) * 100);

  const attemptPayload = {
    quiz_id: quizId,
    user_id: auth.user.id,
    score: percent,
    graded: !hasEssay,
    needs_grading: hasEssay,
    graded_at: !hasEssay ? new Date().toISOString() : null,
    raw_points,
    max_points,
  };

  const { data: attempt, error: aErr } = await client
    .from("attempts")
    .insert([attemptPayload])
    .select("id, graded, needs_grading")
    .single();
  if (aErr) {
    console.error("attempt insert error:", aErr);
    alert("Failed to save attempt.");
    return;
  }

  const answerRows = Object.entries(answersByQuestion).map(([qid, a]) => ({
    attempt_id: attempt.id,
    question_id: qid,
    answer: a.value, // "A|B|C|D" for MCQ, "true|false" for TF, text for essay
    is_correct: a.isEssay ? null : a.points > 0,
    points: a.points, // null for essays, numeric for auto
  }));
  const { error: insAnsErr } = await client
    .from("attempt_answers")
    .insert(answerRows);
  if (insAnsErr) {
    console.error("attempt_answers insert error:", insAnsErr);
    alert("Saved attempt, but failed to save answers.");
  }

  clearQuizTimer(quizId);

  if (hasEssay)
    alert(
      "Submitted! Your quiz includes essay questions. Final score will appear after grading."
    );
  else alert("Submitted! Your score has been recorded.");

  const params = new URLSearchParams({
    quiz: quizId,
    score: String(percent),
    graded: String(!hasEssay),
  });
  window.location.href = `student-results.html?${params.toString()}`;
}
