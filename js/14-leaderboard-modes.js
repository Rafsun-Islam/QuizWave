// ===== Best/Latest leaderboard mode (graded only) =====


async function loadLeaderboardWithMode(
  quizId,
  mode = "latest",
  targetId = "leaderboard"
) {
  const list = document.getElementById(targetId);
  if (!list) return;
  list.innerHTML = "Loading…";

  // Step 1: attempts only
  const { data: attempts, error: aErr } = await client
    .from("attempts")
    .select("user_id, score, created_at, needs_grading")
    .eq("quiz_id", quizId)
    .eq("needs_grading", false) // finalized only
    .order("created_at", { ascending: false })
    .limit(5000);

  if (aErr) {
    console.error("[LB mode] attempts error:", aErr);
    list.innerHTML = "<li>Failed to load leaderboard.</li>";
    return;
  }
  if (!attempts?.length) {
    list.innerHTML = "<li>No student attempts yet.</li>";
    return;
  }

  // Step 2: profiles for those users
  const userIds = [...new Set(attempts.map((a) => a.user_id).filter(Boolean))];
  let profileMap = {};
  if (userIds.length) {
    const { data: profiles, error: pErr } = await client
      .from("profiles")
      .select("id, name, role")
      .in("id", userIds);
    if (pErr) {
      console.warn(
        "[LB mode] profiles read failed, fallback to anonymous:",
        pErr.message
      );
    } else {
      profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    }
  }

  // Filter to students if we have profiles; otherwise fallback to all
  const isStudent = (uid) =>
    String(profileMap[uid]?.role || "").toLowerCase() === "student";
  const filtered = Object.keys(profileMap).length
    ? attempts.filter((a) => isStudent(a.user_id))
    : attempts;
  if (!filtered.length) {
    list.innerHTML = "<li>No student attempts yet.</li>";
    return;
  }

  // Group by user → pick best or latest
  const byUser = new Map();
  for (const a of filtered) {
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
    byUser.get(a.user_id).push(a);
  }

  const reduced = [];
  byUser.forEach((arr, uid) => {
    arr.sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    const latest = arr[0]?.score ?? 0;
    const best = arr.reduce((m, r) => Math.max(m, r.score || 0), 0);
    const base = mode === "best" ? best : latest;
    const badge = mode === "best" ? `Latest: ${latest}%` : `Best: ${best}%`;
    const name = profileMap[uid]?.name || "Student";
    reduced.push({ uid, name, score: base, badge });
  });

  reduced.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
   // Render: semantic rows with classes we can style
  list.innerHTML = reduced
    .map((row, i) => {
      const topClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      return `
        <li class="lb-row ${topClass}" data-rank="${i + 1}">
          <span class="rank">#${i + 1}</span>
          <span class="name">${escapeHtml(row.name)}</span>
          <span class="score"><strong>${row.score}%</strong></span>
          <span class="badge">${escapeHtml(row.badge)}</span>
        </li>
      `;
    })
    .join("");
}


