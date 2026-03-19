const STORAGE_KEY = "blacklistedCompanies";
const countText = document.getElementById("count-text");
const manageButton = document.getElementById("manage-button");
const statusText = document.getElementById("status-text");

function uniqueSortedCompanies(items) {
  const map = new Map();
  for (const raw of items) {
    const display = (raw || "").trim().replace(/\s+/g, " ");
    const normalized = display.toLowerCase();
    if (!display || !normalized) {
      continue;
    }
    if (!map.has(normalized)) {
      map.set(normalized, display);
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

function readBlacklist() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [STORAGE_KEY]: [] }, (result) => {
      const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
      resolve(uniqueSortedCompanies(list));
    });
  });
}

function updateCount(count) {
  countText.textContent = `${count} compan${count === 1 ? "y" : "ies"} blacklisted`;
}

function setStatus(text, className) {
  statusText.textContent = text;
  statusText.className = `status-text ${className}`;
}

function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}

function sendStatusProbe(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "jobfilter:getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response from page script." });
    });
  });
}

async function updateStatusBadge() {
  const tab = await queryActiveTab();
  if (!tab || !tab.id) {
    setStatus("Status: no active tab found", "status-bad");
    return;
  }

  const url = tab.url || "";
  if (!/^https:\/\/www\.linkedin\.com\//.test(url)) {
    setStatus("Status: open a LinkedIn tab", "status-warn");
    return;
  }

  const status = await sendStatusProbe(tab.id);
  if (!status.ok) {
    setStatus("Status: extension not injected in this tab", "status-bad");
    return;
  }

  if (!status.onJobsPage) {
    setStatus("Status: LinkedIn open (not on Jobs page)", "status-warn");
    return;
  }

  if (!status.jobsFeaturesActive) {
    setStatus("Status: Jobs detected, initializing...", "status-warn");
    return;
  }

  if (status.buttonVisible) {
    setStatus("Status: active on LinkedIn Jobs", "status-ok");
    return;
  }

  if (status.currentCompany) {
    setStatus(`Status: active, waiting to place button for ${status.currentCompany}`, "status-warn");
    return;
  }

  setStatus("Status: active, waiting for selected job", "status-warn");
}

async function initializePopup() {
  const list = await readBlacklist();
  updateCount(list.length);
  await updateStatusBadge();
}

manageButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[STORAGE_KEY]) {
    return;
  }
  const list = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
  updateCount(uniqueSortedCompanies(list).length);
});

initializePopup();
