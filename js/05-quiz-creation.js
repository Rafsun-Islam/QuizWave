// ===== Quiz Creation (uses quiz-level total_points only) =====
// Requires: 01-supabase-connection.js, 02-utils.js, 04-auth.js

function normStatus(s) {
  const x = (s || "").toLowerCase();
  return x === "published" ? "Published" : "Draft";
}

async function createQuiz(title, description, timeLimit, status) {
  try {
    // Must be logged in
    const { data: userRes, error: uErr } = await client.auth.getUser();
    if (uErr) throw uErr;
    const user = userRes?.user;
    if (!user) {
      alert("Not logged in!");
      window.location.href = "login.html";
      return;
    }

    // Optional: enforce role = teacher here (frontend guard)
    if (typeof getCurrentProfile === "function") {
      const prof = await getCurrentProfile();
      if (!prof || (prof.role || "").toLowerCase() !== "teacher") {
        alert("Only teachers can create quizzes.");
        window.location.href = "teacher-home.html";
        return;
      }
    }

    const cleanTitle = (title || "").trim();
    const cleanDesc = (description || "").trim();
    const cleanTime = Number(timeLimit || 0);
    const cleanStatus = normStatus(status);
    const cleanTotal = Math.max(
      1,
      toNumber(document.getElementById("totalPoints")?.value, 100)
    );

    if (!cleanTitle) {
      alert("Title is required.");
      return;
    }
    if (Number.isNaN(cleanTime) || cleanTime < 0) {
      alert("Invalid time limit.");
      return;
    }

    // IMPORTANT: created_by must equal auth.uid() for RLS to allow insert
    const payload = {
      title: cleanTitle,
      description: cleanDesc || null,
      time_limit: cleanTime,      // 0 for non-timed
      status: cleanStatus,        // "Draft" | "Published"
      total_points: cleanTotal,
      created_by: user.id,
    };

    const { data, error } = await client
      .from("quizzes")
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      console.error("[createQuiz] insert error:", error);
      alert("Failed to create quiz: " + (error.message || JSON.stringify(error)));
      return;
    }

    // Go to quiz detail
    window.location.href = `teacher-quiz-detail.html?quiz=${data.id}`;
  } catch (e) {
    console.error("[createQuiz] crashed:", e);
    alert("Unexpected error: " + (e.message || e));
  }
}

// Wire form
(function wireQuizForm() {
  document.addEventListener("DOMContentLoaded", async () => {
    // Optional: block non-teachers right away (UI guard)
    if (typeof requireLogin === "function") {
      await requireLogin("teacher"); // will redirect based on role if not teacher
    }

    const form = document.getElementById("quizForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await createQuiz(
        document.getElementById("title").value,
        document.getElementById("description").value,
        document.getElementById("timeLimit").value,
        document.getElementById("status").value
      );
    });
  });
})();
