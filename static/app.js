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
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add("active");

      if (targetTab === 'categories-tab') loadCategoriesGrid();
      if (targetTab === 'campaigns-tab') loadCampaigns();
      if (targetTab === 'states-tab') loadStatesGrid();
      if (targetTab === 'creators-tab') loadCreatorsDB(currentPage);
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
        <td>
          <button class="btn btn-sm btn-outline btn-delete-creator" data-id="${item.id}" style="border-color: rgba(255,75,75,0.4); color:#ff7575; padding:0.2rem 0.5rem; font-size:0.72rem;">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      `;
      dbTableBody.appendChild(tr);
    });

    document.querySelectorAll(".btn-delete-creator").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-id"));
        if (confirm("Are you sure you want to delete this creator from the database?")) {
          await fetch(`/api/creators/${id}`, { method: 'DELETE' });
          loadCreatorsDB(currentPage);
          updateStats();
        }
      });
    });
  }

  // Modal & Edit Elements
  const modalCampaign = document.getElementById("modal-campaign");
  const modalCampaignTitle = document.getElementById("modal-campaign-title");
  const formCampaign = document.getElementById("form-campaign");
  const campaignIdInput = document.getElementById("campaign-id");
  const campaignNameInput = document.getElementById("campaign-name");
  const campaignSubjectInput = document.getElementById("campaign-subject");
  const campaignBodyInput = document.getElementById("campaign-body");
  const btnAddCampaign = document.getElementById("btn-add-campaign");
  const modalCampaignClose = document.getElementById("modal-campaign-close");
  const btnCampaignCancel = document.getElementById("btn-campaign-cancel");

  const modalCategory = document.getElementById("modal-category");
  const modalCategoryTitle = document.getElementById("modal-category-title");
  const formCategory = document.getElementById("form-category");
  const categorySlugInput = document.getElementById("category-slug");
  const categoryNameInput = document.getElementById("category-name");
  const categoryTagInput = document.getElementById("category-tag");
  const categorySubtagsInput = document.getElementById("category-subtags");
  const btnAddCategory = document.getElementById("btn-add-category");
  const modalCategoryClose = document.getElementById("modal-category-close");
  const btnCategoryCancel = document.getElementById("btn-category-cancel");
  const categoriesGrid = document.getElementById("categories-grid");

  let allCampaigns = [];
  let allCategories = [];
  let allStates = [];

  // Load Campaigns
  async function loadCampaigns() {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      allCampaigns = data.campaigns || [];
      renderCampaigns(allCampaigns);
    } catch (err) {
      console.error("Error loading campaigns:", err);
    }
  }

  function renderCampaigns(campaigns) {
    if (!campaignsList) return;
    campaignsList.innerHTML = "";
    campaigns.forEach(c => {
      const card = document.createElement("div");
      card.className = "campaign-card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h4 style="margin:0;">Template #${c.id}: ${escapeHtml(c.name)}</h4>
          <div class="card-actions">
            <button class="btn btn-sm btn-outline btn-edit-campaign" data-id="${c.id}">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button class="btn btn-sm btn-outline btn-delete-campaign" data-id="${c.id}" style="border-color: rgba(255,75,75,0.4); color:#ff7575;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
        <label style="font-size:0.75rem; color: var(--text-muted); font-weight:700;">SUBJECT LINE SPINTAX:</label>
        <code>${escapeHtml(c.subject_template || '')}</code>
        <label style="font-size:0.75rem; color: var(--text-muted); font-weight:700; margin-top:0.5rem; display:block;">BODY TEXT SPINTAX:</label>
        <pre>${escapeHtml(c.body_template || '')}</pre>
      `;
      campaignsList.appendChild(card);
    });

    // Attach Action Handlers
    document.querySelectorAll(".btn-edit-campaign").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-id"));
        const item = allCampaigns.find(x => x.id === id);
        if (item) openCampaignModal(item);
      });
    });

    document.querySelectorAll(".btn-delete-campaign").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-id"));
        if (confirm("Are you sure you want to delete this outreach email template?")) {
          await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
          loadCampaigns();
        }
      });
    });
  }

  // Load Categories
  async function loadCategoriesGrid() {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      allCategories = data.categories || [];
      renderCategories(allCategories);
    } catch (err) {
      console.error("Error loading categories:", err);
    }
  }

  function renderCategories(categories) {
    if (!categoriesGrid) return;
    categoriesGrid.innerHTML = "";
    categories.forEach(cat => {
      const card = document.createElement("div");
      card.className = "category-card";
      const tagsHtml = (cat.related_hashtags || []).map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join("");
      card.innerHTML = `
        <div class="category-header">
          <div>
            <div class="category-title">${escapeHtml(cat.category)}</div>
            <span class="category-primary-tag"><i class="fa-solid fa-tag"></i> "${escapeHtml(cat.primary_tag)}"</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-sm btn-outline btn-edit-category" data-slug="${cat.slug}">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn btn-sm btn-outline btn-delete-category" data-slug="${cat.slug}" style="border-color: rgba(255,75,75,0.4); color:#ff7575;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="category-hashtags">
          ${tagsHtml}
        </div>
      `;
      categoriesGrid.appendChild(card);
    });

    // Attach Category Action Handlers
    document.querySelectorAll(".btn-edit-category").forEach(btn => {
      btn.addEventListener("click", () => {
        const slug = btn.getAttribute("data-slug");
        const item = allCategories.find(x => x.slug === slug);
        if (item) openCategoryModal(item);
      });
    });

    document.querySelectorAll(".btn-delete-category").forEach(btn => {
      btn.addEventListener("click", async () => {
        const slug = btn.getAttribute("data-slug");
        if (confirm("Are you sure you want to delete this niche category tag?")) {
          await fetch(`/api/categories/${slug}`, { method: 'DELETE' });
          loadCategoriesGrid();
        }
      });
    });
  }

  // Load States Grid
  async function loadStatesGrid() {
    try {
      const res = await fetch("/api/states");
      const data = await res.json();
      allStates = data.states || [];
      const grid = document.getElementById("states-grid");
      const dbSelect = document.getElementById("db-state-filter");

      if (grid) grid.innerHTML = "";
      if (dbSelect) dbSelect.innerHTML = `<option value="">All States</option>`;

      allStates.forEach(s => {
        if (grid) {
          const card = document.createElement("div");
          card.className = `state-card ${s.active === false ? 'inactive' : ''}`;
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="state-code">${s.code}</span>
              <button class="btn btn-sm btn-outline btn-toggle-state" data-code="${s.code}" style="padding:0.2rem 0.5rem; font-size:0.72rem;">
                <i class="fa-solid ${s.active === false ? 'fa-toggle-off' : 'fa-toggle-on'}" style="color:${s.active === false ? '#888' : '#00f2fe'};"></i> ${s.active === false ? 'Disabled' : 'Active'}
              </button>
            </div>
            <span class="state-name">${escapeHtml(s.name)}</span>
            <span class="state-capital">Capital: ${escapeHtml(s.capital)}</span>
          `;
          grid.appendChild(card);
        }

        if (dbSelect) {
          const opt = document.createElement("option");
          opt.value = s.name;
          opt.textContent = s.name;
          dbSelect.appendChild(opt);
        }
      });

      // Attach State Toggle Handlers
      document.querySelectorAll(".btn-toggle-state").forEach(btn => {
        btn.addEventListener("click", async () => {
          const code = btn.getAttribute("data-code");
          const currentState = allStates.find(x => x.code === code);
          const newActive = currentState ? !currentState.active : false;
          await fetch(`/api/states/${code}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: newActive })
          });
          loadStatesGrid();
        });
      });
    } catch (err) {
      console.error("Error loading states:", err);
    }
  }

  // Modal Functions: Campaign
  function openCampaignModal(c = null) {
    if (c) {
      modalCampaignTitle.textContent = "Edit Email Template";
      campaignIdInput.value = c.id;
      campaignNameInput.value = c.name;
      campaignSubjectInput.value = c.subject_template || "";
      campaignBodyInput.value = c.body_template || "";
    } else {
      modalCampaignTitle.textContent = "Create New Email Template";
      campaignIdInput.value = "";
      campaignNameInput.value = "";
      campaignSubjectInput.value = "";
      campaignBodyInput.value = "";
    }
    modalCampaign.classList.add("active");
  }

  function closeCampaignModal() {
    modalCampaign.classList.remove("active");
  }

  if (btnAddCampaign) btnAddCampaign.addEventListener("click", () => openCampaignModal());
  if (modalCampaignClose) modalCampaignClose.addEventListener("click", closeCampaignModal);
  if (btnCampaignCancel) btnCampaignCancel.addEventListener("click", closeCampaignModal);

  if (formCampaign) {
    formCampaign.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = campaignIdInput.value;
      const payload = {
        name: campaignNameInput.value,
        subject_template: campaignSubjectInput.value,
        body_template: campaignBodyInput.value
      };

      const method = id ? 'PUT' : 'POST';
      const url = id ? `/api/campaigns/${id}` : '/api/campaigns';

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      closeCampaignModal();
      loadCampaigns();
    });
  }

  // Modal Functions: Category
  function openCategoryModal(cat = null) {
    if (cat) {
      modalCategoryTitle.textContent = "Edit Niche Category Tag";
      categorySlugInput.value = cat.slug;
      categoryNameInput.value = cat.category;
      categoryTagInput.value = cat.primary_tag;
      categorySubtagsInput.value = (cat.related_hashtags || []).join(", ");
    } else {
      modalCategoryTitle.textContent = "Add New Niche Category Tag";
      categorySlugInput.value = "";
      categoryNameInput.value = "";
      categoryTagInput.value = "";
      categorySubtagsInput.value = "";
    }
    modalCategory.classList.add("active");
  }

  function closeCategoryModal() {
    modalCategory.classList.remove("active");
  }

  if (btnAddCategory) btnAddCategory.addEventListener("click", () => openCategoryModal());
  if (modalCategoryClose) modalCategoryClose.addEventListener("click", closeCategoryModal);
  if (btnCategoryCancel) btnCategoryCancel.addEventListener("click", closeCategoryModal);

  if (formCategory) {
    formCategory.addEventListener("submit", async (e) => {
      e.preventDefault();
      const slug = categorySlugInput.value;
      const payload = {
        category: categoryNameInput.value,
        primary_tag: categoryTagInput.value,
        related_hashtags: categorySubtagsInput.value.split(",").map(x => x.trim()).filter(Boolean)
      };

      const method = slug ? 'PUT' : 'POST';
      const url = slug ? `/api/categories/${slug}` : '/api/categories';

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      closeCategoryModal();
      loadCategoriesGrid();
    });
  }

  // Event Listeners
  if (dbSearchInput) dbSearchInput.addEventListener("input", debounce(() => loadCreatorsDB(1), 300));
  if (dbContactFilter) dbContactFilter.addEventListener("change", () => loadCreatorsDB(1));

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
