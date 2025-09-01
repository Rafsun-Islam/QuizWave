// ===== Simple leaderboard (graded only, students only) =====

async function loadLeaderboard(quizId) {
  const list = document.getElementById("leaderboard");
  if (!list) return;
  list.innerHTML = "Loading…";

  // Step 1: attempts only (no join)
  const { data: attempts, error: aErr } = await client
    .from("attempts")
    .select("user_id, score, created_at, needs_grading")
    .eq("quiz_id", quizId)
    .eq("needs_grading", false) // finalized only
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(2000);

  if (aErr) {
    console.error("[LB] attempts error:", aErr);
    list.innerHTML = "<li>Failed to load leaderboard.</li>";
    return;
  }
  if (!attempts?.length) {
    list.innerHTML = "<li>No student attempts yet.</li>";
    return;
  }

  // Step 2: fetch profiles for those users
  const userIds = [...new Set(attempts.map((a) => a.user_id).filter(Boolean))];
  let profileMap = {};
  if (userIds.length) {
    const { data: profiles, error: pErr } = await client
      .from("profiles")
      .select("id, name, role")
      .in("id", userIds);

    if (pErr) {
      console.warn(
        "[LB] profiles read failed, fallback to anonymous:",
        pErr.message
      );
    } else {
      profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    }
  }

  // Filter to students (case-insensitive); fallback: if we can’t read profiles at all, show everyone
  const asStudent = (uid) => {
    const role = String(profileMap[uid]?.role || "").toLowerCase();
    return role === "student";
  };
  const rows = Object.keys(profileMap).length
    ? attempts.filter((a) => asStudent(a.user_id))
    : attempts;

  if (!rows.length) {
    list.innerHTML = "<li>No student attempts yet.</li>";
    return;
  }

  // Render
  list.innerHTML = rows
    .map((row, i) => {
      const prof = profileMap[row.user_id];
      const name = prof?.name ? prof.name : "Student";
      return `<li>#${i + 1} — ${escapeHtml(name)} — ${row.score}%</li>`;
    })
    .join("");
}

