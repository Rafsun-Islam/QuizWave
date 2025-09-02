// js/site-shell.js — Admin-friendly navbar (no "+New"), auth-required header, theme toggle, reveal, slider
// Relies on: getCurrentProfile(), logoutUser(), isAdmin() from 04-auth.js and global `client` (Supabase)

(async function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Public pages that don't require auth:
  const PUBLIC_ALLOWLIST = new Set([
    "",
    "index.html",
    "login.html",
    "signup.html",
    "verify-email.html",
    "forgot-password.html",
    "reset-password.html",
  ]);

  // Ensure header mount
  let header = document.getElementById("site-header");
  if (!header) {
    header = document.createElement("div");
    header.id = "site-header";
    document.body.prepend(header);
  }

  // Theme init with proper emoji
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  
  // Set initial theme toggle emoji
  setTimeout(() => {
    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) {
      themeToggle.textContent = savedTheme === "dark" ? "🌓" : "☀️";
      themeToggle.setAttribute("title", `Switch to ${savedTheme === "dark" ? "light" : "dark"} mode`);
    }
  }, 100);

  // Page filename (lowercased)
  const here = (location.pathname.split("/").pop() || "").toLowerCase();

  // Current user & profile
  let user = null,
    profile = null,
    admin = false;
  try {
    if (typeof client?.auth?.getUser === "function") {
      user = (await client.auth.getUser())?.data?.user || null;
    }
    if (typeof getCurrentProfile === "function") {
      profile = await getCurrentProfile();
    }
    // admin detection (server-authoritative), fallback to profile.role
    if (typeof window.isAdmin === "function") {
      admin = await window.isAdmin();
    } else {
      admin = (profile?.role || "").toLowerCase() === "admin";
    }
  } catch (e) {
    console.warn("Auth/profile fetch failed:", e);
  }

  // Enforce auth (no guest experience)
  if (!user && !PUBLIC_ALLOWLIST.has(here)) {
    window.location.href = "login.html";
    return;
  }

  // --- header renderers ---
  const renderPublicHeader = () => {
    header.innerHTML = `
      <header class="site">
        <div class="container">
          <nav class="bar">
            <a class="brand" href="index.html" style="display: inline-block;">
            <img src="/image/logo(White).png" alt="QuizWave Logo" style="width: 150px; height: auto;" />
            </a>
            <span class="spacer"></span>
            <a class="btn" href="signup.html">Sign Up</a>
            <a class="btn ghost" href="login.html">Login</a>
          </nav>
        </div>
      </header>`;
  };

  const buildLinksHtml = (entries) =>
    entries
      .map(([href, label]) => `<a href="${href}" data-navlink>${label}</a>`)
      .join("");

  const adminLinks = () => [
    ["admin-dashboard.html", "Overview"],
    ["admin-dashboard.html#admins", "Admins"],
    ["admin-dashboard.html#users", "Users"],
    ["admin-dashboard.html#quizzes", "Quizzes"],
    [
      "admin-dashboard.html#live",
      `Live <span class="badge" id="navLiveCount" style="margin-left:6px;display:inline-block;min-width:18px;padding:1px 6px;border-radius:999px;border:1px solid var(--border);font-size:12px;line-height:18px;text-align:center;">–</span>`,
    ],
    ["admin-dashboard.html#analytics", "Reports"],
    
  ];

  const teacherLinks = () => [
    ["teacher-dashboard.html", "Dashboard"],
    ["teacher-home.html", "My Quizzes"],
    ["teacher-quiz-builder.html", "Build Quiz"],
    
  ];

  const studentLinks = () => [
    ["student-home.html", "Home"],
    
  ];

  const renderAuthedHeader = () => {
    const role = admin ? "admin" : (profile?.role || "student").toLowerCase();
    const name = profile?.name || profile?.username || user?.email || "User";
    const initials = (
      name
        .trim()
        .split(/\s+/)
        .map((s) => s[0])
        .join("") || "U"
    )
      .slice(0, 2)
      .toUpperCase();

    const links =
      role === "admin"
        ? adminLinks()
        : role === "teacher"
        ? teacherLinks()
        : studentLinks();

    const brandHref =
      role === "admin"
        ? "admin-dashboard.html"
        : role === "teacher"
        ? "teacher-dashboard.html"
        : "student-home.html";

    header.innerHTML = `
      <header class="site" data-role="${role}">
        <div class="container">
          <nav class="bar">
            <a class="brand" href="index.html" style="display: inline-block;">
            <img src="/image/logo(White).png" alt="QuizWave Logo" style="width: 100px; height: auto;" />
            </a>
            ${buildLinksHtml(links)}
            <span class="spacer"></span>
            <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme" title="Toggle theme">🌓</button>
            <div class="profile" id="profileRoot">
              <a href="profile.html" class="avatar" title="${name}" id="avatarBtn">${initials}</a>
              <div class="dropdown" id="profileDropdown" aria-label="Profile menu">
                ${
                  admin
                    ? '<a href="admin-dashboard.html">Admin Dashboard</a>'
                    : ""
                }
                <a href="profile.html">View Profile</a>
                <a href="#" id="logoutLink">Logout</a>
              </div>
            </div>
          </nav>
        </div>
      </header>`;
  };

  // Render
  if (!user) renderPublicHeader();
  else renderAuthedHeader();

  // Active link highlight
  try {
    const current =
      (location.pathname.split("/").pop() || "index.html").toLowerCase() +
      location.hash;
    $$("a[data-navlink]", header).forEach((a) => {
      const target = (a.getAttribute("href") || "").toLowerCase();
      if (
        target &&
        (current === target ||
          (location.hash && target.endsWith(location.hash)))
      ) {
        a.classList.add("active");
      }
    });
  } catch {}

  // Enhanced theme toggle with smooth transitions
  $("#themeToggle")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    
    // Add transition class for smoother change
    document.documentElement.classList.add("theme-transitioning");
    
    // Change theme
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    
    // Update theme toggle emoji
    const themeToggle = $("#themeToggle");
    if (themeToggle) {
      themeToggle.textContent = next === "dark" ? "🌓" : "☀️";
      themeToggle.setAttribute("title", `Switch to ${cur} mode`);
    }
    
    // Remove transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 600);
  });

  // Profile dropdown behavior
  const profileEl = $("#profileRoot", header);
  const avatar = $("#avatarBtn", header);
  if (profileEl && avatar) {
    let sticky = false;
    const canHover =
      window.matchMedia && window.matchMedia("(hover:hover)").matches;

    if (canHover) {
      profileEl.addEventListener("mouseleave", () => {
        if (!sticky) profileEl.classList.remove("open");
      });
      profileEl.addEventListener("mouseenter", () => {
        profileEl.classList.add("open");
      });
    }

    avatar.addEventListener("click", (e) => {
      if (!e.metaKey && !e.ctrlKey) e.preventDefault();
      sticky = !sticky;
      profileEl.classList.toggle("open", sticky);
    });

    document.addEventListener("click", (e) => {
      if (!profileEl.contains(e.target)) {
        sticky = false;
        profileEl.classList.remove("open");
      }
    });

    // Logout
    const logoutLink = $("#logoutLink", header);
    if (logoutLink && typeof logoutUser === "function") {
      logoutLink.addEventListener("click", (e) => {
        e.preventDefault();
        logoutUser();
      });
    }
  }

  // Admin live sessions count badge (auto-refresh)
  async function updateLiveBadge() {
    if (!admin) return;
    const el = document.getElementById("navLiveCount");
    if (!el) return;
    try {
      const { count } = await client
        .from("live_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress");
      el.textContent = typeof count === "number" ? count : "0";
    } catch {
      el.textContent = "0";
    }
  }
  if (admin) {
    updateLiveBadge();
    setInterval(updateLiveBadge, 10000); // refresh every 10s
  }

  // Scroll reveal
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15 }
  );
  $$(".reveal").forEach((el) => io.observe(el));

  // Optional hero slider (if .slide/.dot exist)
  const slides = $$(".slide");
  const dots = $$(".dot");
  if (slides.length) {
    let i = 0;
    const show = (n) => {
      slides.forEach((s, idx) => s.classList.toggle("active", idx === n));
      dots.forEach((d, idx) => d.classList.toggle("active", idx === n));
      i = n;
    };
    const next = () => show((i + 1) % slides.length);
    let timer = setInterval(next, 5000);
    dots.forEach((d, idx) =>
      d.addEventListener("click", () => {
        show(idx);
        clearInterval(timer);
        timer = setInterval(next, 5000);
      })
    );
    show(0);
  }
})();

(function () {
  function ensureHamburger() {
    const header = document.querySelector("header.site");
    const nav = header?.querySelector("nav.bar");
    if (!header || !nav) return false;

    const brand = nav.querySelector(".brand");
    const spacer = nav.querySelector(".spacer");

    // 1) Ensure a single .nav-actions wrapper that contains ALL nav items (links, theme toggle, profile)
    let actions = nav.querySelector(".nav-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "nav-actions";

      // Insert after spacer if present, else after brand
      if (spacer && nav.contains(spacer)) spacer.after(actions);
      else if (brand && nav.contains(brand)) brand.after(actions);
      else nav.prepend(actions);

      // Move every node except brand/spacer/toggle/wrapper into .nav-actions
      Array.from(nav.children).forEach((node) => {
        if (
          node === brand ||
          node === spacer ||
          node === actions ||
          node.id === "navToggle"
        )
          return;
        actions.appendChild(node);
      });
    }

    // 2) Create hamburger toggle if missing
    let toggle = nav.querySelector("#navToggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.id = "navToggle";
      toggle.className = "nav-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-label", "Menu");
      toggle.setAttribute("aria-controls", actions.id || "navMenu");
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML =
        '<span class="hamb"></span><span class="hamb"></span><span class="hamb"></span>';

      if (spacer && nav.contains(spacer)) spacer.after(toggle);
      else if (brand && nav.contains(brand)) brand.after(toggle);
      else nav.prepend(toggle);
    }
    if (!actions.id) actions.id = "navMenu";

    // 3) Mobile-only: add "View Profile" + "Logout" inside the panel (cloned so desktop dropdown remains)
    const profileDropdown =
      actions.querySelector("#profileDropdown") ||
      nav.querySelector("#profileDropdown");
    if (profileDropdown && !actions.querySelector("#logoutLinkMobile")) {
      const viewSrc = profileDropdown.querySelector('a[href="profile.html"]');
      const logoutSrc = profileDropdown.querySelector("#logoutLink");

      if (viewSrc) {
        const viewClone = viewSrc.cloneNode(true);
        viewClone.classList.add("nav-mobile-only");
        // avoid duplicate IDs
        if (viewClone.id) viewClone.id = viewClone.id + "Mobile";
        actions.appendChild(viewClone);
      }

      if (logoutSrc) {
        const logoutClone = logoutSrc.cloneNode(true);
        logoutClone.classList.add("nav-mobile-only");
        logoutClone.id = "logoutLinkMobile";
        // wire to the same logout function
        logoutClone.addEventListener("click", (e) => {
          e.preventDefault();
          if (typeof window.logoutUser === "function") window.logoutUser();
        });
        actions.appendChild(logoutClone);
      }
    }

    // 4) Toggle open/close
    function setOpen(open) {
      header.classList.toggle("mobile-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (!toggle._bound) {
      toggle.addEventListener("click", () =>
        setOpen(!header.classList.contains("mobile-open"))
      );
      toggle._bound = true;
    }

    // Close on outside click (only on mobile)
    if (!document._navOutsideBound) {
      document.addEventListener("click", (e) => {
        if (
          window.matchMedia("(max-width: 960px)").matches &&
          !header.contains(e.target)
        )
          setOpen(false);
      });
      document._navOutsideBound = true;
    }

    // Close on Escape
    if (!document._navEscBound) {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") setOpen(false);
      });
      document._navEscBound = true;
    }

    // Close after tapping any link/button inside the panel on mobile
    if (!actions._closeOnClickBound) {
      actions.addEventListener("click", (e) => {
        const t = e.target.closest("a,button");
        if (t && window.matchMedia("(max-width: 960px)").matches)
          setOpen(false);
      });
      actions._closeOnClickBound = true;
    }

    return true;
  }

  // Wait for header.site (site-shell may inject it)
  function whenHeaderReady(cb) {
    if (cb()) return;
    const obs = new MutationObserver(() => {
      if (cb()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 10000); // safety
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      whenHeaderReady(ensureHamburger)
    );
  } else {
    whenHeaderReady(ensureHamburger);
  }
})();