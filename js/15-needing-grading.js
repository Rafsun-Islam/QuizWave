// ===== Attempts needing grading (teacher) =====

async function loadAttemptsNeedingGrading(quizId) {
  const list = document.getElementById("attemptsNeedingGrading");
  if (!list) return;
  list.innerHTML = "Loading…";

  const { data, error } = await client
    .from("attempts")
    .select(
      `id, user_id, created_at, graded, needs_grading, user:profiles(id, name)`
    )
    .eq("quiz_id", quizId)
    .eq("needs_grading", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    list.innerHTML = "Failed to load attempts.";
    return;
  }
  if (!data?.length) {
    list.innerHTML = "<li>No attempts waiting for grading.</li>";
    return;
  }

  list.innerHTML = data
    .map(
      (a) => `
    <li>
      ${escapeHtml(a.user?.name || "Student")} — submitted ${formatTS(
        a.created_at
      )}
      <a class="btn" href="teacher-grade-attempt.html?attempt=${a.id}">Grade</a>
    </li>
  `
    )
    .join("");
}

