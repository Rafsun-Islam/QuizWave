/* js/16-profile.js (classic) — robust profile loader/saver with logging */
(function () {
  function log() {
    if (
      window &&
      window.localStorage &&
      localStorage.getItem("debugProfile") === "1"
    ) {
      console.log.apply(console, arguments);
    }
  }

  function byIdOrName(id) {
    var el = document.getElementById(id);
    if (el) return el;
    // fallback: <input name="id">
    return document.querySelector('[name="' + id + '"]');
  }

  function getVal(id) {
    var el = byIdOrName(id);
    return el ? el.value : null;
  }

  function setVal(id, v) {
    var el = byIdOrName(id);
    if (el) el.value = v == null ? "" : v;
  }

  function trimOrNull(v) {
    if (v === undefined || v === null) return null;
    var t = String(v).trim();
    return t === "" ? null : t;
  }

  async function getUser() {
    var res = await client.auth.getUser();
    if (res.error) throw res.error;
    return res.data.user;
  }

  async function fetchProfile() {
    var user = await getUser();
    var res = await client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (res.error) throw res.error;
    return res.data;
  }

  async function uploadAvatar(file) {
    if (!file) return null;
    var user = await getUser();
    var ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    var path = user.id + "/" + Date.now() + "." + ext;
    var up = await client.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    var pub = client.storage.from("avatars").getPublicUrl(path);
    return pub && pub.data && pub.data.publicUrl ? pub.data.publicUrl : null;
  }

  // Build values object from form
  function readFormValues() {
    var obj = {
      name: trimOrNull(getVal("name")),
      username: trimOrNull(getVal("username")),
      email: trimOrNull(getVal("email")), // usually display-only
      phone: trimOrNull(getVal("phone")),
      dob: trimOrNull(getVal("dob")), // YYYY-MM-DD
      institution: trimOrNull(getVal("institution")),
      avatar_url: trimOrNull(getVal("avatar_url")),
    };
    log("[profile] form values:", JSON.parse(JSON.stringify(obj)));
    return obj;
  }

  // Merge only changes; if force=true, send all provided non-undefined keys (including nulls)
  function buildPayload(before, after, force) {
    var payload = {};
    Object.keys(after).forEach(function (k) {
      var afterVal = after[k];
      if (afterVal === undefined) return; // never send undefined
      if (force) {
        payload[k] = afterVal;
        return;
      }
      var beforeVal = before && before[k] !== undefined ? before[k] : null;
      var A = afterVal == null ? null : String(afterVal);
      var B = beforeVal == null ? null : String(beforeVal);
      if (A !== B) payload[k] = afterVal; // changed or explicitly cleared
    });
    log("[profile] update payload:", JSON.parse(JSON.stringify(payload)));
    return payload;
  }

  async function saveProfile(force) {
    var statusEl = byIdOrName("profileStatus");
    if (statusEl) statusEl.textContent = "Saving…";
    try {
      var before = await fetchProfile();
      var after = readFormValues();

      // handle file upload (overrides avatar_url)
      var fileInput = byIdOrName("avatar_file");
      if (fileInput && fileInput.files && fileInput.files[0]) {
        after.avatar_url = await uploadAvatar(fileInput.files[0]);
      }

      var payload = buildPayload(before, after, !!force);
      if (Object.keys(payload).length === 0) {
        if (statusEl) statusEl.textContent = "No changes.";
        return before;
      }

      var user = await getUser();
      var upd = await client
        .from("profiles")
        .update(payload)
        .eq("id", user.id)
        .select()
        .single();
      if (upd.error) throw upd.error;

      if (statusEl) statusEl.textContent = "Profile saved.";
      return upd.data;
    } catch (err) {
      console.error("[saveProfile] error:", err);
      if (statusEl)
        statusEl.textContent =
          err && err.message ? err.message : "Save failed.";
      throw err;
    }
  }

  async function initProfileForm() {
    try {
      if (typeof requireLogin === "function") await requireLogin();
    } catch (_) {}

    var statusEl = byIdOrName("profileStatus");
    try {
      var p = await fetchProfile();
      setVal("name", p.name);
      setVal("username", p.username);
      setVal("email", p.email);
      setVal("phone", p.phone);
      setVal("dob", p.dob);
      setVal("institution", p.institution);
      setVal("avatar_url", p.avatar_url);
    } catch (e) {
      console.error("[initProfileForm] load error:", e);
      if (statusEl) statusEl.textContent = "Failed to load profile.";
    }

    var form = byIdOrName("profileForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        saveProfile(false);
      });
    }

    // Optional: a "Force Save" button if you want one in HTML
    var forceBtn = byIdOrName("profileForceSave");
    if (forceBtn) {
      forceBtn.addEventListener("click", function (e) {
        e.preventDefault();
        saveProfile(true);
      });
    }
  }

  // expose for debugging
  window.Profile = { init: initProfileForm, save: saveProfile };

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.client) {
      console.error("Supabase client (window.client) not found!");
      return;
    }
    // Enable console logging by running: localStorage.setItem('debugProfile','1')
    initProfileForm();
  });
})();
