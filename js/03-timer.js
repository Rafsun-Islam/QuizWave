// ===== Timer (per-quiz, persists in sessionStorage) =====

function getDeadlineKey(quizId) {
  return `quiz_deadline_${quizId}`;
}

// ----- Time formatting (handle "timestamp without time zone") -----
const FORCE_TZ = "Asia/Dhaka";   // set to null to use viewer device time

// Parse a Supabase timestamp. If it has no timezone, treat it as UTC.
function parseUTC(isoLike) {
  if (!isoLike) return null;
  // If already has Z or +hh:mm/-hh:mm, just use it.
  if (/[Zz]$/.test(isoLike) || /[+-]\d\d:\d\d$/.test(isoLike)) {
    return new Date(isoLike);
  }
  // No timezone → interpret as UTC by appending Z
  return new Date(isoLike + "Z");
}

function formatTS(isoLike) {
  const d = parseUTC(isoLike) || new Date();
  const opts = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,             // 12-hour format
    timeZoneName: "short",
  };
  if (FORCE_TZ) opts.timeZone = FORCE_TZ;
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}


function startQuizTimer(quizId, minutes, onExpireTick) {
  const timerEl = document.getElementById("timer");
  if (!timerEl) return;
  if (!minutes || Number(minutes) <= 0) {
    timerEl.style.display = "none";
    return;
  }
  timerEl.style.display = "inline-block";
  const key = getDeadlineKey(quizId);
  let deadline = Number(sessionStorage.getItem(key));
  const now = Date.now();
  if (!deadline || isNaN(deadline) || deadline < now) {
    deadline = now + minutes * 60 * 1000;
    sessionStorage.setItem(key, String(deadline));
  }
  function tick() {
    const remainMs = deadline - Date.now();
    const remainSec = Math.ceil(remainMs / 1000);
    timerEl.textContent = `Time: ${fmtTime(remainSec)}`;
    if (remainSec <= 0) {
      onExpireTick?.();
      return;
    }
    window._quizTimer = setTimeout(tick, 250);
  }
  if (window._quizTimer) clearTimeout(window._quizTimer);
  tick();
}
function clearQuizTimer(quizId) {
  if (window._quizTimer) clearTimeout(window._quizTimer);
  sessionStorage.removeItem(getDeadlineKey(quizId));
}

