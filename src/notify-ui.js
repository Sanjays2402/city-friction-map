// Notification center UI.
// The pure renderers (typeIcon, renderNotificationItem) are unit-tested in
// tests/notify-ui.test.js. DOM wiring only runs when `document` exists so the
// module stays importable from node tests.
//
// `api` follows the app's convention: api(path, body, method), where path is
// relative to "/api" (the app's api() prepends it), e.g. api("/notifications")
// performs GET /api/notifications.

export function typeIcon(type) {
  if (type === "alert") return "⚐";
  if (type === "resolved") return "✓";
  if (type === "comment") return "💬";
  return "●";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function age(createdAt) {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  return Math.floor(d / 30) + "mo ago";
}

export function renderNotificationItem(n) {
  const unreadClass = n.read ? "" : " unread";
  return (
    `<button type="button" class="notification${unreadClass}" data-id="${escapeHtml(n.id)}">` +
    `<span class="notification-icon" aria-hidden="true">${typeIcon(n.type)}</span>` +
    `<span class="notification-text">` +
    `<span class="notification-title">${escapeHtml(n.title)}</span>` +
    `<span class="notification-body">${escapeHtml(n.body)}</span>` +
    `</span>` +
    `<span class="notification-age">${escapeHtml(age(n.createdAt))}</span>` +
    `</button>`
  );
}

export function initNotifications({ api, onOpenReport, mount }) {
  // Safe no-op when there is no DOM (node tests).
  if (typeof document === "undefined") {
    return { refresh: async () => {}, destroy() {} };
  }

  const root = document.createElement("div");
  root.className = "notification-center";

  const bell = document.createElement("button");
  bell.type = "button";
  bell.className = "notification-bell";
  bell.setAttribute("aria-label", "Notifications");
  bell.textContent = "🔔";

  const badge = document.createElement("span");
  badge.className = "notification-badge";
  badge.hidden = true;
  bell.appendChild(badge);

  const panel = document.createElement("div");
  panel.className = "notification-panel";
  panel.hidden = true;

  root.appendChild(bell);
  root.appendChild(panel);
  mount.appendChild(root);

  let items = [];

  function renderPanel() {
    const listHtml = items.length
      ? items.map(renderNotificationItem).join("")
      : `<p class="notification-empty">No notifications yet.</p>`;
    panel.innerHTML =
      `<div class="notification-panel-header">` +
      `<strong>Notifications</strong>` +
      `<button type="button" class="notification-mark-all">Mark all read</button>` +
      `</div>` +
      listHtml;

    const markAll = panel.querySelector(".notification-mark-all");
    markAll.addEventListener("click", async () => {
      try {
        await api("/notifications/read", {}, "POST");
      } catch {
        // Older servers may not support this endpoint.
      }
      refresh();
    });

    panel.querySelectorAll(".notification").forEach((el) => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-id");
        const n = items.find((item) => String(item.id) === id);
        if (!n) return;
        try {
          await api("/notifications/read", { ids: [n.id] }, "POST");
        } catch {
          // Older servers may not support this endpoint.
        }
        if (n.reportId && onOpenReport) onOpenReport(n.reportId, n.city);
        refresh();
      });
    });
  }

  async function refresh() {
    let res;
    try {
      res = await api("/notifications");
    } catch {
      return; // Server may be old; leave the bell as-is.
    }
    if (!res || !Array.isArray(res.items)) return;
    items = [...res.items].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
    const unread =
      typeof res.unread === "number"
        ? res.unread
        : items.filter((n) => !n.read).length;
    badge.textContent = unread > 0 ? String(unread) : "";
    badge.hidden = unread === 0;
    renderPanel();
  }

  bell.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });

  refresh();
  const timer = setInterval(refresh, 60_000);

  return {
    refresh,
    destroy() {
      clearInterval(timer);
      root.remove();
    },
  };
}
