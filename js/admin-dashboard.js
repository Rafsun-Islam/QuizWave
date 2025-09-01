// js/admin-dashboard.js
// Admin Dashboard for QuizWave
// - Requires: @supabase/supabase-js v2, Chart.js, window.client (Supabase client)
// - Guards access: only logged-in admins (admin_users table) may view
// - Reads fast aggregates from views and base tables
// - Supports adding/removing admins via RPCs:
//     public.admin_add_admin_by_email(target_email, target_name?)
//     public.admin_remove_admin(target_user)

// ----------------------- helpers -----------------------
function $(sel) {
  return document.querySelector(sel);
}
function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v ?? "0";
}
function fmtDate(d) {
  try {
    return d ? new Date(d).toLocaleString() : "—";
  } catch {
    return "—";
  }
}

// Guard: require admin (uses requireAdmin if present; falls back to RPC)
async function guardAdmin() {
  if (typeof requireAdmin === "function") {
    const u = await requireAdmin();
    return u;
  }
  // Fallback: ensure logged in
  const { data } = await client.auth.getUser();
  const user = data?.user;
  if (!user) {
    location.href = "admin-login.html";
    return null;
  }
  // Ask server if admin
  const { data: isAdmin, error } = await client.rpc("admin_am_i");
  if (error) {
    console.error(error);
    alert("Unable to verify admin status.");
    location.href = "index.html";
    return null;
  }
  if (!isAdmin) {
    alert("Admins only.");
    location.href = "index.html";
    return null;
  }
  return user;
}

// Chart factory (simple)
function makeChart(ctxEl, type, labels, datasetLabel, data) {
  if (!ctxEl) return;
  new Chart(ctxEl, {
    type,
    data: {
      labels,
      datasets: [{ label: datasetLabel, data }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

// ----------------------- main -----------------------
(async function () {
  const me = await guardAdmin();
  if (!me) return;

  // Show "You are" chip
  try {
    const { data: myAdmin } = await client
      .from("admin_users")
      .select("name,email,user_id")
      .eq("user_id", me.id)
      .maybeSingle();
    if (myAdmin) {
      setText("youAre", `You: ${myAdmin.name || myAdmin.email || me.id}`);
    }
  } catch (e) {
    console.warn("could not fetch my admin row", e);
  }

  // ───────────────── KPIs from view v_admin_totals ─────────────────
  try {
    const { data: totals, error: tErr } = await client
      .from("v_admin_totals")
      .select("*")
      .single();
    if (tErr) throw tErr;

    setText("kTeachers", totals?.total_teachers);
    setText("kStudents", totals?.total_students);
    setText("kQuizzes", totals?.total_quizzes);
    setText("kAttempts", totals?.total_attempts);
    setText("kLiveAll", totals?.total_live_sessions_all);
    setText("kLiveActive", totals?.total_live_sessions_active);
    setText("kLiveParticipants", totals?.total_live_participants);
  } catch (e) {
    console.error("KPI load failed", e);
  }

  // ───────────────── Analytics ─────────────────
  // 1) Users growth by month: v_admin_users_by_month(month, users)
  try {
    const { data: usersByMonth } = await client
      .from("v_admin_users_by_month")
      .select("month, users");
    const labels = (usersByMonth || []).map((r) =>
      new Date(r.month).toISOString().slice(0, 7)
    );
    const series = (usersByMonth || []).map((r) => Number(r.users || 0));
    makeChart(
      document.getElementById("userGrowth"),
      "line",
      labels,
      "User Signups",
      series
    );
  } catch (e) {
    console.error("userGrowth chart failed", e);
  }

  // 2) Quizzes per teacher: v_admin_quizzes_per_teacher(teacher_id, quizzes_count)
  let teacherNames = {};
  try {
    const { data: qpt } = await client
      .from("v_admin_quizzes_per_teacher")
      .select("teacher_id, quizzes_count");
    const teacherIds = (qpt || []).map((r) => r.teacher_id).filter(Boolean);
    if (teacherIds.length) {
      const { data: trows } = await client
        .from("profiles")
        .select("id,name,username,email")
        .in("id", teacherIds);
      (trows || []).forEach((t) => {
        teacherNames[t.id] = t.name || t.username || t.email || t.id;
      });
    }
    const labels = (qpt || []).map(
      (r) => teacherNames[r.teacher_id] || r.teacher_id || "—"
    );
    const series = (qpt || []).map((r) => Number(r.quizzes_count || 0));
    makeChart(
      document.getElementById("quizByTeacher"),
      "bar",
      labels,
      "Quizzes",
      series
    );
  } catch (e) {
    console.error("quizByTeacher chart failed", e);
  }

  // 3) Attempts per student (top 10): v_admin_attempts_per_student(user_id, attempts_count)
  try {
    const { data: aps } = await client
      .from("v_admin_attempts_per_student")
      .select("user_id, attempts_count");
    const top = (aps || [])
      .sort((a, b) => Number(b.attempts_count) - Number(a.attempts_count))
      .slice(0, 10);
    const studentIds = top.map((r) => r.user_id).filter(Boolean);
    let studentNames = {};
    if (studentIds.length) {
      const { data: srows } = await client
        .from("profiles")
        .select("id,name,username,email")
        .in("id", studentIds);
      (srows || []).forEach((s) => {
        studentNames[s.id] = s.name || s.username || s.email || s.id;
      });
    }
    const labels = top.map((r) => studentNames[r.user_id] || r.user_id || "—");
    const series = top.map((r) => Number(r.attempts_count || 0));
    makeChart(
      document.getElementById("attemptsByStudent"),
      "bar",
      labels,
      "Submissions",
      series
    );
  } catch (e) {
    console.error("attemptsByStudent chart failed", e);
  }

  // ───────────────── Tables ─────────────────
  // Users (latest 50)
  try {
    const { data: users } = await client
      .from("profiles")
      .select("id,name,username,email,role,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const tbody = $("#usersTable tbody");
    if (tbody) {
      tbody.innerHTML = "";
      (users || []).forEach((u) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${u.name || u.username || "—"}</td>
          <td><span class="chip">${u.role || "—"}</span></td>
          <td>${u.email || "—"}</td>
          <td>${fmtDate(u.created_at)}</td>`;
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    console.error("usersTable failed", e);
  }

  // Quizzes (latest 50) — robust owner detection with admin RPC fallback
  try {
    const tbody = $("#quizzesTable tbody");
    if (!tbody) throw new Error("#quizzesTable tbody not found");
    tbody.innerHTML = "";

    let quizzes = [];
    let ownerField = "created_by";
    let firstErr = null;

    // Try created_by first
    let q1 = await client
      .from("quizzes")
      .select("id,title,created_by,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (q1.error) {
      firstErr = q1.error;
    } else {
      quizzes = q1.data || [];
    }

    // If no rows, try teacher_id (older schemas)
    if (!quizzes.length) {
      const q2 = await client
        .from("quizzes")
        .select("id,title,teacher_id,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!q2.error && (q2.data || []).length) {
        quizzes = q2.data || [];
        ownerField = "teacher_id";
      }
    }

    // If still empty OR had recursion error, fall back to admin RPC
    if (
      !quizzes.length ||
      (firstErr && /stack depth/i.test(firstErr.message || ""))
    ) {
      const { data: rpcRows, error: rpcErr } = await client.rpc(
        "admin_list_quizzes",
        { max_rows: 50 }
      );
      if (rpcErr) throw rpcErr;
      // Normalize to same shape (owner -> created_by)
      quizzes = (rpcRows || []).map((r) => ({
        id: r.id,
        title: r.title,
        created_by: r.owner,
        created_at: r.created_at,
      }));
      ownerField = "created_by";
    }

    // Map owner ids to names (best-effort; table still renders if this fails)
    const ids = Array.from(
      new Set(quizzes.map((q) => q?.[ownerField]).filter(Boolean))
    );
    const names = {};
    if (ids.length) {
      try {
        const { data: profs } = await client
          .from("profiles")
          .select("id,name,username,email")
          .in("id", ids);
        (profs || []).forEach((p) => {
          names[p.id] = p.name || p.username || p.email || p.id;
        });
      } catch (_) {
        /* ignore name lookup errors */
      }
    }

    if (!quizzes.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" class="muted">No quizzes found${
        firstErr ? ` (${firstErr.message})` : ""
      }</td>`;
      tbody.appendChild(tr);
    } else {
      quizzes.forEach((q) => {
        const ownerId = q?.[ownerField];
        const owner = ownerId ? names[ownerId] || ownerId : "—";
        const tr = document.createElement("tr");
        tr.innerHTML = `
        <td>${q.title || "—"}</td>
        <td>${owner}</td>
        <td>${fmtDate(q.created_at)}</td>`;
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    console.error("quizzesTable failed", e);
  }

  // Live sessions (recent 50) with participants: v_admin_live_participants_per_session
  try {
    const { data: liveRows } = await client
      .from("v_admin_live_participants_per_session")
      .select("session_id, quiz_id, status, started_at, participants_count")
      .order("started_at", { ascending: false })
      .limit(50);
    const qids = Array.from(
      new Set((liveRows || []).map((r) => r.quiz_id).filter(Boolean))
    );
    const quizNames = {};
    if (qids.length) {
      const { data: qrows } = await client
        .from("quizzes")
        .select("id,title")
        .in("id", qids);
      (qrows || []).forEach((q) => {
        quizNames[q.id] = q.title || q.id;
      });
    }
    const tbody = $("#liveTable tbody");
    if (tbody) {
      tbody.innerHTML = "";
      (liveRows || []).forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><code>${String(r.session_id || "").slice(0, 8)}…</code></td>
          <td>${quizNames[r.quiz_id] || r.quiz_id || "—"}</td>
          <td>${r.status || "—"}</td>
          <td>${Number(r.participants_count || 0)}</td>
          <td>${fmtDate(r.started_at)}</td>`;
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    console.error("liveTable failed", e);
  }

  // ───────────────── Admin management ─────────────────
  async function reloadAdmins() {
    try {
      const { data: admins } = await client
        .from("admin_users")
        .select("user_id,name,email,created_at,created_by")
        .order("created_at", { ascending: false });
      const tbody = $("#adminsTable tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      (admins || []).forEach((a) => {
        const isSelf = a.user_id === me.id;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${a.name || "—"}</td>
          <td>${a.email || a.user_id}</td>
          <td>${fmtDate(a.created_at)}</td>
          <td class="actions">
            <button class="btn btn-sm" data-action="remove" data-user="${
              a.user_id
            }">
              ${isSelf ? "Remove (me)" : "Remove"}
            </button>
          </td>`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error("reloadAdmins failed", e);
    }
  }
  await reloadAdmins();

  // Add admin by email (calls RPC)
  const addBtn = document.getElementById("addAdminBtn");
  if (addBtn) {
    addBtn.onclick = async () => {
      const email = (document.getElementById("adminEmail")?.value || "").trim();
      const name = (document.getElementById("adminName")?.value || "").trim();
      if (!email) return;
      try {
        const { error } = await client.rpc("admin_add_admin_by_email", {
          target_email: email,
          target_name: name || null,
        });
        if (error) throw error;
        document.getElementById("adminEmail").value = "";
        document.getElementById("adminName").value = "";
        await reloadAdmins();
        alert("Admin added.");
      } catch (e) {
        alert(e?.message || String(e));
      }
    };
  }

  // Remove admin (calls RPC) — includes self (will redirect after)
  const adminsTable = document.getElementById("adminsTable");
  if (adminsTable) {
    adminsTable.addEventListener("click", async (e) => {
      const btn = e.target.closest('[data-action="remove"]');
      if (!btn) return;
      const target = btn.getAttribute("data-user");
      if (!target) return;
      if (!confirm("Remove this admin?")) return;
      try {
        const { error } = await client.rpc("admin_remove_admin", {
          target_user: target,
        });
        if (error) throw error;
        if (target === me.id) {
          alert("You removed your own admin access.");
          location.href = "index.html";
          return;
        }
        await reloadAdmins();
      } catch (err) {
        alert(err?.message || String(err));
      }
    });
  }
})();
