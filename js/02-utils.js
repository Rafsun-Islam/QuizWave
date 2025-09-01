// ===== Utils =====

function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );
}
function norm(s) {
  return (s || "").toString().trim().toLowerCase();
}
function normStatus(s) {
  const x = norm(s);
  return x === "draft" ? "Draft" : x === "published" ? "Published" : "";
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function displayTimeLimit(mins) {
  const m = Number(mins || 0);
  return m > 0 ? `Time limit: ${m} min` : `No time limit`;
}
function toNumber(n, d = 0) {
  const x = Number(n);
  return isNaN(x) ? d : x;
}

