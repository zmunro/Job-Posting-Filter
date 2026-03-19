(function initJobFilter() {
  const STORAGE_KEY = "blacklistedCompanies";
  const BUTTON_ID = "jf-blacklist-current-company";
  const HIDDEN_CLASS = "jf-hidden-job";

  /** @type {Set<string>} */
  let blacklistSet = new Set();
  let toastTimer = null;
  let refreshTimer = null;
  let jobsFeaturesActive = false;
  let observer = null;

  function normalizeCompanyName(name) {
    return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function toDisplayName(name) {
    return (name || "").trim().replace(/\s+/g, " ");
  }

  async function readBlacklist() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ [STORAGE_KEY]: [] }, (result) => {
        const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        resolve(list);
      });
    });
  }

  async function writeBlacklist(blacklist) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: blacklist }, () => resolve());
    });
  }

  function showToast(message) {
    const existing = document.querySelector(".jf-toast");
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.className = "jf-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => toast.remove(), 2600);
  }

  function scheduleRefresh() {
    if (!jobsFeaturesActive) {
      return;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      hideBlacklistedJobs();
      ensureBlacklistButton();
    }, 120);
  }

  function uniqueSorted(items) {
    const uniq = new Map();
    for (const raw of items) {
      const display = toDisplayName(raw);
      const normalized = normalizeCompanyName(display);
      if (!display || !normalized) {
        continue;
      }
      if (!uniq.has(normalized)) {
        uniq.set(normalized, display);
      }
    }
    return [...uniq.values()].sort((a, b) => a.localeCompare(b));
  }

  async function addCompanyToBlacklist(companyName) {
    const display = toDisplayName(companyName);
    const normalized = normalizeCompanyName(display);
    if (!normalized) {
      return false;
    }
    if (blacklistSet.has(normalized)) {
      showToast(`${display} is already in your blacklist.`);
      return false;
    }

    const existing = await readBlacklist();
    const updated = uniqueSorted([...existing, display]);
    await writeBlacklist(updated);
    blacklistSet = new Set(updated.map(normalizeCompanyName));
    hideBlacklistedJobs();
    ensureBlacklistButton();
    showToast(`Added "${display}" to blacklist.`);
    return true;
  }

  function getCardCompanyText(cardElement) {
    if (!cardElement) {
      return "";
    }

    const companySelectors = [
      ".job-card-container__primary-description",
      ".artdeco-entity-lockup__subtitle",
      ".job-card-list__company-name",
      ".base-search-card__subtitle",
      "[class*='subtitle']"
    ];

    for (const selector of companySelectors) {
      const el = cardElement.querySelector(selector);
      if (el && el.textContent) {
        return el.textContent;
      }
    }

    const metadata = cardElement.querySelectorAll("span, a, div");
    for (const node of metadata) {
      const text = toDisplayName(node.textContent);
      if (text && /[A-Za-z]/.test(text) && text.length <= 90) {
        if (!/ago|applicant|promoted|easy apply|hybrid|remote/i.test(text)) {
          return text;
        }
      }
    }
    return "";
  }

  function collectJobCards() {
    const selectors = [
      "li.jobs-search-results__list-item",
      "li[data-occludable-job-id]",
      ".job-card-container",
      ".jobs-job-board-list__item",
      ".base-card"
    ];

    /** @type {HTMLElement[]} */
    const cards = [];
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      for (const node of found) {
        if (node instanceof HTMLElement) {
          cards.push(node);
        }
      }
    }
    return cards;
  }

  function hideBlacklistedJobs() {
    const cards = collectJobCards();
    for (const card of cards) {
      const company = toDisplayName(getCardCompanyText(card));
      const normalized = normalizeCompanyName(company);
      const target = card.closest("li") || card;

      if (!(target instanceof HTMLElement)) {
        continue;
      }

      if (normalized && blacklistSet.has(normalized)) {
        target.classList.add(HIDDEN_CLASS);
      } else {
        target.classList.remove(HIDDEN_CLASS);
      }
    }
  }

  function getSelectedJobCard() {
    const selectors = [
      ".jobs-search-results-list__list-item--active",
      "[data-job-id][aria-current='page']",
      "li[data-occludable-job-id][aria-current='page']",
      "li[data-occludable-job-id] .jobs-search-results-list__list-item--active"
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) {
        return node;
      }
    }
    return null;
  }

  function getCurrentDetailCompany() {
    const selectors = [
      ".jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-details-top-card__company-url",
      "a[data-tracking-control-name*='company']",
      "a[data-view-name='job-details-about-company-name-link']",
      "section[data-view-name='job-details-about-company-module'] a[href*='/company/']"
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const name = toDisplayName(el.textContent);
        if (name) {
          return { name, element: el };
        }
      }
    }

    // Fallback for collections/recommended where top-card markup can be delayed.
    const selectedCard = getSelectedJobCard();
    if (selectedCard) {
      const name = toDisplayName(getCardCompanyText(selectedCard));
      if (name) {
        return { name, element: selectedCard };
      }
    }
    return null;
  }

  function getButtonContainer(companyElement) {
    // LinkedIn two-pane UI: place next to existing top-right controls.
    const twoPaneButtons = document.querySelector(".job-details-jobs-unified-top-card__top-buttons");
    if (twoPaneButtons instanceof HTMLElement) {
      return twoPaneButtons;
    }

    const detailsContainer = document.querySelector(".jobs-search__job-details--container");
    if (detailsContainer instanceof HTMLElement) {
      return detailsContainer;
    }

    if (!companyElement) {
      return null;
    }

    const topCardContainer =
      companyElement.closest("[class*='job-details-jobs-unified-top-card__container']") ||
      companyElement.closest(".jobs-unified-top-card") ||
      companyElement.closest(".job-details-jobs-unified-top-card") ||
      companyElement.closest(".jobs-details__main-content");

    if (topCardContainer instanceof HTMLElement) {
      return topCardContainer;
    }

    return companyElement.parentElement instanceof HTMLElement ? companyElement.parentElement : null;
  }

  function ensureBlacklistButton() {
    const detail = getCurrentDetailCompany();
    const existing = document.getElementById(BUTTON_ID);

    if (!detail) {
      if (existing) {
        existing.remove();
      }
      return;
    }

    const container = getButtonContainer(detail.element);
    if (!container) {
      return;
    }

    const normalized = normalizeCompanyName(detail.name);
    const isBlocked = normalized && blacklistSet.has(normalized);
    let button = existing;
    if (!button) {
      button = document.createElement("button");
    }
    if (!container.contains(button)) {
      container.appendChild(button);
    }

    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "jf-blacklist-btn";
    button.disabled = Boolean(isBlocked);
    button.textContent = isBlocked ? "Company is blacklisted" : `Hide "${detail.name}" jobs`;

    button.onclick = async () => {
      await addCompanyToBlacklist(detail.name);
    };

    const inTopButtons = container.classList.contains("job-details-jobs-unified-top-card__top-buttons");
    button.style.marginTop = inTopButtons ? "0" : "8px";
    button.style.marginLeft = inTopButtons ? "8px" : "0";
  }

  async function initialLoad() {
    const list = await readBlacklist();
    blacklistSet = new Set(list.map(normalizeCompanyName));
    hideBlacklistedJobs();
    ensureBlacklistButton();
  }

  function isJobsPage() {
    return /^\/jobs(\/|$)/.test(window.location.pathname);
  }

  function activateJobsFeatures() {
    if (jobsFeaturesActive) {
      scheduleRefresh();
      return;
    }

    jobsFeaturesActive = true;
    observer = new MutationObserver(() => {
      scheduleRefresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    initialLoad();
  }

  function deactivateJobsFeatures() {
    jobsFeaturesActive = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      existing.remove();
    }
  }

  function onRouteChange() {
    if (isJobsPage()) {
      activateJobsFeatures();
    } else {
      deactivateJobsFeatures();
    }
  }

  function installNavigationHooks() {
    if (window.__jobFilterNavHookInstalled) {
      return;
    }
    window.__jobFilterNavHookInstalled = true;

    const notify = () => {
      window.dispatchEvent(new Event("jobfilter:locationchange"));
    };

    const originalPushState = history.pushState;
    history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(this, args);
      notify();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      notify();
      return result;
    };

    window.addEventListener("popstate", notify);
    window.addEventListener("jobfilter:locationchange", onRouteChange);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[STORAGE_KEY]) {
      return;
    }
    const newValue = Array.isArray(changes[STORAGE_KEY].newValue)
      ? changes[STORAGE_KEY].newValue
      : [];
    blacklistSet = new Set(newValue.map(normalizeCompanyName));
    if (jobsFeaturesActive) {
      scheduleRefresh();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "jobfilter:getStatus") {
      return;
    }
    const detail = getCurrentDetailCompany();
    sendResponse({
      ok: true,
      onLinkedIn: /(^|\.)linkedin\.com$/i.test(window.location.hostname),
      onJobsPage: isJobsPage(),
      jobsFeaturesActive,
      currentCompany: detail ? detail.name : "",
      buttonVisible: Boolean(document.getElementById(BUTTON_ID))
    });
  });

  installNavigationHooks();
  onRouteChange();
})();
