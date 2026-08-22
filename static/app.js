document.addEventListener("DOMContentLoaded", () => {
  let engineState = 'STOPPED';
  let currentPage = 1;
  const pageSize = 20;

  // DOM Elements
  const navItems = document.querySelectorAll(".nav-item");
  const tabPanes = document.querySelectorAll(".tab-pane");

  const btnToggleEngine = document.getElementById("btn-toggle-engine");
  const toggleIcon = document.getElementById("toggle-icon");
  const toggleBtnText = document.getElementById("toggle-btn-text");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const statusSubtext = document.getElementById("status-subtext");

  const statSerperCredits = document.getElementById("stat-serper-credits");
  const statEmailsSent = document.getElementById("stat-emails-sent");
  const statBatchCount = document.getElementById("stat-batch-count");
  const statRestTimer = document.getElementById("stat-rest-timer");
  const statTotalCreators = document.getElementById("stat-total-creators");
  const sidebarDbCount = document.getElementById("sidebar-db-count");

  const fillSerper = document.getElementById("fill-serper");
  const fillEmails = document.getElementById("fill-emails");

  const terminalFeed = document.getElementById("terminal-feed");
  const btnClearTerminal = document.getElementById("btn-clear-terminal");

  const dbTableBody = document.getElementById("db-table-body");
  const dbSearchInput = document.getElementById("db-search-input");
  const dbContactFilter = document.getElementById("db-contact-filter");
  const dbPlatformFilter = document.getElementById("db-platform-filter");
  const dbStateFilter = document.getElementById("db-state-filter");
  const btnPrevPage = document.getElementById("btn-prev-page");
  const btnNextPage = document.getElementById("btn-next-page");
  const paginationText = document.getElementById("pagination-text");
  const pageNumIndicator = document.getElementById("page-num-indicator");

  const campaignsList = document.getElementById("campaigns-list");
  const btnExportCsv = document.getElementById("btn-export-csv");
  const btnRefreshData = document.getElementById("btn-refresh-data");

  // Tab Navigation
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetTab = item.getAttribute("data-tab");
      navItems.forEach(nav => nav.classList.remove("active"));
      tabPanes.forEach(pane => pane.classList.remove("active"));

      item.classList.add("active");
      document.getElementById(targetTab).classList.add("active");
    });
  });

  // Start / Stop Toggle Button Handler
  btnToggleEngine.addEventListener("click", async () => {
    btnToggleEngine.disabled = true;
    try {
      if (engineState === 'RUNNING' || engineState === 'AUTO_RESTING') {
        const res = await fetch("/api/engine/stop", { method: "POST" });
        const data = await res.json();
        updateEngineUI(data.status);
      } else {
        const res = await fetch("/api/engine/start", { method: "POST" });
        const data = await res.json();
        updateEngineUI(data.status);
      }
    } catch (err) {
      alert("Error toggling engine: " + err.message);
    } finally {
      btnToggleEngine.disabled = false;
    }
  });

  function updateEngineUI(status) {
    if (!status) return;
    engineState = status.state;

    // Quotas & Stats Update
    const serperUsed = status.serperCreditsUsedToday || 0;
    const emailsSent = status.emailsSentToday || 0;
    const batchCount = status.emailsSentInBatch || 0;
    const restSec = status.restSecondsRemaining || 0;

    statSerperCredits.textContent = `${serperUsed} / ${status.maxSerperCreditsPerDay || 150}`;
    statEmailsSent.textContent = `${emailsSent} / ${status.maxEmailsPerDay || 200}`;
    statBatchCount.textContent = `${batchCount} / 30`;

    fillSerper.style.width = `${Math.min(100, (serperUsed / 150) * 100)}%`;
    fillEmails.style.width = `${Math.min(100, (emailsSent / 200) * 100)}%`;

    if (engineState === 'RUNNING') {
      btnToggleEngine.className = "btn-toggle-engine is-running";
      toggleIcon.className = "fa-solid fa-square";
      toggleBtnText.textContent = "STOP SERVICE";

      statusDot.className = "status-indicator running";
      statusText.textContent = "ENGINE RUNNING";
      statusSubtext.textContent = "Loop Active: Searching & Sending";
      statRestTimer.textContent = `Batch: ${batchCount}/30 sent`;

    } else if (engineState === 'AUTO_RESTING') {
      btnToggleEngine.className = "btn-toggle-engine is-resting";
      toggleIcon.className = "fa-solid fa-square";
      toggleBtnText.textContent = "STOP SERVICE";

      statusDot.className = "status-indicator resting";
      statusText.textContent = "AUTO-RESTING";
      const mins = Math.floor(restSec / 60);
      const secs = restSec % 60;
      const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      statusSubtext.textContent = `Auto-Resume in ${timeStr}`;
      statRestTimer.textContent = `Resting: ${timeStr} remaining (Auto Resumes)`;

    } else {
      btnToggleEngine.className = "btn-toggle-engine is-stopped";
      toggleIcon.className = "fa-solid fa-play";
      toggleBtnText.textContent = "START SERVICE";

      statusDot.className = "status-indicator offline";
      statusText.textContent = "Engine Stopped";
      statusSubtext.textContent = "Click button to start loop";
      statRestTimer.textContent = `Next Rest: 30 remaining`;
    }
  }

  // Connect to SSE Live Stream (`/api/engine/stream`)
  function initSSE() {
    const evtSource = new EventSource("/api/engine/stream");

    evtSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "init") {
          updateEngineUI(msg.status);
        } else if (msg.type === "tick") {
          if (msg.payload && msg.payload.restSecondsRemaining !== undefined) {
            const restSec = msg.payload.restSecondsRemaining;
            const mins = Math.floor(restSec / 60);
            const secs = restSec % 60;
            const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            statRestTimer.textContent = `Resting: ${timeStr} remaining (Auto Resumes)`;
            statusSubtext.textContent = `Auto-Resume in ${timeStr}`;
          }
        } else if (msg.type === "log") {
          appendLogLine(msg.payload);
          if (msg.payload.engineState) {
            updateEngineUI(msg.payload.engineState);
          }
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    evtSource.onerror = (err) => {
      console.warn("SSE Connection Error. Retrying in 3s...", err);
      evtSource.close();
      setTimeout(initSSE, 3000);
    };
  }

  function appendLogLine(payload) {
    const div = document.createElement("div");
    const typeClass = payload.type || 'info';
    const dateStr = new Date(payload.timestamp).toLocaleTimeString();
    div.className = `terminal-line ${typeClass}`;
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = `[${dateStr}] ${payload.message}`;

    terminalFeed.appendChild(div);
    terminalFeed.scrollTop = terminalFeed.scrollHeight;

    // Refresh DB creators table if new creator saved, email sent, or SMTP validation updated
    if (payload.message && (
      payload.message.includes("Saved") || 
      payload.message.includes("Email Sent") || 
      payload.message.includes("SMTP Validation") ||
      payload.message.includes("Extracted") ||
      payload.message.includes("Serper returned")
    )) {
      loadStats();
      if (currentPage === 1) loadCreatorsDB(1);
    }
  }

  btnClearTerminal.addEventListener("click", () => {
    terminalFeed.innerHTML = `<div class="terminal-line system">[SYSTEM] Terminal log cleared.</div>`;
  });

  // Fetch Stats
  async function loadStats() {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      statTotalCreators.textContent = (data.total_creators || 0).toLocaleString();
      sidebarDbCount.textContent = (data.total_creators || 0).toLocaleString();
      updateEngineUI(data.engine);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }

  // Load Creators Database (Sorted Newest First)
  async function loadCreatorsDB(page = 1) {
    currentPage = page;
    const search = dbSearchInput.value;
    const contactType = dbContactFilter ? dbContactFilter.value : "all";
    const platform = dbPlatformFilter.value;
    const location = dbStateFilter.value;

    let url = `/api/creators?page=${page}&limit=${pageSize}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (contactType && contactType !== "all") url += `&contact_type=${encodeURIComponent(contactType)}`;
    if (platform && platform !== "all") url += `&platform=${encodeURIComponent(platform)}`;
    if (location && location !== "all") url += `&location=${encodeURIComponent(location)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      renderCreatorsDB(data.items || []);

      const total = data.total || 0;
      const totalPages = data.total_pages || 1;
      const startCount = (page - 1) * pageSize + 1;
      const endCount = Math.min(page * pageSize, total);

      paginationText.textContent = `Showing ${total > 0 ? startCount : 0} to ${endCount} of ${total.toLocaleString()} creators`;
      pageNumIndicator.textContent = `Page ${page} of ${totalPages}`;

      btnPrevPage.disabled = page <= 1;
      btnNextPage.disabled = page >= totalPages;

    } catch (err) {
      console.error("Error loading creators DB:", err);
    }
  }

  function renderCreatorsDB(items) {
    dbTableBody.innerHTML = "";
    if (items.length === 0) {
      dbTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--text-muted); padding: 2rem;">No creators found.</td></tr>`;
      return;
    }

    items.forEach(item => {
      const tr = document.createElement("tr");
      const platformClass = `badge-${(item.platform || "instagram").toLowerCase()}`;
      const isValid = item.email_is_valid;
      tr.innerHTML = `
        <td><code>#${item.id}</code></td>
        <td><strong>${escapeHtml(item.name || "Unknown")}</strong></td>
        <td><span class="platform-badge ${platformClass}">${item.platform || "social"}</span></td>
        <td><a href="${escapeHtml(item.profile_url || '#')}" target="_blank" style="color: var(--accent-cyan); text-decoration: none;"><i class="fa-solid fa-link"></i> ${escapeHtml(item.profile_url ? item.profile_url.substring(0, 32) + '...' : 'N/A')}</a></td>
        <td><code>${escapeHtml(item.email_address || "N/A")}</code></td>
        <td>${escapeHtml(item.phone || "N/A")}</td>
        <td><span class="${isValid ? 'badge-valid' : 'badge-pending'}">${isValid ? '✓ 250 OK (SMTP Handshake Passed)' : 'Pending SMTP Validation'}</span></td>
        <td>${escapeHtml(item.location || "USA")}</td>
        <td>${item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}</td>
      `;
      dbTableBody.appendChild(tr);
    });
  }

  // Load Campaigns & Templates
  async function loadCampaigns() {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      renderCampaigns(data.campaigns || []);
    } catch (err) {
      console.error("Error loading campaigns:", err);
    }
  }

  function renderCampaigns(campaigns) {
    campaignsList.innerHTML = "";
    campaigns.forEach(c => {
      const card = document.createElement("div");
      card.className = "campaign-card";
      card.innerHTML = `
        <h4>Campaign #${c.id}: ${escapeHtml(c.name)}</h4>
        <label style="font-size:0.75rem; color: var(--text-muted); font-weight:700;">SUBJECT LINE SPINTAX:</label>
        <code>${escapeHtml(c.subject_template || '')}</code>
        <label style="font-size:0.75rem; color: var(--text-muted); font-weight:700;">BODY TEXT SPINTAX:</label>
        <pre>${escapeHtml(c.body_template || '')}</pre>
      `;
      campaignsList.appendChild(card);
    });
  }

  // Load States Grid
  async function loadStatesGrid() {
    try {
      const res = await fetch("/api/states");
      const data = await res.json();
      const states = data.states || [];
      const grid = document.getElementById("states-grid");
      const dbSelect = document.getElementById("db-state-filter");

      grid.innerHTML = "";
      dbSelect.innerHTML = `<option value="all">All States</option>`;

      states.forEach(s => {
        const card = document.createElement("div");
        card.className = "state-card";
        card.innerHTML = `
          <span class="state-code">${s.code}</span>
          <span class="state-name">${escapeHtml(s.name)}</span>
          <span class="state-capital">Capital: ${escapeHtml(s.capital)}</span>
        `;
        grid.appendChild(card);

        const opt = document.createElement("option");
        opt.value = s.name;
        opt.textContent = s.name;
        dbSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Error loading states:", err);
    }
  }

  // Event Listeners
  dbSearchInput.addEventListener("input", debounce(() => loadCreatorsDB(1), 300));
  if (dbContactFilter) dbContactFilter.addEventListener("change", () => loadCreatorsDB(1));
  dbPlatformFilter.addEventListener("change", () => loadCreatorsDB(1));
  dbStateFilter.addEventListener("change", () => loadCreatorsDB(1));

  btnPrevPage.addEventListener("click", () => {
    if (currentPage > 1) loadCreatorsDB(currentPage - 1);
  });

  btnNextPage.addEventListener("click", () => {
    loadCreatorsDB(currentPage + 1);
  });

  btnRefreshData.addEventListener("click", () => {
    loadStats();
    loadCreatorsDB(currentPage);
  });

  btnExportCsv.addEventListener("click", () => {
    const search = dbSearchInput.value;
    const contactType = dbContactFilter ? dbContactFilter.value : "all";
    const platform = dbPlatformFilter.value;
    const location = dbStateFilter.value;
    window.location.href = `/api/export/csv?search=${encodeURIComponent(search)}&contact_type=${encodeURIComponent(contactType)}&platform=${encodeURIComponent(platform)}&location=${encodeURIComponent(location)}`;
  });

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Initial Boot
  loadStats();
  loadCreatorsDB(1);
  loadCampaigns();
  loadStatesGrid();
  initSSE();

  // Automatic 5-second poll timer to keep creator table & stats 100% updated in real-time
  setInterval(() => {
    loadStats();
    if (currentPage === 1) loadCreatorsDB(1);
  }, 5000);
});
