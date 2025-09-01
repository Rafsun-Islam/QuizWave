// ===== Teacher: My Quizzes list + Draft/Publish toggle + Delete =====

async function loadMyQuizzes() {
  const list = document.getElementById("myQuizzes");
  if (!list) return;
  list.innerHTML = "Loading…";

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    list.innerHTML = "Please log in.";
    return;
  }

  const { data, error } = await client
    .from("quizzes")
    .select("id, title, description, time_limit, status, created_at")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = "Failed to load.";
    return;
  }
  if (!data?.length) {
    list.innerHTML = `<div class="card">No quizzes yet.</div>`;
    return;
  }

  list.innerHTML = data
    .map((q) => {
      const nextStatus = q.status === "Draft" ? "Published" : "Draft";
      return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <h3 style="margin:0">${escapeHtml(q.title || "(untitled)")}</h3>
            ${
              q.description
                ? `<div class="small" style="opacity:.7">${escapeHtml(
                    q.description
                  )}</div>`
                : ""
            }
            <div class="small" style="margin-top:6px">
              Status: <strong>${q.status}</strong> • ${displayTimeLimit(
        q.time_limit
      )}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <a class="btn" href="teacher-quiz-detail.html?quiz=${q.id}">View</a>
            <button class="btn" onclick="setQuizStatus('${
              q.id
            }','${nextStatus}',{refresh:'list'})">
              ${q.status === "Draft" ? "Publish" : "Move to Draft"}
            </button>
            <button class="btn" style="background:#dc3545" onclick="deleteQuiz('${
              q.id
            }')">Delete</button>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}
async function setQuizStatus(quizId, status, opts = {}) {
  try {
    const s = normStatus(status);
    if (s !== "Draft" && s !== "Published") {
      alert("Status must be Draft or Published.");
      return null;
    }
    const { data, error } = await client
      .from("quizzes")
      .update({ status: s })
      .eq("id", quizId)
      .select("id, status")
      .single();
    if (error) {
      console.error("setQuizStatus error:", error);
      alert(
        "Failed to update status: " + (error.message || JSON.stringify(error))
      );
      return null;
    }
    if (opts.refresh === "list" && typeof loadMyQuizzes === "function")
      await loadMyQuizzes();
    if (opts.refresh === "detail" && typeof loadQuizDetail === "function")
      await loadQuizDetail(quizId);
    return data;
  } catch (e) {
    console.error("setQuizStatus crashed:", e);
    alert("Unexpected error: " + e.message);
    return null;
  }
}
async function deleteQuiz(quizId) {
  const ok = confirm(
    "Delete this quiz? This will also remove its questions and attempts. This cannot be undone."
  );
  if (!ok) return;
  const { error } = await client.from("quizzes").delete().eq("id", quizId);
  if (error) {
    console.error("deleteQuiz error:", error);
    return alert(
      "Failed to delete: " + (error.message || JSON.stringify(error))
    );
  }
  await loadMyQuizzes();
  alert("Quiz deleted.");
}

