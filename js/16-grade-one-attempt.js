// ===== Grade one attempt (teacher) — per-question max derived from quiz.total_points / #questions =====

async function loadAttemptForGrading(attemptId) {
  const container = document.getElementById("gradeContainer");
  if (!container) return;

  // Attempt + quiz (need total_points) + student
  const { data: attempt, error: aErr } = await client
    .from("attempts")
    .select(
      `id, quiz_id, user_id, created_at, score, graded, needs_grading,
      user:profiles(id, name),
      quiz:quizzes(id, title, created_by, total_points)
    `
    )
    .eq("id", attemptId)
    .single();
  if (aErr || !attempt) {
    container.innerHTML = "Attempt not found.";
    return;
  }

  // Owner-only in UI
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user?.id || auth.user.id !== attempt.quiz.created_by) {
    container.innerHTML = "You do not have access to grade this attempt.";
    return;
  }

  // Answers + question info (to know how many questions exist in the attempt)
  const { data: answers, error: ansErr } = await client
    .from("attempt_answers")
    .select(
      "id, question_id, answer, is_correct, points, question:questions(id, type, prompt)"
    )
    .eq("attempt_id", attemptId)
    .order("created_at", { ascending: true });
  if (ansErr) {
    container.innerHTML = "Failed to load answers.";
    return;
  }

  const qCount = answers.length || 1;
  const total = Number(attempt.quiz.total_points || 100);
  const perQ = total / qCount;

  container.innerHTML = `
    <h3>${escapeHtml(attempt.quiz.title || "Quiz")}</h3>
    <p>Student: <strong>${escapeHtml(
      attempt.user?.name || "Student"
    )}</strong> • Submitted: ${formatTS(attempt.created_at)}</p>
    <p class="small" style="opacity:.7">Total marks: ${total} • Questions: ${qCount} • Per question: ${perQ}</p>
    <div id="gradeList"></div>
    <div style="margin-top:12px">
      <button class="btn" id="saveGradesBtn">Save Grades</button>
      <a class="btn ghost" href="teacher-quiz-detail.html?quiz=${
        attempt.quiz_id
      }">Back</a>
    </div>
  `;

  const list = document.getElementById("gradeList");
  list.innerHTML = answers
    .map((row, i) => {
      const isEssay = row.question.type === "essay";
      if (!isEssay) {
        // Auto-graded: show awarded points (0 or perQ) read-only
        const pts = toNumber(row.points, 0);
        return `
        <div class="card">
          <strong>Q${i + 1}</strong> — ${escapeHtml(row.question.prompt)}
          <div class="small" style="opacity:.7">Auto-graded: ${
            pts > 0 ? "Correct" : "Incorrect"
          } • Points: ${pts}/${perQ}</div>
          <div class="small">Student answer: ${escapeHtml(
            row.answer || ""
          )}</div>
        </div>
      `;
      }
      // Essay → teacher can give 0..perQ
      const val = row.points == null ? "" : String(row.points);
      return `
      <div class="card">
        <strong>Q${i + 1} (Essay)</strong> — ${escapeHtml(row.question.prompt)}
        <div class="small">Student answer:</div>
        <div style="white-space:pre-wrap; border:1px solid #eee; padding:8px; border-radius:8px; margin-top:6px">${escapeHtml(
          row.answer || ""
        )}</div>
        <div style="margin-top:8px">
          <label>Points (0–${perQ}): </label>
          <input class="input" type="number" step="0.1" min="0" max="${perQ}" data-aaid="${
        row.id
      }" value="${val}">
        </div>
      </div>
    `;
    })
    .join("");

  // Save handler (clamp to 0..perQ, recompute percent out of quiz.total_points)
  document
    .getElementById("saveGradesBtn")
    .addEventListener("click", async () => {
      // Update essay rows only
      const inputs = Array.from(document.querySelectorAll("input[data-aaid]"));
      for (const inp of inputs) {
        const aaid = inp.getAttribute("data-aaid");
        let points = inp.value === "" ? null : Number(inp.value);
        if (points != null) {
          if (isNaN(points)) {
            alert("Points must be a number.");
            return;
          }
          points = Math.max(0, Math.min(perQ, points)); // clamp to perQ
        }
        const { error: upErr } = await client
          .from("attempt_answers")
          .update({ points })
          .eq("id", aaid);
        if (upErr) {
          alert("Failed to save a grade: " + upErr.message);
          return;
        }
      }

      // Re-fetch all answers to sum points
      const { data: gradedRows, error: grErr } = await client
        .from("attempt_answers")
        .select("points")
        .eq("attempt_id", attemptId);
      if (grErr) {
        alert("Failed to recompute totals: " + grErr.message);
        return;
      }

      let sumPts = 0;
      (gradedRows || []).forEach((r) => {
        if (r.points != null) sumPts += Number(r.points);
      });

      const percent = total > 0 ? Math.round((sumPts / total) * 100) : 0;

      const { error: attErr } = await client
        .from("attempts")
        .update({
          score: percent,
          raw_points: sumPts,
          max_points: total, // always quiz total
          graded: true,
          needs_grading: false,
          graded_at: new Date().toISOString(),
        })
        .eq("id", attemptId);

      if (attErr) {
        alert("Failed to finalize attempt: " + attErr.message);
        return;
      }

      alert(`Grades saved. Final: ${sumPts}/${total} (${percent}%).`);
      window.location.href = `teacher-quiz-detail.html?quiz=${attempt.quiz_id}`;
    });
}

