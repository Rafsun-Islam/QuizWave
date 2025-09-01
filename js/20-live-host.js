// Live Host — timer-based flow, live stats, broadcast wakeups, speed-based scoring support.
// Uses: live_sessions.question_started_at + question_duration_seconds (added via SQL above)

(function () {
  const $ = (id) => document.getElementById(id);
  const log = (...a) => console.log("[HOST]", ...a);
  const DASHBOARD_URL = "teacher-dashboard.html";
  const params = new URLSearchParams(location.search);
  const QUIZ_ID = params.get("quiz");
  if (!QUIZ_ID) alert("Missing ?quiz=<uuid>");

  let session = null;
  let questions = [];
  let tickHandle = null;
  let statHandle = null; // refresh stats while question is open
  let bc = null; // broadcast channel

  const escapeHtml = (s) =>
    String(s ?? "").replace(
      /[&<>\"'\/]/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
          "/": "&#x2F;",
        }[ch])
    );
  const fmtSec = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60),
      s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const makePin = () => Math.floor(100000 + Math.random() * 900000).toString();
  const nowIso = () => new Date().toISOString();

  async function loadQuestions() {
    const { data, error } = await client
      .from("questions")
      .select("id,type,prompt,correct_answer,options,created_at")
      .eq("quiz_id", QUIZ_ID)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    questions = data || [];
    $("quizMeta").textContent = `${questions.length} questions`;
  }

  function setJoinMeta() {
    const base = location.origin + location.pathname.replace(/\/[^\/]+$/, "");
    const join = `${base}/live-join.html?pin=${session.pin}`;
    $("joinUrl").textContent = join;
    new QRious({ element: $("qr"), value: join, size: $("qr").width });
    $("pin").textContent = session.pin;
  }

  function showQuestion(i) {
    const q = questions[i];
    if (!q) {
      $("currentQ").textContent = "No question";
      $("qChoices").innerHTML = "";
      $("ansStats").textContent = "";
      return;
    }
    $("currentQ").textContent = `Q${i + 1}: ${
      q.type?.toUpperCase() || "MCQ"
    } — ${q.prompt}`;
    const letters = ["A", "B", "C", "D"];
    $("qChoices").innerHTML =
      q.type === "tf"
        ? [`True`, `False`]
            .map(
              (t, idx) =>
                `<div class="choice"><b>${
                  idx === 0 ? "T" : "F"
                }</b> — ${escapeHtml(t)}</div>`
            )
            .join("")
        : (Array.isArray(q.options) ? q.options.slice(0, 4) : [])
            .map(
              (t, idx) =>
                `<div class="choice"><b>${letters[idx]}</b> — ${escapeHtml(
                  t
                )}</div>`
            )
            .join("");
    $("ansStats").textContent = "No answers yet…";
  }

  async function refreshParticipants() {
    if (!session) return;
    const { data } = await client
      .from("live_participants")
      .select("id,nickname,joined_at")
      .eq("session_id", session.id)
      .order("joined_at", { ascending: true });
    $("plist").innerHTML = (data || [])
      .map((p) => `<li>${escapeHtml(p.nickname)}</li>`)
      .join("");
    $("pcount").textContent = (data || []).length;
  }

  function startStatLoop() {
    clearInterval(statHandle);
    statHandle = setInterval(updateAnswerStats, 1000); // once per second
  }
  function stopStatLoop() {
    clearInterval(statHandle);
    statHandle = null;
  }

  function startTimer(sec) {
    clearInterval(tickHandle);
    if (!sec || sec <= 0) {
      $("timer").textContent = "";
      return;
    }
    const end = Date.now() + sec * 1000;
    $("timer").textContent = `Time left: ${fmtSec(sec)}`;
    tickHandle = setInterval(async () => {
      const remain = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      $("timer").textContent = `Time left: ${fmtSec(remain)}`;
      if (remain <= 0) {
        clearInterval(tickHandle);
        stopStatLoop();
        await showTop5(); // auto leaderboard at end of timer
      }
    }, 250);
  }

  async function broadcast(event, payload = {}) {
    if (!bc) {
      bc = client.channel("live:" + session.id, {
        config: { broadcast: { self: false } },
      });
      await bc.subscribe();
    }
    await bc.send({ type: "broadcast", event, payload });
  }

  async function createSession() {
    try {
      $("createBtn").disabled = true;
      await loadQuestions();

      const { data: authData } = await client.auth.getUser();
      const hostId = authData?.user?.id;
      if (!hostId) {
        alert("Log in first — host insert/updates require auth.");
        $("createBtn").disabled = false;
        return;
      }

      const pin = makePin();
      const allowGuests = $("allowGuests")?.checked ?? true;

      const { data, error } = await client
        .from("live_sessions")
        .insert({
          quiz_id: QUIZ_ID,
          host_user: hostId,
          pin,
          status: "lobby",
          allow_guests: allowGuests,
        })
        .select("*")
        .single();
      if (error) throw error;

      session = data;
      $("sessionTitle").textContent = "Lobby — session created";
      setJoinMeta();
      $("startBtn").disabled = false;
      $("endBtn").disabled = false;

      // realtime for participants/answers
      const ch = client.channel("host:" + session.id);
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_participants",
          filter: `session_id=eq.${session.id}`,
        },
        refreshParticipants
      )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_answers",
            filter: `session_id=eq.${session.id}`,
          },
          updateAnswerStats
        )
        .subscribe();

      await refreshParticipants();
    } catch (e) {
      console.error(e);
      alert("Failed to create session: " + (e?.message || e));
      $("createBtn").disabled = false;
    }
  }

  async function startGame() {
    if (!session) return;
    if (!questions.length) {
      alert("No questions in this quiz.");
      return;
    }
    const dur = Number($("qSec").value || 20);

    const { error } = await client
      .from("live_sessions")
      .update({
        status: "in_progress",
        started_at: nowIso(),
        current_question_index: 0,
        question_started_at: nowIso(),
        question_duration_seconds: dur,
      })
      .eq("id", session.id);
    if (error) {
      alert("Start failed: " + error.message);
      return;
    }

    session.status = "in_progress";
    session.current_question_index = 0;
    session.question_started_at = new Date().toISOString();
    session.question_duration_seconds = dur;

    $("sessionTitle").textContent = "Game in progress";
    $("nextBtn").disabled = false;
    showQuestion(0);
    startTimer(dur);
    startStatLoop();
    await broadcast("started", {
      index: 0,
      startAt: session.question_started_at,
      duration: dur,
    });
    await updateAnswerStats();
  }

  async function nextQuestion() {
    if (!session) return;
    let i = Number(session.current_question_index || 0) + 1;
    if (i >= questions.length) {
      await endGame();
      return;
    }
    const dur = Number($("qSec").value || 20);

    const { error } = await client
      .from("live_sessions")
      .update({
        current_question_index: i,
        question_started_at: nowIso(),
        question_duration_seconds: dur,
      })
      .eq("id", session.id);
    if (error) {
      alert("Next failed: " + error.message);
      return;
    }
    session.current_question_index = i;
    session.question_started_at = new Date().toISOString();
    session.question_duration_seconds = dur;

    showQuestion(i);
    startTimer(dur);
    startStatLoop();
    await broadcast("question", {
      index: i,
      startAt: session.question_started_at,
      duration: dur,
    });
    await updateAnswerStats();
  }

  async function endGame(manual = false) {
    if (!session) return;
    const { error } = await client
      .from("live_sessions")
      .update({ status: "ended" })
      .eq("id", session.id);
    if (error) {
      alert("End failed: " + error.message);
      return;
    }

    session.status = "ended";
    $("sessionTitle").textContent = "Game ended";
    $("nextBtn").disabled = true;
    $("startBtn").disabled = true;
    clearInterval(tickHandle);
    stopStatLoop();

    await broadcast("ended", {});

    if (manual) {
      // Redirect only when the teacher manually ends the game
      location.href = DASHBOARD_URL;
      return;
    }

    // Auto-end (timer or no more questions) keeps host on results
    await showTop5();
  }

  async function updateAnswerStats() {
    if (!session) return;
    const idx = Number(session.current_question_index || 0);
    const q = questions[idx];
    if (!q) return;

    // Pull answers for current question and calc breakdown
    const { data, error } = await client
      .from("live_answers")
      .select("answer,is_correct")
      .eq("session_id", session.id)
      .eq("question_id", q.id);
    if (error) {
      console.error(error);
      return;
    }

    const total = data.length;
    const correct = data.filter((d) => d.is_correct).length;
    const wrong = total - correct;

    // choice breakdown
    const counts = new Map();
    data.forEach((r) =>
      counts.set(r.answer || "-", (counts.get(r.answer || "-") || 0) + 1)
    );
    const letters = ["A", "B", "C", "D", "true", "false"];
    const parts = letters
      .filter((k) => counts.get(k))
      .map((k) => `${k.toUpperCase()}: ${counts.get(k)}`);

    $("ansStats").textContent = total
      ? `Answers: ${total} — ✅ ${correct}, ❌ ${wrong} ${
          parts.length ? " — " + parts.join(" · ") : ""
        }`
      : "No answers yet…";
  }

  async function showTop5() {
    // cumulative top 5
    const { data, error } = await client
      .from("live_answers")
      .select("participant_id, points")
      .eq("session_id", session.id);
    if (error) {
      console.error(error);
      return;
    }
    if (!data?.length) {
      $(
        "board"
      ).innerHTML = `<div class="leaderboard"><h4>Leaderboard</h4><div class='live-muted'>No answers yet.</div></div>`;
      return;
    }

    const totals = new Map();
    data.forEach((r) =>
      totals.set(
        r.participant_id,
        (totals.get(r.participant_id) || 0) + Number(r.points || 0)
      )
    );

    const { data: ps } = await client
      .from("live_participants")
      .select("id,nickname")
      .eq("session_id", session.id);

    const rows = Array.from(totals.entries())
      .map(([pid, score]) => {
        const nick = ps?.find((p) => p.id === pid)?.nickname || "—";
        return { nick, score: Math.round(score) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    $("board").innerHTML = `<div class="leaderboard">
        <h4>Top 5</h4>
        <table>
          <thead><tr><th>#</th><th>Nickname</th><th>Score</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r, i) =>
                  `<tr class="row"><td>${i + 1}</td><td>${escapeHtml(
                    r.nick
                  )}</td><td>${r.score}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  $("createBtn").onclick = createSession;
  $("startBtn").onclick = startGame;
  $("nextBtn").onclick = nextQuestion;
  $("endBtn").onclick = () => endGame(true);

})();
