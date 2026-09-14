/* ============================================================
   NINJAWO shared navigation drawer (iframe pages)
   - Replaces the "home" icon next to the NINJAWO brand with a
     hamburger button that opens a role-aware navigation drawer.
   - Solid, fully-opaque drawer (page text never bleeds through).
   Configure BEFORE including (optional):
     window.NINJAWO_DRAWER = { role: "customer"|"provider"|"admin" };
   Otherwise the role is inferred from the page URL.
   ============================================================ */
(function () {
  if (window.__NINJAWO_DRAWER_LOADED__) return;
  window.__NINJAWO_DRAWER_LOADED__ = true;

  function inferRole() {
    var forced = window.NINJAWO_DRAWER && window.NINJAWO_DRAWER.role;
    if (forced) return forced;
    var p = window.location.pathname;
    if (/provider-(dashboard|requests)/.test(p)) return "provider";
    if (/provider-(login|signup|onboarding)/.test(p)) return "guest-provider";
    if (/admin-dashboard/.test(p)) return "admin";
    if (/(dashboard|inbox|my-requests|book|booking|search)/.test(p)) return "customer";
    return "guest";
  }

  var role = inferRole();

  var LINKS = {
    guest: [
      { icon: "home", label: "Home", route: "/" },
      { icon: "search", label: "Explore", route: "/search" },
      { divider: true },
      { icon: "login", label: "Sign In", route: "/login" },
      { icon: "person_add", label: "Sign Up", route: "/signup" }
    ],
    "guest-provider": [
      { icon: "home", label: "Home", route: "/" },
      { icon: "search", label: "Explore", route: "/search" },
      { divider: true },
      { icon: "login", label: "Provider Sign In", route: "/provider/login" },
      { icon: "person_add", label: "Become a Provider", route: "/provider/signup" }
    ],
    customer: [
      { icon: "home", label: "Home", route: "/" },
      { icon: "search", label: "Explore", route: "/search" },
      { icon: "calendar_month", label: "Bookings", route: "/booking" },
      { icon: "chat", label: "Inbox", route: "/inbox" },
      { icon: "assignment", label: "My Requests", route: "/my-requests" },
      { icon: "add_circle", label: "Post a Service Request", route: "/post-request" },
      { divider: true },
      { icon: "dashboard", label: "Dashboard", route: "/dashboard" },
      { icon: "logout", label: "Sign Out", action: "signout" }
    ],
    provider: [
      { icon: "home", label: "Home", route: "/" },
      { icon: "search", label: "Explore", route: "/search" },
      { icon: "calendar_month", label: "Bookings", route: "/booking" },
      { icon: "chat", label: "Inbox", route: "/inbox" },
      { icon: "assignment", label: "Customer Requests", route: "/provider/requests" },
      { divider: true },
      { icon: "dashboard", label: "Provider Dashboard", route: "/provider/dashboard" },
      { icon: "logout", label: "Sign Out", action: "signout-provider" }
    ],
    admin: [
      { icon: "dashboard", label: "Overview", route: "/admin/dashboard" },
      { icon: "shield", label: "Provider Verification", route: "/admin/dashboard" },
      { icon: "assignment", label: "Requests", route: "/admin/dashboard" },
      { icon: "handshake", label: "Offers", route: "/admin/dashboard" },
      { icon: "calendar_month", label: "Bookings", route: "/admin/dashboard" },
      { icon: "star", label: "Reviews", route: "/admin/dashboard" },
      { divider: true },
      { icon: "home", label: "Back to Home", route: "/" },
      { icon: "logout", label: "Sign Out", action: "signout-admin" }
    ]
  };

  var SIGNOUT_TYPES = {
    signout: ["dashboard:signOut", "auth:signout"],
    "signout-provider": ["dashboard:signOut", "auth:signout"],
    "signout-admin": ["admin:signOut", "auth:signout"]
  };
  var CSS = [
    ".nw-trigger{display:inline-flex;align-items:center;justify-content:center;padding:4px;border-radius:8px;color:#003d9b;background:transparent;border:0;cursor:pointer;transition:background-color .15s}",
    ".nw-trigger:hover{background:#f1f3ff}",
    ".nw-trigger .material-symbols-outlined{font-size:24px}",
    ".nw-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(4,27,60,.6);opacity:0;pointer-events:none;transition:opacity .3s}",
    ".nw-backdrop.open{opacity:1;pointer-events:auto}",
    ".nw-drawer{position:fixed;left:0;top:0;z-index:9999;height:100%;width:320px;max-width:88vw;background:#ffffff;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);transform:translateX(-100%);transition:transform .3s;display:flex;flex-direction:column}",
    ".nw-drawer.open{transform:translateX(0)}",
    ".nw-header{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #c3c6d6}",
    ".nw-title{font-size:20px;font-weight:700;color:#003d9b}",
    ".nw-close{border:0;background:transparent;padding:4px;border-radius:8px;color:#434654;cursor:pointer}",
    ".nw-close:hover{background:#f1f3ff}",
    ".nw-nav{margin-top:16px;display:flex;flex-direction:column;gap:4px;padding:0 12px;overflow-y:auto}",
    ".nw-link{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;border:0;background:transparent;font-size:14px;font-weight:600;color:#041b3c;text-align:left;cursor:pointer;font-family:inherit}",
    ".nw-link:hover{background:#f1f3ff}",
    ".nw-link .material-symbols-outlined{color:#003d9b}",
    ".nw-link.danger,.nw-link.danger .material-symbols-outlined{color:#ba1a1a}",
    ".nw-link.danger:hover{background:#ffdad6}",
    ".nw-divider{margin:12px 0;border-top:1px solid #c3c6d6}",
    ".nw-bar{position:fixed;left:0;top:0;z-index:9997;width:100%;display:flex;align-items:center;padding:10px 16px;background:#ffffff;border-bottom:1px solid #c3c6d6}"
  ].join("\n");

  var style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  function postToParent(msg) {
    try { window.parent.postMessage(msg, "*"); } catch (e) { /* noop */ }
  }

  function navigate(route) {
    closeDrawer();
    if (typeof window.navigate === "function") {
      window.navigate(route);
      return;
    }
    postToParent({ type: "navigate", route: route });
  }

  function signOut(action) {
    closeDrawer();
    (SIGNOUT_TYPES[action] || ["auth:signout"]).forEach(function (t) {
      postToParent({ type: t });
    });
    postToParent({
      type: "navigate",
      route: action === "signout-provider" ? "/provider/login" : "/login"
    });
  }

  var backdrop, drawer;

  function openDrawer() {
    backdrop.classList.add("open");
    drawer.classList.add("open");
  }
  function closeDrawer() {
    backdrop.classList.remove("open");
    drawer.classList.remove("open");
  }
  function buildDrawer() {
    backdrop = document.createElement("div");
    backdrop.className = "nw-backdrop";
    backdrop.addEventListener("click", closeDrawer);

    drawer = document.createElement("aside");
    drawer.className = "nw-drawer";
    drawer.setAttribute("aria-label", "Navigation menu");

    var title = role === "admin" ? "Admin Console" : "NINJAWO";
    var header = document.createElement("div");
    header.className = "nw-header";
    header.innerHTML =
      '<span class="nw-title">' + title + "</span>" +
      '<button class="nw-close" aria-label="Close menu" type="button">' +
      '<span class="material-symbols-outlined">close</span></button>';
    header.querySelector(".nw-close").addEventListener("click", closeDrawer);

    var nav = document.createElement("nav");
    nav.className = "nw-nav";
    (LINKS[role] || LINKS.guest).forEach(function (item) {
      if (item.divider) {
        var d = document.createElement("div");
        d.className = "nw-divider";
        nav.appendChild(d);
        return;
      }
      var btn = document.createElement("button");
      btn.className = "nw-link" + (item.action ? " danger" : "");
      btn.type = "button";
      btn.innerHTML =
        '<span class="material-symbols-outlined">' + item.icon + "</span>" + item.label;
      btn.addEventListener("click", function () {
        if (item.action) signOut(item.action);
        else navigate(item.route);
      });
      nav.appendChild(btn);
    });

    drawer.appendChild(header);
    drawer.appendChild(nav);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });
  }

  function wireTrigger(el) {
    el.addEventListener("click", function (e) {
      // Pages wrap the brand row in a clickable [data-nav] container or
      // #homeButton; don't let the drawer trigger also fire that navigation.
      e.stopPropagation();
      e.preventDefault();
      openDrawer();
    });
  }

  function makeTrigger(inline) {
    var btn;
    if (inline) {
      // Used when the trigger would land inside a <button>/<a> — avoids
      // invalid nested interactive elements.
      btn = document.createElement("span");
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
    } else {
      btn = document.createElement("button");
      btn.type = "button";
    }
    btn.className = "nw-trigger";
    btn.setAttribute("aria-label", "Open menu");
    btn.innerHTML = '<span class="material-symbols-outlined">menu</span>';
    wireTrigger(btn);
    if (inline) {
      btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          openDrawer();
        }
      });
    }
    return btn;
  }

  function ensureIconFont() {
    if (document.querySelector('link[href*="Material+Symbols"], link[href*="material-symbols"]'))
      return;
    var font = document.createElement("link");
    font.rel = "stylesheet";
    font.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
    document.head.appendChild(font);
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  onReady(function () {
    ensureIconFont();
    buildDrawer();

    // 1) Replace the "home" icon sitting next to the NINJAWO brand with the trigger
    var homeIcons = document.querySelectorAll("header .material-symbols-outlined");
    var replaced = false;
    for (var i = 0; i < homeIcons.length; i++) {
      if (homeIcons[i].textContent.trim() === "home") {
        // Inside a <button>/<a> (e.g. #homeButton) use an inline trigger to
        // avoid invalid nested interactive elements.
        var inline = !!homeIcons[i].closest("button, a");
        homeIcons[i].replaceWith(makeTrigger(inline));
        replaced = true;
        break;
      }
    }

    // 2) Fallback: replace a header-level "Home" / "Back to Home" button or link
    if (!replaced) {
      var headerBtns = document.querySelectorAll("header button, header a");
      for (var j = 0; j < headerBtns.length; j++) {
        var t = (headerBtns[j].textContent || "").trim().toLowerCase();
        if (t === "home" || t === "back to home") {
          // Inside a <button>/<a> (e.g. #homeButton) use an inline trigger to
          // avoid invalid nested interactive elements.
          var inline = !!headerBtns[j].closest("button, a");
          headerBtns[j].replaceWith(makeTrigger(inline));
          replaced = true;
          break;
        }
      }
    }

    // 3) Insert the trigger at the start of the header nav
    if (!replaced) {
      var host = document.querySelector("header nav") || document.querySelector("header");
      if (host) {
        host.insertBefore(makeTrigger(), host.firstChild);
        replaced = true;
      }
    }

    // 4) No header at all: create a minimal fixed bar so the drawer is reachable
    if (!replaced) {
      var bar = document.createElement("header");
      bar.className = "nw-bar";
      bar.appendChild(makeTrigger());
      document.body.appendChild(bar);
      document.body.style.paddingTop = "57px";
    }
  });
})();
