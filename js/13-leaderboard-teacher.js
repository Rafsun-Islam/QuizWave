// ===== Teacher leaderboard (their quiz, students only, graded only) =====

async function loadTeacherLeaderboard(quizId) {
  const list = document.getElementById("teacherLeaderboard");
  if (!list) return;
  list.innerHTML = "Loading…";

  // Attempts only
  const { data: attempts, error: aErr } = await client
    .from("attempts")
    .select("user_id, score, created_at, needs_grading")
    .eq("quiz_id", quizId)
    .eq("needs_grading", false)
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(2000);

  if (aErr) {
    console.error("[TLB] attempts error:", aErr);
    list.innerHTML = "<li>Failed to load leaderboard.</li>";
    return;
  }
  if (!attempts?.length) {
    list.innerHTML = "<li>No student attempts yet.</li>";
    return;
  }

  // Profiles
  const userIds = [...new Set(attempts.map((a) => a.user_id).filter(Boolean))];
  let profileMap = {};
  if (userIds.length) {
    const { data: profiles, error: pErr } = await client
      .from("profiles")
      .select("id, name, role")
      .in("id", userIds);
    if (!pErr && profiles)
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  }

  const isStudent = (uid) =>
    String(profileMap[uid]?.role || "").toLowerCase() === "student";
  const rows = Object.keys(profileMap).length
    ? attempts.filter((a) => isStudent(a.user_id))
    : attempts;

  if (!rows.length) {
    list.innerHTML = "<li>No student attempts yet.</li>";
    return;
  }

  list.innerHTML = rows
    .map((r, i) => {
      const name = profileMap[r.user_id]?.name || "Student";
      return `<li>#${i + 1} — ${escapeHtml(name)} — ${r.score}%</li>`;
    })
    .join("");
}

