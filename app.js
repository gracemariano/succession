let manifest = [];
let meetings = {};
let currentId = null;
let ownerFilter = "all";
let searchIndex = [];

const STATUS_LABELS = {
  completed: { label: "Completed", icon: "🟢", cls: "status-completed" },
  "in-progress": { label: "In Progress", icon: "🟡", cls: "status-in-progress" },
  delayed: { label: "Delayed", icon: "🔴", cls: "status-delayed" },
  "not-started": { label: "Not Started", icon: "⚪", cls: "status-not-started" },
};

async function loadManifest() {
  const res = await fetch("meetings/index.json");
  manifest = await res.json();
  manifest.sort((a, b) => new Date(b.meetingDate) - new Date(a.meetingDate));
  await Promise.all(
    manifest.map(async (m) => {
      const r = await fetch(`meetings/${m.file}`);
      meetings[m.id] = await r.json();
    })
  );
}

function fmtDate(iso) {
  if (!iso || iso === "2026-04-01") return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numSizeClass(value) {
  const len = String(value).replace(/\s/g, "").length;
  if (len <= 4) return "size-sm";
  if (len <= 6) return "size-md";
  if (len <= 9) return "size-lg";
  return "size-xl";
}

function computeAccountabilityStats(commitments) {
  const completed = commitments.filter((c) => c.status === "completed").length;
  const inProgress = commitments.filter((c) => c.status === "in-progress").length;
  const delayed = commitments.filter((c) => c.status === "delayed").length;
  const notStarted = commitments.filter((c) => c.status === "not-started").length;
  const open = inProgress + delayed + notStarted;
  const total = commitments.length;
  const rate = total ? Math.round((completed / total) * 100) : 0;
  return { completed, inProgress, delayed, notStarted, open, total, rate };
}

function renderKpiCard(kpi) {
  const v = kpi.variant || "default";
  return `<div class="kpi-card kpi-${v}">
    <div class="kpi-num ${numSizeClass(kpi.value)}">${escapeHtml(kpi.value)}</div>
    <div class="kpi-label">${escapeHtml(kpi.label)}</div>
    ${kpi.subtitle ? `<div class="kpi-sub">${escapeHtml(kpi.subtitle)}</div>` : ""}
  </div>`;
}

function renderSummaryBlock(item) {
  const pills = (item.metrics || [])
    .map(
      (m) =>
        `<span class="metric-pill"><span class="metric-pill-num ${numSizeClass(m.value)}">${escapeHtml(m.value)}</span><span class="metric-pill-label">${escapeHtml(m.label)}</span></span>`
    )
    .join("");
  return `<div class="summary-block">
    <p class="summary-theme">${escapeHtml(item.theme)}</p>
    <p class="summary-line">${escapeHtml(item.line)}</p>
    <div class="summary-pills">${pills}</div>
  </div>`;
}

function renderStatusBadge(status) {
  const s = STATUS_LABELS[status] || STATUS_LABELS["not-started"];
  return `<span class="status-badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

function renderAccountabilityTable(commitments) {
  if (!commitments.length) {
    return `<p class="discussion-summary">No commitments recorded for this session yet.</p>`;
  }
  const rows = commitments
    .map(
      (c) =>
        `<tr>
          <td><strong>${escapeHtml(c.owner)}</strong></td>
          <td>${escapeHtml(c.commitment)}</td>
          <td>${renderStatusBadge(c.status)}</td>
          <td>${escapeHtml(c.dueDate || "—")}</td>
        </tr>`
    )
    .join("");
  return `<div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>Owner</th><th>Commitment</th><th>Status</th><th>Due Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function notesKey(meetingId, field) {
  return `succession-notes:${meetingId}:${field}`;
}

function loadNotes(meetingId, field) {
  try {
    return localStorage.getItem(notesKey(meetingId, field)) || "";
  } catch {
    return "";
  }
}

function saveNotes(meetingId, field, value) {
  try {
    localStorage.setItem(notesKey(meetingId, field), value);
  } catch {
    /* ignore */
  }
}

function renderNotesArea(meetingId, field, label, placeholder) {
  const saved = loadNotes(meetingId, field);
  return `<div class="notes-block">
    <div class="notes-label">${escapeHtml(label)}</div>
    <div class="notes-area" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${escapeHtml(label)}"
      data-meeting="${escapeHtml(meetingId)}" data-field="${escapeHtml(field)}"
      data-placeholder="${escapeHtml(placeholder)}">${escapeHtml(saved)}</div>
  </div>`;
}

function renderDiscussionSection(meeting, key, title, open, priority) {
  const disc = meeting[key] || {};
  const bullets = (disc.bullets || [])
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("");
  const notesField = `${key}-notes`;
  const actionField = `${key}-actions`;
  const priorityCls = priority ? " priority" : "";
  const openAttr = open ? " open" : "";

  return `<details class="dash-section${priorityCls}"${openAttr}>
    <summary>${escapeHtml(title)}</summary>
    <div class="section-body">
      <p class="discussion-summary">${escapeHtml(disc.summary || "")}</p>
      ${bullets ? `<ul class="section-bullets">${bullets}</ul>` : ""}
      ${renderNotesArea(meeting.id, notesField, "Meeting Notes", "Capture discussion notes during the meeting…")}
      ${key !== "leadershipReflection"
        ? renderNotesArea(meeting.id, actionField, "Action Notes", "Record follow-ups and decisions…")
        : renderNotesArea(meeting.id, actionField, "Additional Notes", "Additional reflection notes…")}
    </div>
  </details>`;
}

function renderActions(actions, meetingId) {
  const owners = [...new Set(actions.map((a) => a.owner))].sort();
  const filtered = ownerFilter === "all" ? actions : actions.filter((a) => a.owner === ownerFilter);
  const ownerOpts = owners
    .map((o) => `<option value="${escapeHtml(o)}"${o === ownerFilter ? " selected" : ""}>${escapeHtml(o)}</option>`)
    .join("");

  const rows = filtered
    .map(
      (a) =>
        `<tr>
          <td><strong>${escapeHtml(a.owner)}</strong></td>
          <td>${escapeHtml(a.action)}</td>
          <td><span class="priority priority-${(a.priority || "medium").toLowerCase()}">${escapeHtml(a.priority || "—")}</span></td>
          <td>${escapeHtml(a.dueDate || "—")}</td>
          <td>${renderStatusBadge(a.status === "Open" ? "in-progress" : a.status === "Done" ? "completed" : "in-progress")}</td>
        </tr>`
    )
    .join("");

  return `<div class="actions-wrap">
    <div class="actions-toolbar">
      <label for="owner-filter">Filter by owner</label>
      <select id="owner-filter"><option value="all"${ownerFilter === "all" ? " selected" : ""}>All owners</option>${ownerOpts}</select>
      <span class="actions-count">${filtered.length} item${filtered.length === 1 ? "" : "s"}</span>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Owner</th><th>Action</th><th>Priority</th><th>Due Date</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No actions for this filter.</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

function bindNotesAreas() {
  document.querySelectorAll(".notes-area").forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("input", () => {
      saveNotes(el.dataset.meeting, el.dataset.field, el.textContent);
    });
  });
}

function renderDashboard(meeting) {
  const root = document.getElementById("dashboard");
  const scrollY = window.scrollY;
  root.classList.add("fade-out");

  requestAnimationFrame(() => {
    const isLatest = meeting.id === manifest.find((m) => !m.placeholder)?.id;
    const isPlaceholder = meeting.placeholder;
    const commitments = meeting.accountability?.commitments || [];
    const stats = computeAccountabilityStats(commitments);
    const headerKpis = meeting.headerKpis?.length
      ? meeting.headerKpis
      : [
          { value: String(meeting.actions?.length || 0), label: "Open Actions", variant: "warn" },
          { value: String(stats.completed), label: "Completed", variant: "primary" },
          { value: String(stats.inProgress), label: "In Progress", variant: "default" },
          { value: String(stats.delayed), label: "Delayed", variant: "accent" },
        ];

    const accountabilityKpis = [
      { value: String(stats.completed), label: "Completed", variant: "primary" },
      { value: String(stats.open), label: "Open", variant: "warn" },
      { value: String(stats.delayed), label: "Delayed", variant: "accent" },
      { value: `${stats.rate}%`, label: "Completion Rate", variant: "primary" },
    ];

    const attendees = (meeting.attendees || []).join(" · ");

    root.innerHTML = `
      ${isPlaceholder ? `<div class="placeholder-banner">No succession session recorded for ${escapeHtml(meeting.month)} ${meeting.year}. Writing areas are available for planning.</div>` : ""}

      <header class="meeting-header">
        <p class="meeting-badge">${isLatest ? "Latest session" : isPlaceholder ? "Placeholder" : "Archive"} · Session ${meeting.session || "—"} · ${escapeHtml(meeting.month)} ${meeting.year}</p>
        <h1 class="meeting-heading">${escapeHtml(meeting.title)}</h1>
        <p class="meeting-meta">${escapeHtml(meeting.subtitle || "")}${meeting.subtitle ? " · " : ""}${fmtDate(meeting.meetingDate)}</p>
        <div class="meeting-meta-grid">
          <div class="meta-chip"><div class="lbl">Duration</div><div class="val">${escapeHtml(meeting.duration || "—")}</div></div>
          <div class="meta-chip"><div class="lbl">Location</div><div class="val">${escapeHtml(meeting.location || "—")}</div></div>
          <div class="meta-chip"><div class="lbl">Attendees</div><div class="val">${escapeHtml(attendees || "—")}</div></div>
        </div>
      </header>

      <section class="kpi-section" aria-label="Meeting overview">
        <div class="kpi-grid">${headerKpis.map(renderKpiCard).join("")}</div>
      </section>

      <section class="sections-wrap" aria-label="Meeting sections">
        <details class="dash-section priority" open>
          <summary>30-Day Accountability Review</summary>
          <div class="section-body">
            <h3 class="section-heading" style="margin-top:0.5rem">Previous Month Commitments</h3>
            <div class="accountability-kpis">
              <div class="kpi-grid">${accountabilityKpis.map(renderKpiCard).join("")}</div>
            </div>
            ${renderAccountabilityTable(commitments)}
          </div>
        </details>

        ${renderDiscussionSection(meeting, "leadershipDiscussion", "Leadership Discussion", isLatest && !isPlaceholder, false)}
        ${renderDiscussionSection(meeting, "strategicDiscussion", "Strategic Discussion", false, false)}
        ${renderDiscussionSection(meeting, "leadershipReflection", "Leadership Reflection", false, false)}

        <details class="dash-section"${isLatest && !isPlaceholder ? " open" : ""}>
          <summary>Executive Summary</summary>
          <div class="section-body">
            ${meeting.executiveSummary?.length
              ? `<div class="summary-grid">${meeting.executiveSummary.map(renderSummaryBlock).join("")}</div>`
              : `<p class="discussion-summary">Executive summary will be added when the session is held.</p>`}
          </div>
        </details>

        ${meeting.leadershipDashboard?.length ? `
        <details class="dash-section">
          <summary>Leadership Dashboard</summary>
          <div class="section-body">
            <div class="kpi-grid">${meeting.leadershipDashboard.map(renderKpiCard).join("")}</div>
          </div>
        </details>` : ""}

        <details class="dash-section"${isLatest && !isPlaceholder ? " open" : ""}>
          <summary>Action Items</summary>
          <div class="section-body">
            ${renderActions(meeting.actions || [], meeting.id)}
          </div>
        </details>
      </section>

      <footer class="dash-footer">Arkay Packaging · Succession Planning · Confidential · One data file per session — add to <code>meetings/</code> and update <code>index.json</code>.</footer>
    `;

    document.getElementById("owner-filter")?.addEventListener("change", (e) => {
      ownerFilter = e.target.value;
      renderDashboard(meetings[currentId]);
    });

    bindNotesAreas();
    root.classList.remove("fade-out");
    window.scrollTo({ top: scrollY });
    syncHeaderHeight();
  });
}

function renderMonthBar() {
  const bar = document.getElementById("month-bar");
  const dataMonths = manifest.filter((m) => !m.placeholder);
  bar.innerHTML = manifest
    .map((m) => {
      const isLatest = m.id === dataMonths[0]?.id;
      const label = isLatest && !m.placeholder ? "Latest" : m.month;
      return `<button type="button" class="month-btn${m.id === currentId ? " active" : ""}${m.placeholder ? " month-placeholder" : ""}" data-id="${m.id}" title="${m.placeholder ? "Session not yet recorded — notes available" : ""}">${label}</button>`;
    })
    .join("");
  bar.querySelectorAll(".month-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectMeeting(btn.dataset.id, false));
  });
}

function selectMeeting(id, fromSearch) {
  if (!meetings[id]) return;
  currentId = id;
  ownerFilter = "all";
  renderMonthBar();
  renderDashboard(meetings[id]);
  const m = meetings[id];
  const isLatest = id === manifest.find((x) => !x.placeholder)?.id;
  document.getElementById("date-pill").textContent = `${m.month} Succession${isLatest ? " · Latest" : ""}${m.session ? ` · Session ${m.session}` : ""}`;
  if (!fromSearch) clearSearchResults();
}

function buildSearchIndex() {
  return manifest
    .filter((m) => !m.placeholder)
    .map((m) => {
      const data = meetings[m.id];
      const blob = [
        data.title,
        data.subtitle,
        ...(data.searchKeywords || []),
        ...(data.attendees || []),
        ...(data.executiveSummary || []).flatMap((s) => [s.theme, s.line, ...(s.metrics || []).flatMap((x) => [x.value, x.label])]),
        ...(data.accountability?.commitments || []).flatMap((c) => [c.owner, c.commitment, c.notes]),
        ...(data.leadershipDiscussion?.bullets || []),
        ...(data.strategicDiscussion?.bullets || []),
        ...(data.leadershipReflection?.bullets || []),
        ...(data.actions || []).flatMap((a) => [a.owner, a.action]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return { id: m.id, label: `${data.month} ${data.year} · Session ${data.session}`, blob };
    });
}

function runSearch(query) {
  const q = query.trim().toLowerCase();
  const resultsEl = document.getElementById("search-results");
  if (!q) {
    clearSearchResults();
    return;
  }
  const hits = searchIndex.filter((e) => e.blob.includes(q));
  if (!hits.length) {
    resultsEl.innerHTML = `<p class="search-empty">No meetings match “${escapeHtml(query)}”</p>`;
    resultsEl.hidden = false;
    return;
  }
  resultsEl.innerHTML = hits
    .map((h) => `<button type="button" class="search-hit" data-id="${h.id}">${escapeHtml(h.label)} — match found</button>`)
    .join("");
  resultsEl.hidden = false;
  resultsEl.querySelectorAll(".search-hit").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectMeeting(btn.dataset.id, true);
      document.getElementById("global-search").value = "";
    });
  });
}

function clearSearchResults() {
  const el = document.getElementById("search-results");
  el.innerHTML = "";
  el.hidden = true;
}

function syncHeaderHeight() {
  const header = document.querySelector(".site-header");
  if (header) document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
}

async function init() {
  await loadManifest();
  searchIndex = buildSearchIndex();
  const first = manifest.find((m) => !m.placeholder);
  currentId = first?.id || manifest[0]?.id;
  renderMonthBar();
  if (first) renderDashboard(meetings[currentId]);
  else document.getElementById("dashboard").innerHTML = `<p class="error">No succession meetings loaded.</p>`;
  syncHeaderHeight();
  window.addEventListener("resize", syncHeaderHeight);
  document.querySelector(".site-logo")?.addEventListener("load", syncHeaderHeight);

  const search = document.getElementById("global-search");
  let debounce;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(search.value), 180);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      clearSearchResults();
    }
  });
}

init().catch((err) => {
  document.getElementById("dashboard").innerHTML = `<p class="error">Failed to load meetings: ${escapeHtml(err.message)}</p>`;
});
