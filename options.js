const STORAGE_KEY = "blockedCompanies";
const LEGACY_STORAGE_KEY = "blacklistedCompanies";

const companyInput = document.getElementById("company-input");
const addForm = document.getElementById("add-form");
const companyList = document.getElementById("company-list");
const emptyState = document.getElementById("empty-state");
const clearAllButton = document.getElementById("clear-all");

function normalizeCompanyName(name) {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function toDisplayName(name) {
  return (name || "").trim().replace(/\s+/g, " ");
}

function uniqueSortedCompanies(items) {
  const seen = new Map();
  for (const raw of items) {
    const display = toDisplayName(raw);
    const normalized = normalizeCompanyName(display);
    if (!display || !normalized) {
      continue;
    }
    if (!seen.has(normalized)) {
      seen.set(normalized, display);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
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

function writeBlockedList(companies) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(
      { [STORAGE_KEY]: uniqueSortedCompanies(companies) },
      () => resolve()
    );
  });
}

function renderList(companies) {
  companyList.innerHTML = "";
  emptyState.style.display = companies.length ? "none" : "block";
  clearAllButton.style.display = companies.length ? "inline-block" : "none";

  for (const company of companies) {
    const item = document.createElement("li");
    item.className = "company-item";

    const name = document.createElement("span");
    name.className = "company-name";
    name.textContent = company;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-btn";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      const current = await readBlockedList();
      const normalized = normalizeCompanyName(company);
      const next = current.filter((entry) => normalizeCompanyName(entry) !== normalized);
      await writeBlockedList(next);
      renderList(next);
    });

    item.append(name, remove);
    companyList.appendChild(item);
  }
}

async function initializePage() {
  const companies = await readBlockedList();
  renderList(companies);
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const company = toDisplayName(companyInput.value);
  if (!company) {
    return;
  }

  const current = await readBlockedList();
  const updated = uniqueSortedCompanies([...current, company]);
  await writeBlockedList(updated);
  renderList(updated);
  companyInput.value = "";
  companyInput.focus();
});

clearAllButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Remove all companies from your blocklist?");
  if (!confirmed) {
    return;
  }
  await writeBlockedList([]);
  renderList([]);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }
  if (!changes[STORAGE_KEY] && !changes[LEGACY_STORAGE_KEY]) {
    return;
  }
  readBlockedList().then((list) => renderList(list));
});

initializePage();
