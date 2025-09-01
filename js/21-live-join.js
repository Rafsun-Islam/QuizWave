// Live Join — stable radios + one-answer-only + speed-based points.
// Reads session.question_started_at & question_duration_seconds for timing.

(function () {
  const $ = (id) => document.getElementById(id);
  const LOBBY_SET = new Set(["lobby"]);
  const PLAY_SET = new Set(["in_progress", "paused"]);

  let session = null;
  let participant = null;
  let channel = null; // table changes
  let bc = null; // broadcast
  let pollHandle = null;

  let questions = [];
  let hasLoadedQuestions = false;
  let lastRenderedIndex = null;
  let answeredThisQuestion = false;

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
  const normalize = (v) =>
    String(v ?? "")
      .trim()
      .toLowerCase();

  const params = new URLSearchParams(location.search);
  const pinFromUrl = params.get("pin");
  if (pinFromUrl) $("pinInput").value = pinFromUrl;

  function setJoinMsg(s) {
    $("joinMsg").textContent = s || "";
  }

  async function findSessionByPin(pin) {
    const { data, error } = await client
      .from("live_sessions")
      .select(
        "id,quiz_id,status,current_question_index,allow_guests,question_started_at,question_duration_seconds,created_at"
      )
      .eq("pin", pin)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }

  async function loadQuestions(quizId) {
    const { data, error } = await client
      .from("questions")
      .select("id,type,prompt,options,correct_answer,created_at")
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    questions = data || [];
    hasLoadedQuestions = true;
  }

  async function ensureQuestionsLoadedIfPlayable() {
    if (hasLoadedQuestions) return;
    if (!session || !PLAY_SET.has(session.status)) return;
    try {
      await loadQuestions(session.quiz_id);
    } catch {}
  }

  async function join() {
    const pin = ($("pinInput").value || "").trim();
    const nickname = ($("nickInput").value || "").trim();
    if (!pin || !nickname) {
      setJoinMsg("PIN and nickname required.");
      return;
    }
    $("joinBtn").disabled = true;
    try {
      session = await findSessionByPin(pin);
      if (!session) {
        setJoinMsg("No session with that PIN.");
        $("joinBtn").disabled = false;
        return;
      }
      if (!(LOBBY_SET.has(session.status) || PLAY_SET.has(session.status))) {
        setJoinMsg(`Not joinable now (status: ${session.status}).`);
        $("joinBtn").disabled = false;
        return;
      }

      const { data: p, error: pe } = await client
        .from("live_participants")
        .insert({ session_id: session.id, nickname })
        .select("*")
        .single();
      if (pe) throw pe;
      participant = p;

      $("joinCard").style.display = "none";
      $("lobby").style.display = "";
      $("lobbyTitle").textContent = `Lobby — joined as ${nickname}`;
      $("leaveBtn").disabled = false;
      setJoinMsg("");

      await startRealtime();

      if (PLAY_SET.has(session.status)) {
        await ensureQuestionsLoadedIfPlayable();
        await renderCurrentQuestionIfNeeded(true);
      }
    } catch (e) {
      console.error(e);
      setJoinMsg(e?.message || String(e));
      $("joinBtn").disabled = false;
    }
  }

  async function startRealtime() {
    // Postgres changes on the session row (also fetch timing fields)
    channel = client.channel("join:" + session.id);
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${session.id}`,
      },
      async (payload) => {
        const s = payload.new;
        const oldIdx = session.current_question_index;
        const oldStatus = session.status;

        session.status = s.status;
        session.current_question_index = s.current_question_index;
        session.question_started_at = s.question_started_at;
        session.question_duration_seconds = s.question_duration_seconds;

        const playableNow = PLAY_SET.has(session.status);
        const playableBefore = PLAY_SET.has(oldStatus);
        const indexChanged = s.current_question_index !== oldIdx;

        if (playableNow && (!playableBefore || indexChanged)) {
          await ensureQuestionsLoadedIfPlayable();
          await renderCurrentQuestionIfNeeded(true);
        }
        if (!playableNow && playableBefore) showEnded();
      }
    );
    await channel.subscribe();

    // Broadcast wakeups from host
    bc = client.channel("live:" + session.id, {
      config: { broadcast: { self: false } },
    });
    bc.on("broadcast", { event: "started" }, async (msg) => {
      session.status = "in_progress";
      session.current_question_index = Number(msg?.payload?.index ?? 0);
      session.question_started_at =
        msg?.payload?.startAt || session.question_started_at;
      session.question_duration_seconds = Number(
        msg?.payload?.duration ?? session.question_duration_seconds ?? 20
      );
      await ensureQuestionsLoadedIfPlayable();
      await renderCurrentQuestionIfNeeded(true);
    });
    bc.on("broadcast", { event: "question" }, async (msg) => {
      session.status = "in_progress";
      session.current_question_index = Number(
        msg?.payload?.index ?? session.current_question_index ?? 0
      );
      session.question_started_at =
        msg?.payload?.startAt || session.question_started_at;
      session.question_duration_seconds = Number(
        msg?.payload?.duration ?? session.question_duration_seconds ?? 20
      );
      await ensureQuestionsLoadedIfPlayable();
      await renderCurrentQuestionIfNeeded(true);
    });
    bc.on("broadcast", { event: "ended" }, async () => {
      session.status = "ended";
      showEnded();
    });
    await bc.subscribe();

    // Poll fallback
    pollHandle = setInterval(async () => {
      try {
        const { data } = await client
          .from("live_sessions")
          .select(
            "status,current_question_index,question_started_at,question_duration_seconds"
          )
          .eq("id", session.id)
          .single();
        if (!data) return;

        const oldIdx = session.current_question_index;
        const oldStatus = session.status;

        session.status = data.status;
        session.current_question_index = data.current_question_index;
        session.question_started_at = data.question_started_at;
        session.question_duration_seconds = data.question_duration_seconds;

        const playableNow = PLAY_SET.has(session.status);
        const playableBefore = PLAY_SET.has(oldStatus);
        const indexChanged = data.current_question_index !== oldIdx;

        if (playableNow && (indexChanged || (!playableBefore && playableNow))) {
          await ensureQuestionsLoadedIfPlayable();
          await renderCurrentQuestionIfNeeded(true);
        }
        if (!playableNow && playableBefore) showEnded();
      } catch {}
    }, 2000);
  }

  async function renderCurrentQuestionIfNeeded(force = false) {
    const idx = Number(session.current_question_index || 0);
    if (!questions.length) {
      $("play").style.display = "none";
      $("lobby").style.display = "";
      $("lobbyTitle").textContent = "Game started — loading question…";
      return;
    }
    const q = questions[idx];
    if (!q) return;

    if (!force && lastRenderedIndex === idx) return;
    lastRenderedIndex = idx;
    answeredThisQuestion = false;

    $("lobby").style.display = "none";
    $("play").style.display = "";
    $("play").classList.remove("answer-locked");

    const letters = ["A", "B", "C", "D"];
    $("qPrompt").innerHTML = `Q${idx + 1}: ${escapeHtml(q.prompt || "")}`;
    const opts =
      q.type === "tf"
        ? [
            { label: "T", value: "true", text: "True" },
            { label: "F", value: "false", text: "False" },
          ]
        : (Array.isArray(q.options) ? q.options.slice(0, 4) : []).map(
            (t, i) => ({
              label: letters[i],
              value: letters[i],
              text: String(t || ""),
            })
          );

    $("qChoices").innerHTML = opts
      .map(
        (o) => `
      <label class="opt">
        <input type="radio" name="ans" value="${o.value}">
        <span><strong>${o.label}.</strong> ${escapeHtml(o.text)}</span>
      </label>
    `
      )
      .join("");

    $("after").textContent = "";
    $("submitBtn").disabled = false;
  }

  function computePoints(isCorrect) {
    if (!isCorrect) return 0;
    const startISO = session?.question_started_at;
    const dur = Number(session?.question_duration_seconds || 20);
    if (!startISO || !dur) return 1000; // safe fallback
    const start = new Date(startISO).getTime();
    const elapsed = (Date.now() - start) / 1000.0; // seconds
    const left = Math.max(0, dur - elapsed);
    const score = Math.max(0, Math.min(1, left / dur)) * 1000;
    return Math.round(score);
  }

  async function submitAnswer() {
    const idx = Number(session.current_question_index || 0);
    const q = questions[idx];
    if (!q) return;

    if (answeredThisQuestion) {
      $("after").textContent =
        "You already submitted an answer for this question.";
      return;
    }

    // prevent late answers
    const dur = Number(session?.question_duration_seconds || 20);
    const startISO = session?.question_started_at;
    if (startISO) {
      const start = new Date(startISO).getTime();
      if (Date.now() - start > dur * 1000) {
        $("after").textContent = "Time is up for this question.";
        $("submitBtn").disabled = true;
        return;
      }
    }

    const sel = document.querySelector('input[name="ans"]:checked');
    if (!sel) {
      $("after").textContent = "Pick an option first.";
      return;
    }

    $("submitBtn").disabled = true;

    const ans = sel.value;
    const isCorrect = normalize(ans) === normalize(q.correct_answer);

    // speed-based points (same as before)
    const computePoints = () => {
      if (!isCorrect) return 0;
      if (!startISO || !dur) return 1000;
      const start = new Date(startISO).getTime();
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, dur - elapsed);
      return Math.round(Math.max(0, Math.min(1, left / dur)) * 1000);
    };
    const points = computePoints();

    try {
      // plain INSERT — no .select(), so no SELECT RLS needed
      await client.from("live_answers").insert({
        session_id: session.id,
        participant_id: participant.id,
        question_id: q.id,
        answer: ans,
        is_correct: isCorrect,
        points,
        answered_at: new Date().toISOString(),
      });

      // Lock UI after success
      answeredThisQuestion = true;
      $("play").classList.add("answer-locked");
      $("after").innerHTML = isCorrect ? `✅ Correct! +${points}` : "❌ Wrong";
    } catch (e) {
      const msg = e?.message || String(e);
      // Unique violation (already answered) — friendly message, lock UI
      if (e?.code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
        answeredThisQuestion = true;
        $("play").classList.add("answer-locked");
        $("after").textContent =
          "You already submitted an answer for this question.";
        return;
      }
      console.error(e);
      $("after").textContent = msg;
      $("submitBtn").disabled = false;
    }
  }

  function showEnded() {
    $("play").style.display = "none";
    $("lobby").style.display = "";
    $("lobbyTitle").textContent = "Game ended. Thanks for playing!";
  }

  $("joinBtn").onclick = join;
  $("leaveBtn").onclick = async () => {
    try {
      if (participant)
        await client
          .from("live_participants")
          .delete()
          .eq("id", participant.id);
    } catch {}
    try {
      if (channel) await channel.unsubscribe();
    } catch {}
    try {
      if (bc) await bc.unsubscribe();
    } catch {}
    try {
      clearInterval(pollHandle);
    } catch {}
    location.href = location.pathname;
  };
  $("submitBtn").onclick = submitAnswer;
})();
