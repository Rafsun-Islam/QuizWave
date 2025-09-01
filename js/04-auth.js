// ===== Auth =====

async function signupUser(name, email, password, role) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return alert(error.message);
  const { error: pErr } = await client
    .from("profiles")
    .upsert([{ id: data.user.id, name: name || email, role }], {
      onConflict: "id",
    });
  if (pErr) return alert("Profile create failed: " + pErr.message);
  alert("Signup successful!");
  window.location.href = "login.html";
}
async function loginUser(email, password) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return alert(error.message);
  const { data: profile } = await client
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  window.location.href =
    profile?.role === "Teacher" ? "teacher-home.html" : "student-home.html";
}
async function getCurrentProfile() {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error("[getCurrentProfile] error:", error);
    return null;
  }
  return data;
}
async function showGreeting(targetId, expectedRole) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const profile = await getCurrentProfile();
  if (!profile) {
    el.textContent = "Hello! (not logged in)";
    return;
  }
  el.textContent = `Hello, ${profile.name || "User"}${
    profile.role ? ` (${profile.role})` : ""
  }`;
  if (expectedRole && profile.role !== expectedRole)
    console.warn(
      `[showGreeting] expected ${expectedRole}, got ${profile.role}`
    );
}
async function initStudentHome() {
  await showGreeting("studentGreeting", "Student");
  await loadStudentQuizzes();
}
async function initTeacherHome() {
  await showGreeting("teacherGreeting", "Teacher");
  await loadMyQuizzes();
}



async function logoutUser(){
  try{
    await client.auth.signOut();
    localStorage.removeItem('profile');
    window.location.href='index.html';
  }catch(e){ console.error(e); }
}

async function getCurrentProfile(){
  const cached = localStorage.getItem('profile');
  if(cached){ try{ return JSON.parse(cached);}catch{} }
  const { data: { user } } = await client.auth.getUser();
  if(!user) return null;
  const { data: prof } = await client.from('profiles').select('*').eq('id', user.id).single();
  if(prof) localStorage.setItem('profile', JSON.stringify(prof));
  return prof;
}

async function requireLogin(expectedRole){
  const { data: { user } } = await client.auth.getUser();
  if(!user){ window.location.href='login.html'; return; }
  const prof = await getCurrentProfile();
  if(expectedRole && prof?.role?.toLowerCase() !== expectedRole.toLowerCase()){
    // redirect by role
    const role = (prof?.role||'student').toLowerCase();
    window.location.href = (role==='admin')?'admin-dashboard.html':(role==='teacher')?'teacher-dashboard.html':'student-home.html';
  }
}
/* ===================== Admin additions (append-only) ===================== */
/* These do not modify your existing functions. They add admin-aware helpers. */

/** Fast server-side check: am I an admin? (uses RPC public.admin_am_i) */
async function isAdmin() {
  try {
    const { data, error } = await client.rpc('admin_am_i');
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Admin-first router you can call after ANY successful sign-in.
 * Priority: ADMIN → Teacher → Student. Respects ?next= if not admin.
 */
async function routeAfterLoginAdminFirst() {
  // 1) Admin?
  if (await isAdmin()) {
    window.location.href = 'admin-dashboard.html';
    return;
  }

  // 2) Otherwise route by profile.role (your existing behavior)
  const { data: { user } } = await client.auth.getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  // load profile (also reuse your localStorage cache shape)
  let prof = null;
  try {
    const { data } = await client.from('profiles').select('*').eq('id', user.id).single();
    prof = data || null;
    if (prof) localStorage.setItem('profile', JSON.stringify(prof));
  } catch {}

  const role = (prof?.role || 'student').toLowerCase();

  // optional: honor ?next for non-admins
  const next = new URLSearchParams(location.search).get('next');
  if (next) { window.location.href = next; return; }

  window.location.href = (role === 'teacher') ? 'teacher-home.html' : 'student-home.html';
}

/**
 * Drop-in replacement for login if you want an admin-aware login flow
 * WITHOUT changing your original loginUser(). Use this on pages that should
 * route admins to the admin dashboard.
 *
 * Example usage:
 *   await loginUserAdminAware(email, password);
 */
async function loginUserAdminAware(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  // Admin takes precedence
  if (await isAdmin()) {
    window.location.href = 'admin-dashboard.html';
    return;
  }

  // Fallback to your original profile-based routing
  const { data: profile } = await client.from('profiles').select('*').eq('id', data.user.id).single();
  if (profile) localStorage.setItem('profile', JSON.stringify(profile));
  const role = (profile?.role || 'student').toLowerCase();
  window.location.href = (role === 'teacher') ? 'teacher-home.html' : 'student-home.html';
}

/**
 * Role guard where ADMIN always passes.
 * Use this instead of requireLogin('Teacher') on pages where admins should
 * also have access.
 *
 * Example:
 *   await requireRoleOrAdmin('Teacher');
 */
async function requireRoleOrAdmin(expectedRole) {
  // ensure logged in
  const { data } = await client.auth.getUser();
  if (!data?.user) {
    window.location.href = `login.html?next=${encodeURIComponent(location.pathname)}`;
    return null;
  }

  // admin bypass
  if (await isAdmin()) return data.user;

  // otherwise enforce role using your existing profile logic
  const prof = await getCurrentProfile();
  if (!prof) { window.location.href = 'login.html'; return null; }
  if (expectedRole && (prof.role || '').toLowerCase() !== String(expectedRole).toLowerCase()) {
    // redirect by your existing pattern
    const role = (prof.role || 'student').toLowerCase();
    window.location.href =
      (role === 'teacher') ? 'teacher-home.html' : 'student-home.html';
    return null;
  }
  return data.user;
}

/* expose helpers if you rely on globals elsewhere */
window.isAdmin = isAdmin;
window.routeAfterLoginAdminFirst = routeAfterLoginAdminFirst;
window.loginUserAdminAware = loginUserAdminAware;
window.requireRoleOrAdmin = requireRoleOrAdmin;
/* =================== end admin additions (append-only) =================== */
