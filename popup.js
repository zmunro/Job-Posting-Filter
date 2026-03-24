const STORAGE_KEY = "blockedCompanies";
const LEGACY_STORAGE_KEY = "blacklistedCompanies";

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

function readBlockedList() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { [STORAGE_KEY]: [], [LEGACY_STORAGE_KEY]: [] },
      (result) => {
        let list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        const legacy = Array.isArray(result[LEGACY_STORAGE_KEY])
          ? result[LEGACY_STORAGE_KEY]
          : [];
        if (legacy.length) {
          list = uniqueSortedCompanies([...list, ...legacy]);
          chrome.storage.sync.set({
            [STORAGE_KEY]: list,
            [LEGACY_STORAGE_KEY]: []
          });
        }
        resolve(uniqueSortedCompanies(list));
      }
    );
  });
}

function updateCount(count) {
  countText.textContent = `${count} compan${count === 1 ? "y" : "ies"} on blocklist`;
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
  const supported = /^https:\/\/(www\.)?(linkedin\.com|builtin\.com)\//i.test(url);
  if (!supported) {
    setStatus("Status: open LinkedIn or Built In", "status-warn");
    return;
  }

  const status = await sendStatusProbe(tab.id);
  if (!status.ok) {
    setStatus("Status: extension not injected in this tab", "status-bad");
    return;
  }

  if (!status.onJobsPage) {
    const onBi = status.onBuiltin || status.site === "builtin";
    const label = onBi ? "Built In" : "LinkedIn";
    setStatus(`Status: ${label} open (not on a job page)`, "status-warn");
    return;
  }

  if (!status.jobsFeaturesActive) {
    setStatus("Status: job page detected, initializing...", "status-warn");
    return;
  }

  if (status.buttonVisible) {
    const onBi = status.onBuiltin || status.site === "builtin";
    const label = onBi ? "Built In" : "LinkedIn";
    setStatus(`Status: active on ${label} jobs`, "status-ok");
    return;
  }

  if (status.currentCompany) {
    setStatus(`Status: active, waiting to place button for ${status.currentCompany}`, "status-warn");
    return;
  }

  setStatus("Status: active, waiting for job UI", "status-warn");
}

async function initializePopup() {
  const list = await readBlockedList();
  updateCount(list.length);
  await updateStatusBadge();
}

manageButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }
  if (!changes[STORAGE_KEY] && !changes[LEGACY_STORAGE_KEY]) {
    return;
  }
  readBlockedList().then((list) => updateCount(list.length));
});

initializePopup();
