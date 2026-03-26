const api = {
  async get(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  },
  async postFile(path, file) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(path, { method: "POST", body: formData });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Upload failed.");
    }
    return response.json();
  },
  async postJson(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Request failed.");
    }
    return response.json();
  },
};

const DEMO_STORAGE_KEY = "bookkeeping_demo_session_v1";

const state = {
  categories: [],
  statementRows: [],
  receiptRows: [],
  statementFile: null,
  receiptFile: null,
  statementPreviewUrl: "",
  receiptPreviewUrl: "",
  appConfig: {
    appName: "Personal Bookkeeping App",
    publicDemoMode: false,
    allowRealUploads: true,
    allowPersistentSave: true,
    allowSettingsEdit: true,
    allowOpenLedger: true,
    allowExports: true,
    demoNotice: "",
    workbookLabel: "",
  },
  demoBootstrap: null,
  demoStore: null,
};

const elements = {
  appTitle: document.getElementById("appTitle"),
  sidebarEyebrow: document.getElementById("sidebarEyebrow"),
  sidebarSubtitle: document.getElementById("sidebarSubtitle"),
  sidebarWorkbookPath: document.getElementById("sidebarWorkbookPath"),
  sidebarModeNote: document.getElementById("sidebarModeNote"),
  topbarEyebrow: document.getElementById("topbarEyebrow"),
  appModeBanner: document.getElementById("appModeBanner"),
  heroHeading: document.getElementById("heroHeading"),
  heroSubtle: document.getElementById("heroSubtle"),
  resetDemoBtn: document.getElementById("resetDemoBtn"),
  statementDropzone: document.getElementById("statementDropzone"),
  statementFileInput: document.getElementById("statementFile"),
  uploadStatementBtn: document.getElementById("uploadStatementBtn"),
  loadDemoStatementBtn: document.getElementById("loadDemoStatementBtn"),
  statementDemoNotice: document.getElementById("statementDemoNotice"),
  receiptDropzone: document.getElementById("receiptDropzone"),
  receiptFileInput: document.getElementById("receiptFile"),
  uploadReceiptBtn: document.getElementById("uploadReceiptBtn"),
  loadDemoReceiptBtn: document.getElementById("loadDemoReceiptBtn"),
  receiptDemoNotice: document.getElementById("receiptDemoNotice"),
  openLedgerBtn: document.getElementById("openLedgerBtn"),
  sidebarOpenLedgerBtn: document.getElementById("sidebarOpenLedgerBtn"),
  downloadLedgerBtn: document.getElementById("downloadLedgerBtn"),
  sidebarExportLedgerBtn: document.getElementById("sidebarExportLedgerBtn"),
  downloadSummaryBtn: document.getElementById("downloadSummaryBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  settingsHeading: document.getElementById("settingsHeading"),
  settingsReadOnlyNotice: document.getElementById("settingsReadOnlyNotice"),
  helpWorkflowLastItem: document.getElementById("helpWorkflowLastItem"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isNaN(number) ? value : number.toFixed(2);
}

function setMessage(elementId, text, type = "") {
  const element = document.getElementById(elementId);
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isDemoMode() {
  return Boolean(state.appConfig.publicDemoMode);
}

function setView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  document.getElementById(viewId).classList.add("active");
  document.getElementById("viewTitle").textContent =
    document.querySelector(`.nav-button[data-view="${viewId}"]`)?.textContent || "Overview";
}

async function activateView(viewId) {
  setView(viewId);
  if (viewId === "home") await loadOverview();
  if (viewId === "ledger") await loadLedger();
  if (viewId === "reports") await loadReports();
  if (viewId === "settings") await loadSettings();
}

function renderFileMeta(containerId, file) {
  const container = document.getElementById(containerId);
  if (!file) {
    container.textContent = "No file selected yet.";
    container.className = "file-meta empty-state";
    return;
  }

  container.className = "file-meta";
  if (file.isDemoSample) {
    container.innerHTML = `
      <strong>${escapeHtml(file.name)}</strong><br />
      Source: Demo sample document<br />
      Safe to test: nothing gets uploaded from your computer
    `;
    return;
  }

  container.innerHTML = `
    <strong>${escapeHtml(file.name)}</strong><br />
    Size: ${Math.round(file.size / 1024)} KB<br />
    Type: ${escapeHtml(file.type || "Unknown")}
  `;
}

function renderPreview(containerId, previewUrl) {
  const container = document.getElementById(containerId);
  if (!previewUrl) {
    container.className = "preview-surface empty-state";
    container.textContent = "No preview available yet.";
    return;
  }

  container.className = "preview-surface";
  const lower = previewUrl.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|bmp|tif|tiff)$/.test(lower)) {
    container.innerHTML = `<img src="${previewUrl}" alt="Uploaded document preview" />`;
    return;
  }
  container.innerHTML = `<iframe src="${previewUrl}" title="Uploaded document preview"></iframe>`;
}

function renderSummaryPills(containerId, items) {
  const container = document.getElementById(containerId);
  if (!items.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = items.map((item) => `<span class="summary-pill">${escapeHtml(item)}</span>`).join("");
}

function buildCategoryOptions(selected = "Other") {
  return state.categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`
    )
    .join("");
}

function bindReviewInputs() {
  document.querySelectorAll("[data-row-type][data-index][data-field]").forEach((element) => {
    element.addEventListener("change", (event) => {
      const { rowType, index, field } = event.target.dataset;
      const target = rowType === "statement" ? state.statementRows : state.receiptRows;
      let value = event.target.value;
      if (["debit", "credit", "balance", "amount", "tax"].includes(field)) {
        value = value === "" ? "" : Number(value);
      }
      target[Number(index)][field] = value;
      target[Number(index)].needs_review = false;
      target[Number(index)].status = "Ready";
    });
  });
}

function reviewToolbar(type, rows) {
  if (!rows.length) return "";
  const reviewCount = rows.filter((row) => row.needs_review).length;
  const readyCount = rows.length - reviewCount;
  const saveLabel = isDemoMode() ? "Step 4. Save to Demo Ledger" : "Step 4. Save Approved Rows";
  return `
    <div class="summary-strip">
      <span class="summary-pill">${rows.length} row(s) extracted</span>
      <span class="summary-pill">${readyCount} ready</span>
      <span class="summary-pill">${reviewCount} need review</span>
    </div>
    <div class="inline-actions">
      <button class="primary-button" id="${type}SaveBtn">${saveLabel}</button>
      <button class="secondary-button" id="${type}DiscardBtn">Discard Preview</button>
    </div>
  `;
}

function renderStatementReview() {
  const container = document.getElementById("statementReview");
  const rows = state.statementRows;
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No statement rows yet. Choose a file and extract it first.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="review-shell">
      ${reviewToolbar("statement", rows)}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr class="${row.needs_review ? "review-warning" : ""}">
                <td><input data-row-type="statement" data-index="${index}" data-field="date" value="${escapeHtml(row.date)}" /></td>
                <td><input data-row-type="statement" data-index="${index}" data-field="description" value="${escapeHtml(row.description)}" /></td>
                <td><select data-row-type="statement" data-index="${index}" data-field="category">${buildCategoryOptions(row.category)}</select></td>
                <td><input type="number" step="0.01" data-row-type="statement" data-index="${index}" data-field="debit" value="${formatNumber(row.debit)}" /></td>
                <td><input type="number" step="0.01" data-row-type="statement" data-index="${index}" data-field="credit" value="${formatNumber(row.credit)}" /></td>
                <td><input type="number" step="0.01" data-row-type="statement" data-index="${index}" data-field="balance" value="${formatNumber(row.balance)}" /></td>
                <td><span class="badge ${row.needs_review ? "review" : "ready"}">${escapeHtml(row.status || "Ready")}</span></td>
                <td><input data-row-type="statement" data-index="${index}" data-field="notes" value="${escapeHtml(row.notes)}" /></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindReviewInputs();
  document.getElementById("statementSaveBtn").addEventListener("click", saveStatementRows);
  document.getElementById("statementDiscardBtn").addEventListener("click", clearStatementDraft);
}

function renderReceiptReview() {
  const container = document.getElementById("receiptReview");
  const rows = state.receiptRows;
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No receipt rows yet. Choose a file and extract it first.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="review-shell">
      ${reviewToolbar("receipt", rows)}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Tax</th>
              <th>Linked Ledger ID</th>
              <th>Payment Method</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr class="${row.needs_review ? "review-warning" : ""}">
                <td><input data-row-type="receipt" data-index="${index}" data-field="date" value="${escapeHtml(row.date)}" /></td>
                <td><input data-row-type="receipt" data-index="${index}" data-field="vendor" value="${escapeHtml(row.vendor)}" /></td>
                <td><input type="number" step="0.01" data-row-type="receipt" data-index="${index}" data-field="amount" value="${formatNumber(row.amount)}" /></td>
                <td><input type="number" step="0.01" data-row-type="receipt" data-index="${index}" data-field="tax" value="${formatNumber(row.tax)}" /></td>
                <td><input data-row-type="receipt" data-index="${index}" data-field="linked_ledger_id" value="${escapeHtml(row.linked_ledger_id)}" /></td>
                <td><input data-row-type="receipt" data-index="${index}" data-field="payment_method" value="${escapeHtml(row.payment_method)}" /></td>
                <td><span class="badge ${row.needs_review ? "review" : "ready"}">${escapeHtml(row.status || "Ready")}</span></td>
                <td><input data-row-type="receipt" data-index="${index}" data-field="notes" value="${escapeHtml(row.notes)}" /></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindReviewInputs();
  document.getElementById("receiptSaveBtn").addEventListener("click", saveReceiptRows);
  document.getElementById("receiptDiscardBtn").addEventListener("click", clearReceiptDraft);
}

function renderTable(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No rows found.</div>`;
    return;
  }

  const headers = Object.keys(rows[0]);
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header] ?? "")}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRecentImports(rows) {
  const container = document.getElementById("recentImportsList");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No imports yet.</div>`;
    return;
  }

  container.innerHTML = rows.map((row) => `
    <article class="list-item">
      <div>
        <strong>${escapeHtml(row["File Name"] || "")}</strong><br />
        <span class="small-note">${escapeHtml(row["Import Date/Time"] || "")}</span>
      </div>
      <div>
        <span class="badge ${String(row.Result || "").toLowerCase().includes("fail") ? "review" : "ready"}">${escapeHtml(row.Result || "")}</span><br />
        <span class="small-note">${escapeHtml(row["File Type"] || "")} | ${escapeHtml(row["Rows Extracted"] || 0)} rows</span>
      </div>
    </article>
  `).join("");
}

function renderReports(summary) {
  const container = document.getElementById("reportsContent");
  const categoryRows = Object.entries(summary.monthlyByCategory || {});
  const incomeRows = Object.entries(summary.incomeVsExpense || {});

  if (!categoryRows.length && !incomeRows.length) {
    container.innerHTML = `<div class="empty-state">No report data yet. Save a statement first.</div>`;
    return;
  }

  let html = "";
  if (incomeRows.length) {
    html += `
      <div class="card-grid three compact-cards">
        ${incomeRows.slice(-3).map(([month, values]) => `
          <article class="stat-card">
            <p class="stat-label">${escapeHtml(month)}</p>
            <h3>${formatNumber(values.income - values.expense)}</h3>
            <p class="small-note">Income ${formatNumber(values.income)} | Expenses ${formatNumber(values.expense)}</p>
          </article>
        `).join("")}
      </div>
    `;
  }

  html += '<div class="card-grid two">';
  html += `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Monthly totals</p>
          <h3>Income vs expenses</h3>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Income</th><th>Expense</th></tr></thead>
          <tbody>
            ${incomeRows.map(([month, values]) => `
              <tr>
                <td>${escapeHtml(month)}</td>
                <td>${formatNumber(values.income)}</td>
                <td>${formatNumber(values.expense)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  html += `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Category totals</p>
          <h3>Monthly by category</h3>
        </div>
      </div>
      ${categoryRows.map(([month, values]) => `
        <h4>${escapeHtml(month)}</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Total</th></tr></thead>
            <tbody>
              ${Object.entries(values).map(([category, total]) => `
                <tr>
                  <td>${escapeHtml(category)}</td>
                  <td>${formatNumber(total)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}
    </section>
  `;

  html += "</div>";
  container.innerHTML = html;
}

function createDemoFileDescriptor(fileName) {
  return { name: fileName, size: 0, type: "Demo sample", isDemoSample: true };
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // Ignore browsers that block local storage.
  }
}

function applyAppConfig(config = {}) {
  state.appConfig = { ...state.appConfig, ...config };
  document.title = state.appConfig.appName || "Personal Bookkeeping";
  elements.appTitle.textContent = state.appConfig.appName || "Personal Bookkeeping";

  if (isDemoMode()) {
    elements.sidebarEyebrow.textContent = "Hosted Public Demo";
    elements.sidebarSubtitle.textContent = "Safe sample data only. Nothing from visitors is stored permanently.";
    elements.topbarEyebrow.textContent = "Hosted bookkeeping demo";
    elements.heroHeading.textContent = "Explore the full bookkeeping workflow with sample data in a safe browser sandbox.";
    elements.heroSubtle.textContent =
      "Load the sample statement or receipt, review the extracted rows, and save them into your own demo session without touching real financial records.";
    elements.sidebarModeNote.textContent = "This hosted copy does not accept real uploads or permanent saves.";
    elements.sidebarModeNote.classList.remove("hidden");
    elements.appModeBanner.textContent = state.appConfig.demoNotice || "";
    elements.appModeBanner.classList.toggle("hidden", !state.appConfig.demoNotice);
    elements.resetDemoBtn.classList.remove("hidden");
    elements.settingsHeading.textContent = "Demo settings preview";
    elements.settingsReadOnlyNotice.textContent =
      "Settings are shown for demonstration only. Public visitors cannot change OCR paths, categories, or parsers on the hosted demo.";
    elements.settingsReadOnlyNotice.classList.remove("hidden");
    elements.helpWorkflowLastItem.textContent = "Exports and Excel opening stay off in the public demo for safety.";

    elements.statementDropzone.classList.add("disabled");
    elements.receiptDropzone.classList.add("disabled");
    elements.statementFileInput.disabled = true;
    elements.receiptFileInput.disabled = true;
    elements.uploadStatementBtn.classList.add("hidden");
    elements.uploadReceiptBtn.classList.add("hidden");
    elements.statementDemoNotice.classList.remove("hidden");
    elements.receiptDemoNotice.classList.remove("hidden");

    [
      elements.openLedgerBtn,
      elements.sidebarOpenLedgerBtn,
      elements.downloadLedgerBtn,
      elements.sidebarExportLedgerBtn,
      elements.downloadSummaryBtn,
      elements.saveSettingsBtn,
    ].forEach((element) => {
      element.disabled = true;
      element.classList.add("hidden");
    });
  } else {
    elements.sidebarEyebrow.textContent = "Local Desktop Ledger";
    elements.sidebarSubtitle.textContent = "Private, simple, and stored on your PC.";
    elements.topbarEyebrow.textContent = "Local bookkeeping assistant";
    elements.heroHeading.textContent = "Import, review, and save your records without leaving your computer.";
    elements.heroSubtle.textContent = "Use the quick actions below or go straight to statement and receipt imports.";
    elements.sidebarModeNote.classList.add("hidden");
    elements.appModeBanner.classList.add("hidden");
    elements.resetDemoBtn.classList.add("hidden");
    elements.settingsHeading.textContent = "Adjust local categories and OCR paths";
    elements.settingsReadOnlyNotice.classList.add("hidden");
    elements.helpWorkflowLastItem.textContent = "Open the workbook in Excel whenever you want.";

    elements.statementDropzone.classList.remove("disabled");
    elements.receiptDropzone.classList.remove("disabled");
    elements.statementFileInput.disabled = false;
    elements.receiptFileInput.disabled = false;
    elements.uploadStatementBtn.classList.remove("hidden");
    elements.uploadReceiptBtn.classList.remove("hidden");
    elements.statementDemoNotice.classList.add("hidden");
    elements.receiptDemoNotice.classList.add("hidden");

    [
      elements.openLedgerBtn,
      elements.sidebarOpenLedgerBtn,
      elements.downloadLedgerBtn,
      elements.sidebarExportLedgerBtn,
      elements.downloadSummaryBtn,
      elements.saveSettingsBtn,
    ].forEach((element) => {
      element.disabled = false;
      element.classList.remove("hidden");
    });
  }
}

async function loadAppConfig() {
  const config = await api.get("/api/app-config");
  applyAppConfig(config);
}

function getInitialDemoStore() {
  if (!state.demoBootstrap) return null;
  return {
    settings: deepClone(state.demoBootstrap.settings || {}),
    ledger: deepClone(state.demoBootstrap.ledger || []),
    receipts: deepClone(state.demoBootstrap.receipts || []),
    importsLog: deepClone(state.demoBootstrap.importsLog || []),
    demoStatement: deepClone(state.demoBootstrap.demoStatement || {}),
    demoReceipt: deepClone(state.demoBootstrap.demoReceipt || {}),
  };
}

function persistDemoStore() {
  if (!isDemoMode() || !state.demoStore) return;
  safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(state.demoStore));
}

async function loadDemoBootstrap() {
  const payload = await api.get("/api/demo/bootstrap");
  state.demoBootstrap = deepClone(payload);

  const storedRaw = safeLocalStorageGet(DEMO_STORAGE_KEY);
  if (storedRaw) {
    try {
      state.demoStore = JSON.parse(storedRaw);
    } catch (error) {
      state.demoStore = getInitialDemoStore();
    }
  } else {
    state.demoStore = getInitialDemoStore();
  }

  if (!state.demoStore) {
    state.demoStore = getInitialDemoStore();
  }

  state.categories = (state.demoStore?.settings?.defaultCategories || []).slice();
  persistDemoStore();
}

function getDemoStore() {
  if (!state.demoStore) {
    state.demoStore = getInitialDemoStore();
  }
  return state.demoStore;
}

function getDemoLedgerRows(filters = {}) {
  const rows = deepClone(getDemoStore().ledger || []);
  return rows.filter((row) => {
    const rowDate = String(row["Date"] || "");
    if (filters.date_from && rowDate && rowDate < String(filters.date_from)) return false;
    if (filters.date_to && rowDate && rowDate > String(filters.date_to)) return false;
    if (filters.category && row["Category"] !== filters.category) return false;
    if (filters.source && row["Source Type"] !== filters.source) return false;

    const amount = Math.max(Number(row.Debit || 0), Number(row.Credit || 0));
    if (filters.min_amount !== "" && filters.min_amount !== null && filters.min_amount !== undefined && amount < Number(filters.min_amount)) {
      return false;
    }
    if (filters.max_amount !== "" && filters.max_amount !== null && filters.max_amount !== undefined && amount > Number(filters.max_amount)) {
      return false;
    }
    return true;
  });
}

function getDemoReports() {
  const ledgerRows = getDemoStore().ledger || [];
  const monthlyByCategory = {};
  const incomeVsExpense = {};

  ledgerRows.forEach((row) => {
    const month = String(row["Date"] || "").slice(0, 7) || "Unknown";
    if (!monthlyByCategory[month]) monthlyByCategory[month] = {};
    if (!incomeVsExpense[month]) incomeVsExpense[month] = { income: 0, expense: 0 };

    const category = row["Category"] || "Other";
    const debit = Number(row.Debit || 0);
    const credit = Number(row.Credit || 0);

    monthlyByCategory[month][category] = (monthlyByCategory[month][category] || 0) + (credit - debit);
    incomeVsExpense[month].income += credit;
    incomeVsExpense[month].expense += debit;
  });

  return { monthlyByCategory, incomeVsExpense };
}

function getDemoOverview() {
  const store = getDemoStore();
  const ledgerRows = store.ledger || [];
  const receiptRows = store.receipts || [];
  const importsRows = store.importsLog || [];

  const expenseTotal = ledgerRows.reduce((sum, row) => sum + Number(row.Debit || 0), 0);
  const incomeTotal = ledgerRows.reduce((sum, row) => sum + Number(row.Credit || 0), 0);
  const reviewCount = ledgerRows.filter((row) => String(row.Status || "").toLowerCase() === "needs review").length;

  return {
    totals: {
      ledgerEntries: ledgerRows.length,
      receipts: receiptRows.length,
      imports: importsRows.length,
      needsReview: reviewCount,
      income: Number(incomeTotal.toFixed(2)),
      expenses: Number(expenseTotal.toFixed(2)),
      matchedReceipts: receiptRows.filter((row) => row["Linked Ledger ID"]).length,
    },
    recentImports: [...importsRows].reverse().slice(0, 8),
  };
}

function nextDemoSequence(rows, key, prefix) {
  let maxValue = 0;
  rows.forEach((row) => {
    const raw = String(row[key] || "");
    const number = Number(raw.replace(prefix, ""));
    if (!Number.isNaN(number)) {
      maxValue = Math.max(maxValue, number);
    }
  });
  return maxValue + 1;
}

function buildDemoImportLog(fileName, fileType, rowsExtracted, result) {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  return {
    "Import Date/Time": stamp,
    "File Name": fileName,
    "File Type": fileType,
    "Rows Extracted": rowsExtracted,
    Result: result,
    "Error Notes": "",
  };
}

async function loadSettings() {
  if (isDemoMode()) {
    const store = getDemoStore();
    const data = store.settings || {};
    state.categories = (data.defaultCategories || data.categories || []).slice();

    const categorySelect = document.getElementById("filterCategory");
    categorySelect.innerHTML = '<option value="">All Categories</option>';
    state.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });

    elements.sidebarWorkbookPath.textContent = state.appConfig.workbookLabel || data.workbookPath || "Demo workbook";
    document.getElementById("settingsCurrency").value = data.currency || "ZAR";
    document.getElementById("settingsBankParser").value = data.bankParser || "sample_bank";
    document.getElementById("settingsCategories").value = state.categories.join(", ");
    document.getElementById("settingsTesseract").value = data.tesseractCmd || "";
    document.getElementById("settingsPoppler").value = data.popplerPath || "";
    ["settingsCurrency", "settingsBankParser", "settingsCategories", "settingsTesseract", "settingsPoppler"].forEach((id) => {
      document.getElementById(id).disabled = true;
    });
    return;
  }

  const data = await api.get("/api/settings");
  state.categories = data.defaultCategories || data.categories || [];

  const categorySelect = document.getElementById("filterCategory");
  categorySelect.innerHTML = '<option value="">All Categories</option>';
  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });

  elements.sidebarWorkbookPath.textContent = data.workbookPath || "";
  document.getElementById("settingsCurrency").value = data.currency || "ZAR";
  document.getElementById("settingsBankParser").value = data.bankParser || "sample_bank";
  document.getElementById("settingsCategories").value = state.categories.join(", ");
  document.getElementById("settingsTesseract").value = data.tesseractCmd || "";
  document.getElementById("settingsPoppler").value = data.popplerPath || "";
  ["settingsCurrency", "settingsBankParser", "settingsCategories", "settingsTesseract", "settingsPoppler"].forEach((id) => {
    document.getElementById(id).disabled = false;
  });
}

async function loadOverview() {
  const data = isDemoMode() ? getDemoOverview() : await api.get("/api/overview");
  const totals = data.totals || {};
  document.getElementById("statLedgerEntries").textContent = totals.ledgerEntries || 0;
  document.getElementById("statReceipts").textContent = totals.receipts || 0;
  document.getElementById("statNeedsReview").textContent = totals.needsReview || 0;
  document.getElementById("statImports").textContent = totals.imports || 0;
  renderRecentImports(data.recentImports || []);
}

async function loadLedger() {
  const filters = {
    date_from: document.getElementById("filterDateFrom").value,
    date_to: document.getElementById("filterDateTo").value,
    category: document.getElementById("filterCategory").value,
    source: document.getElementById("filterSource").value,
    min_amount: document.getElementById("filterMinAmount").value,
    max_amount: document.getElementById("filterMaxAmount").value,
  };

  let rows = [];
  if (isDemoMode()) {
    rows = getDemoLedgerRows(filters);
  } else {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "") params.append(key, value);
    });
    const data = await api.get(`/api/ledger?${params.toString()}`);
    rows = data.rows || [];
  }

  const income = rows.reduce((sum, row) => sum + Number(row.Credit || 0), 0);
  const expenses = rows.reduce((sum, row) => sum + Number(row.Debit || 0), 0);
  document.getElementById("ledgerIncomeTotal").textContent = formatNumber(income);
  document.getElementById("ledgerExpenseTotal").textContent = formatNumber(expenses);
  document.getElementById("ledgerRowsCount").textContent = rows.length;
  renderTable("ledgerTable", rows);
}

async function loadReports() {
  const data = isDemoMode() ? getDemoReports() : await api.get("/api/dashboard");
  renderReports(data);
}

async function loadDemoStatement() {
  const data = await api.get("/api/demo/statement");
  state.statementRows = data.rows || [];
  state.statementPreviewUrl = data.previewUrl || "";
  state.statementFile = createDemoFileDescriptor(data.fileName || "demo_statement.pdf");
  renderFileMeta("statementFileMeta", state.statementFile);
  renderPreview("statementPreviewPane", state.statementPreviewUrl);
  renderSummaryPills("statementSummary", [
    `${state.statementRows.length} row(s) found`,
    `OCR confidence ${formatNumber((data.confidence || 0) * 100)}%`,
    data.fileName || "",
  ].filter(Boolean));
  renderStatementReview();
  setMessage("statementMessage", data.message || "Demo statement loaded.", "success");
}

async function loadDemoReceipt() {
  const data = await api.get("/api/demo/receipt");
  state.receiptRows = data.rows || [];
  state.receiptPreviewUrl = data.previewUrl || "";
  state.receiptFile = createDemoFileDescriptor(data.fileName || "demo_receipt.jpg");
  renderFileMeta("receiptFileMeta", state.receiptFile);
  renderPreview("receiptPreviewPane", state.receiptPreviewUrl);
  renderSummaryPills("receiptSummary", [
    `${state.receiptRows.length} row(s) found`,
    `OCR confidence ${formatNumber((data.confidence || 0) * 100)}%`,
    data.fileName || "",
  ].filter(Boolean));
  renderReceiptReview();
  setMessage("receiptMessage", data.message || "Demo receipt loaded.", "success");
}

async function uploadStatement() {
  if (isDemoMode()) {
    await loadDemoStatement();
    return;
  }

  if (!state.statementFile) {
    setMessage("statementMessage", "Choose a statement file first.", "error");
    return;
  }

  setMessage("statementMessage", "Extracting statement...");
  try {
    const data = await api.postFile("/api/upload/statement", state.statementFile);
    state.statementRows = data.rows || [];
    state.statementPreviewUrl = data.previewUrl || "";
    renderPreview("statementPreviewPane", state.statementPreviewUrl);
    renderSummaryPills("statementSummary", [
      `${state.statementRows.length} row(s) found`,
      `OCR confidence ${formatNumber((data.confidence || 0) * 100)}%`,
      data.fileName || "",
    ].filter(Boolean));
    renderStatementReview();
    setMessage("statementMessage", data.message || "Statement extracted.", "success");
  } catch (error) {
    setMessage("statementMessage", error.message, "error");
  }
}

async function uploadReceipt() {
  if (isDemoMode()) {
    await loadDemoReceipt();
    return;
  }

  if (!state.receiptFile) {
    setMessage("receiptMessage", "Choose a receipt file first.", "error");
    return;
  }

  setMessage("receiptMessage", "Extracting receipt...");
  try {
    const data = await api.postFile("/api/upload/receipt", state.receiptFile);
    state.receiptRows = data.rows || [];
    state.receiptPreviewUrl = data.previewUrl || "";
    renderPreview("receiptPreviewPane", state.receiptPreviewUrl);
    renderSummaryPills("receiptSummary", [
      `${state.receiptRows.length} row(s) found`,
      `OCR confidence ${formatNumber((data.confidence || 0) * 100)}%`,
      data.fileName || "",
    ].filter(Boolean));
    renderReceiptReview();
    setMessage("receiptMessage", data.message || "Receipt extracted.", "success");
  } catch (error) {
    setMessage("receiptMessage", error.message, "error");
  }
}

async function saveStatementRows() {
  try {
    const rows = state.statementRows.filter((row) => row.description && row.date);
    if (isDemoMode()) {
      const store = getDemoStore();
      let nextId = nextDemoSequence(store.ledger, "ID", "L-");
      const mappedRows = rows.map((row) => ({
        ID: `L-${String(nextId++).padStart(5, "0")}`,
        Date: row.date,
        Description: row.description,
        Category: row.category || "Other",
        Debit: Number(row.debit || 0),
        Credit: Number(row.credit || 0),
        Balance: row.balance === "" ? "" : row.balance,
        "Source Type": "Statement",
        "Source File": row.source_file || "demo_statement.pdf",
        Notes: row.notes || "",
        Status: row.status || "Ready",
      }));
      store.ledger.push(...mappedRows);
      store.importsLog.push(buildDemoImportLog(rows[0]?.source_file || "demo_statement.pdf", "statement", mappedRows.length, "Saved"));
      persistDemoStore();
      setMessage("statementMessage", `Saved ${mappedRows.length} row(s) into this browser demo session.`, "success");
      await Promise.all([loadOverview(), loadLedger(), loadReports()]);
      clearStatementDraft(false);
      await activateView("ledger");
      return;
    }

    const result = await api.postJson("/api/save/statement", { rows });
    setMessage("statementMessage", result.message, "success");
    await Promise.all([loadOverview(), loadLedger(), loadReports()]);
    clearStatementDraft(false);
    await activateView("ledger");
  } catch (error) {
    setMessage("statementMessage", error.message, "error");
  }
}

async function saveReceiptRows() {
  try {
    const rows = state.receiptRows.filter((row) => row.vendor && Number(row.amount) > 0);
    if (isDemoMode()) {
      const store = getDemoStore();
      let nextId = nextDemoSequence(store.receipts, "Receipt ID", "R-");
      const mappedRows = rows.map((row) => ({
        "Receipt ID": row.receipt_id || `R-${String(nextId++).padStart(5, "0")}`,
        Date: row.date,
        Vendor: row.vendor,
        Amount: Number(row.amount || 0),
        Tax: row.tax === "" ? "" : row.tax,
        "Linked Ledger ID": row.linked_ledger_id || "",
        "Source File": row.source_file || "demo_receipt.jpg",
        "OCR Confidence": row.ocr_confidence || 0,
        Notes: row.notes || "",
      }));
      store.receipts.push(...mappedRows);
      store.importsLog.push(buildDemoImportLog(rows[0]?.source_file || "demo_receipt.jpg", "receipt", mappedRows.length, "Saved"));
      persistDemoStore();
      setMessage("receiptMessage", `Saved ${mappedRows.length} receipt row(s) into this browser demo session.`, "success");
      await Promise.all([loadOverview(), loadReports()]);
      clearReceiptDraft(false);
      return;
    }

    const result = await api.postJson("/api/save/receipt", { rows });
    setMessage("receiptMessage", result.message, "success");
    await Promise.all([loadOverview(), loadReports()]);
    clearReceiptDraft(false);
  } catch (error) {
    setMessage("receiptMessage", error.message, "error");
  }
}

function clearStatementDraft(resetMessage = true) {
  state.statementRows = [];
  state.statementFile = null;
  state.statementPreviewUrl = "";
  elements.statementFileInput.value = "";
  renderFileMeta("statementFileMeta", null);
  renderPreview("statementPreviewPane", "");
  renderSummaryPills("statementSummary", []);
  renderStatementReview();
  if (resetMessage) setMessage("statementMessage", "");
}

function clearReceiptDraft(resetMessage = true) {
  state.receiptRows = [];
  state.receiptFile = null;
  state.receiptPreviewUrl = "";
  elements.receiptFileInput.value = "";
  renderFileMeta("receiptFileMeta", null);
  renderPreview("receiptPreviewPane", "");
  renderSummaryPills("receiptSummary", []);
  renderReceiptReview();
  if (resetMessage) setMessage("receiptMessage", "");
}

async function saveSettings() {
  if (isDemoMode()) {
    setMessage("settingsMessage", "Settings are read-only in the public demo.", "error");
    return;
  }

  const payload = {
    currency: document.getElementById("settingsCurrency").value.trim() || "ZAR",
    bank_parser: document.getElementById("settingsBankParser").value.trim() || "sample_bank",
    default_categories: document.getElementById("settingsCategories").value.split(",").map((value) => value.trim()).filter(Boolean),
    tesseract_cmd: document.getElementById("settingsTesseract").value.trim(),
    poppler_path: document.getElementById("settingsPoppler").value.trim(),
  };

  try {
    const result = await api.postJson("/api/settings", payload);
    setMessage("settingsMessage", result.message, "success");
    await loadSettings();
    renderStatementReview();
  } catch (error) {
    setMessage("settingsMessage", error.message, "error");
  }
}

function createDropzone(dropzoneId, inputId, fileType) {
  const dropzone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);

  const assignFile = (file) => {
    if (!file || isDemoMode()) return;
    if (fileType === "statement") {
      state.statementFile = file;
      renderFileMeta("statementFileMeta", file);
    } else {
      state.receiptFile = file;
      renderFileMeta("receiptFileMeta", file);
    }
  };

  dropzone.addEventListener("dragover", (event) => {
    if (isDemoMode()) return;
    event.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    if (isDemoMode()) return;
    event.preventDefault();
    dropzone.classList.remove("dragover");
    assignFile(event.dataTransfer.files[0]);
  });

  input.addEventListener("change", () => assignFile(input.files[0]));
}

function bindNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", async () => {
      await activateView(button.dataset.view);
    });
  });

  document.querySelectorAll("[data-go-view]").forEach((button) => {
    button.addEventListener("click", async () => activateView(button.dataset.goView));
  });
}

async function resetDemoSession() {
  state.demoStore = getInitialDemoStore();
  persistDemoStore();
  clearStatementDraft();
  clearReceiptDraft();
  await Promise.all([loadSettings(), loadOverview(), loadLedger(), loadReports()]);
  setMessage("statementMessage", "Demo session reset. Load the sample files again to replay the workflow.", "success");
}

function bindButtons() {
  document.getElementById("quickStatementBtn").addEventListener("click", () => activateView("statement-import"));
  document.getElementById("quickReceiptBtn").addEventListener("click", () => activateView("receipt-import"));
  document.getElementById("uploadStatementBtn").addEventListener("click", uploadStatement);
  document.getElementById("uploadReceiptBtn").addEventListener("click", uploadReceipt);
  document.getElementById("clearStatementBtn").addEventListener("click", () => clearStatementDraft());
  document.getElementById("clearReceiptBtn").addEventListener("click", () => clearReceiptDraft());
  document.getElementById("applyFiltersBtn").addEventListener("click", loadLedger);
  document.getElementById("refreshLedgerBtn").addEventListener("click", loadLedger);
  document.getElementById("clearFiltersBtn").addEventListener("click", async () => {
    ["filterDateFrom", "filterDateTo", "filterCategory", "filterSource", "filterMinAmount", "filterMaxAmount"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    await loadLedger();
  });

  document.getElementById("downloadLedgerBtn").addEventListener("click", () => {
    if (!isDemoMode()) window.location.href = "/api/export/download";
  });
  document.getElementById("sidebarExportLedgerBtn").addEventListener("click", () => {
    if (!isDemoMode()) window.location.href = "/api/export/download";
  });
  document.getElementById("downloadSummaryBtn").addEventListener("click", () => {
    if (!isDemoMode()) window.location.href = "/api/export/summary";
  });

  const openLedger = async () => {
    if (isDemoMode()) {
      setMessage("settingsMessage", "Opening Excel is disabled in the public demo.", "error");
      return;
    }
    try {
      const result = await api.postJson("/api/export/open-ledger", {});
      alert(result.message);
    } catch (error) {
      alert(error.message);
    }
  };

  document.getElementById("openLedgerBtn").addEventListener("click", openLedger);
  document.getElementById("sidebarOpenLedgerBtn").addEventListener("click", openLedger);
  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
  document.getElementById("reloadSettingsBtn").addEventListener("click", loadSettings);
  elements.loadDemoStatementBtn.addEventListener("click", loadDemoStatement);
  elements.loadDemoReceiptBtn.addEventListener("click", loadDemoReceipt);
  elements.resetDemoBtn.addEventListener("click", resetDemoSession);
}

async function init() {
  bindNavigation();
  bindButtons();
  createDropzone("statementDropzone", "statementFile", "statement");
  createDropzone("receiptDropzone", "receiptFile", "receipt");
  renderStatementReview();
  renderReceiptReview();
  await loadAppConfig();
  if (isDemoMode()) {
    await loadDemoBootstrap();
  }
  await Promise.all([loadSettings(), loadOverview(), loadLedger(), loadReports()]);
}

init().catch((error) => console.error(error));
