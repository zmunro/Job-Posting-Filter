(function initJobFilter() {
  const STORAGE_KEY = "blockedCompanies";
  const LEGACY_STORAGE_KEY = "blacklistedCompanies";
  const BUTTON_ID = "jf-blocklist-current-company";
  const BUILTIN_SINGLE_BTN_ID = "jf-builtin-blocklist-single";
  const HIDDEN_CLASS = "jf-hidden-job";
  const BUILTIN_BTN_WRAP = "jf-builtin-btn-wrap";
  const BUILTIN_CARD_BTN_CLASS = "jf-builtin-card-btn";

  /** @type {Set<string>} */
  let blockedSet = new Set();
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

  async function readBlockedList() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        { [STORAGE_KEY]: [], [LEGACY_STORAGE_KEY]: [] },
        (result) => {
          let list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
          const legacy = Array.isArray(result[LEGACY_STORAGE_KEY])
            ? result[LEGACY_STORAGE_KEY]
            : [];
          if (legacy.length) {
            list = uniqueSorted([...list, ...legacy]);
            chrome.storage.sync.set({
              [STORAGE_KEY]: list,
              [LEGACY_STORAGE_KEY]: []
            });
          }
          resolve(list);
        }
      );
    });
  }

  async function writeBlockedList(companies) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: companies }, () => resolve());
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
      hideBlockedJobs();
      ensureBlocklistButton();
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

  async function addCompanyToBlocklist(companyName) {
    const display = toDisplayName(companyName);
    const normalized = normalizeCompanyName(display);
    if (!normalized) {
      return false;
    }
    if (blockedSet.has(normalized)) {
      showToast(`${display} is already on your blocklist.`);
      return false;
    }

    const existing = await readBlockedList();
    const updated = uniqueSorted([...existing, display]);
    await writeBlockedList(updated);
    blockedSet = new Set(updated.map(normalizeCompanyName));
    hideBlockedJobs();
    ensureBlocklistButton();
    showToast(`Added "${display}" to blocklist.`);
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

  function getJobsSite() {
    const host = window.location.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      return "linkedin";
    }
    if (host === "builtin.com" || host.endsWith(".builtin.com")) {
      return "builtin";
    }
    return "other";
  }

  function hideBuiltinJobCards() {
    const cards = document.querySelectorAll('[data-id="job-card"]');
    for (const card of cards) {
      if (!(card instanceof HTMLElement)) {
        continue;
      }
      const link = card.querySelector('a[data-id="company-title"]');
      const company = link ? toDisplayName(link.textContent) : "";
      const normalized = normalizeCompanyName(company);
      if (normalized && blockedSet.has(normalized)) {
        card.classList.add(HIDDEN_CLASS);
      } else {
        card.classList.remove(HIDDEN_CLASS);
      }
    }
  }

  function hideBlockedJobs() {
    const site = getJobsSite();
    if (site === "builtin") {
      hideBuiltinJobCards();
      return;
    }

    const cards = collectJobCards();
    for (const card of cards) {
      const company = toDisplayName(getCardCompanyText(card));
      const normalized = normalizeCompanyName(company);
      const target = card.closest("li") || card;

      if (!(target instanceof HTMLElement)) {
        continue;
      }

      if (normalized && blockedSet.has(normalized)) {
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

  function removeLinkedInBlocklistButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      existing.remove();
    }
  }

  function removeBuiltinUi() {
    document.querySelectorAll(`.${BUILTIN_BTN_WRAP}`).forEach((el) => el.remove());
    const single = document.getElementById(BUILTIN_SINGLE_BTN_ID);
    if (single) {
      single.remove();
    }
    const singleWrap = document.querySelector(".jf-builtin-single-wrap");
    if (singleWrap) {
      singleWrap.remove();
    }
  }

  function ensureBuiltinCardButtons() {
    const cards = document.querySelectorAll('[data-id="job-card"]');
    for (const card of cards) {
      if (!(card instanceof HTMLElement)) {
        continue;
      }
      const companyLink = card.querySelector('a[data-id="company-title"]');
      if (!companyLink) {
        continue;
      }
      const name = toDisplayName(companyLink.textContent);
      if (!name) {
        continue;
      }

      let wrap = card.querySelector(`.${BUILTIN_BTN_WRAP}`);
      let button = wrap?.querySelector(`.${BUILTIN_CARD_BTN_CLASS}`);
      if (!wrap || !button) {
        wrap = document.createElement("div");
        wrap.className = BUILTIN_BTN_WRAP;
        button = document.createElement("button");
        button.type = "button";
        button.className = `jf-blocklist-btn ${BUILTIN_CARD_BTN_CLASS}`;
        wrap.appendChild(button);
        // Right column is outside the full-card job link overlay (card-alias-after-overlay).
        const metaSection = card.querySelector(".bounded-attribute-section");
        if (metaSection) {
          metaSection.insertBefore(wrap, metaSection.firstChild);
        } else {
          const item2 = card.querySelector(".left-side-tile-item-2");
          if (item2) {
            item2.insertAdjacentElement("afterend", wrap);
          } else {
            const tile = card.querySelector(".left-side-tile");
            if (tile) {
              tile.appendChild(wrap);
            } else {
              card.appendChild(wrap);
            }
          }
        }
      } else {
        const metaSection = card.querySelector(".bounded-attribute-section");
        if (metaSection && !metaSection.contains(wrap)) {
          metaSection.insertBefore(wrap, metaSection.firstChild);
        }
      }

      const normalized = normalizeCompanyName(name);
      const isBlocked = normalized && blockedSet.has(normalized);
      button.disabled = Boolean(isBlocked);
      button.textContent = isBlocked ? "Company blocked" : `Hide "${name}" jobs`;
      const companyForClick = name;
      if (!button.dataset.jfBuiltinBound) {
        button.dataset.jfBuiltinBound = "1";
        button.addEventListener(
          "click",
          async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const btn = e.currentTarget;
            if (!(btn instanceof HTMLButtonElement) || btn.disabled) {
              return;
            }
            await addCompanyToBlocklist(companyForClick);
          },
          true
        );
      }
    }
  }

  function ensureBuiltinSingleJobButton() {
    if (!/^\/job\//.test(window.location.pathname)) {
      return;
    }
    const companyLink =
      document.querySelector('main a[data-id="company-title"]') ||
      document.querySelector('a[data-id="company-title"]');
    if (!companyLink || !(companyLink instanceof HTMLElement)) {
      return;
    }
    const name = toDisplayName(companyLink.textContent);
    if (!name) {
      return;
    }

    let wrap = document.querySelector(".jf-builtin-single-wrap");
    let button = document.getElementById(BUILTIN_SINGLE_BTN_ID);
    if (!wrap || !button) {
      if (wrap) {
        wrap.remove();
      }
      wrap = document.createElement("div");
      wrap.className = "jf-builtin-single-wrap";
      button = document.createElement("button");
      button.id = BUILTIN_SINGLE_BTN_ID;
      button.type = "button";
      button.className = "jf-blocklist-btn";
      wrap.appendChild(button);
      companyLink.insertAdjacentElement("afterend", wrap);
    }

    const normalized = normalizeCompanyName(name);
    const isBlocked = normalized && blockedSet.has(normalized);
    button.disabled = Boolean(isBlocked);
    button.textContent = isBlocked ? "Company is blocked" : `Hide "${name}" jobs`;
    const companyForClick = name;
    if (!button.dataset.jfBuiltinSingleBound) {
      button.dataset.jfBuiltinSingleBound = "1";
      button.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const btn = e.currentTarget;
          if (!(btn instanceof HTMLButtonElement) || btn.disabled) {
            return;
          }
          await addCompanyToBlocklist(companyForClick);
        },
        true
      );
    }
  }

  function ensureLinkedInBlocklistButton() {
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
    const isBlocked = normalized && blockedSet.has(normalized);
    let button = existing;
    if (!button) {
      button = document.createElement("button");
    }
    if (!container.contains(button)) {
      container.appendChild(button);
    }

    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "jf-blocklist-btn";
    button.disabled = Boolean(isBlocked);
    button.textContent = isBlocked ? "Company is blocked" : `Hide "${detail.name}" jobs`;

    button.onclick = async () => {
      await addCompanyToBlocklist(detail.name);
    };

    const inTopButtons = container.classList.contains("job-details-jobs-unified-top-card__top-buttons");
    button.style.marginTop = inTopButtons ? "0" : "8px";
    button.style.marginLeft = inTopButtons ? "8px" : "0";
  }

  function ensureBlocklistButton() {
    const site = getJobsSite();
    if (site === "builtin") {
      removeLinkedInBlocklistButton();
      const path = window.location.pathname;
      if (/^\/jobs(\/|$)/.test(path)) {
        document.getElementById(BUILTIN_SINGLE_BTN_ID)?.remove();
        document.querySelector(".jf-builtin-single-wrap")?.remove();
        ensureBuiltinCardButtons();
      } else if (/^\/job\//.test(path)) {
        document.querySelectorAll(`.${BUILTIN_BTN_WRAP}`).forEach((el) => el.remove());
        ensureBuiltinSingleJobButton();
      } else {
        removeBuiltinUi();
      }
      return;
    }

    removeBuiltinUi();
    ensureLinkedInBlocklistButton();
  }

  async function initialLoad() {
    const list = await readBlockedList();
    blockedSet = new Set(list.map(normalizeCompanyName));
    hideBlockedJobs();
    ensureBlocklistButton();
  }

  function isJobsPage() {
    const site = getJobsSite();
    const path = window.location.pathname;
    if (site === "linkedin") {
      return /^\/jobs(\/|$)/.test(path);
    }
    if (site === "builtin") {
      return /^\/jobs(\/|$)/.test(path) || /^\/job\//.test(path);
    }
    return false;
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
    removeLinkedInBlocklistButton();
    removeBuiltinUi();
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
    if (areaName !== "sync") {
      return;
    }
    if (!changes[STORAGE_KEY] && !changes[LEGACY_STORAGE_KEY]) {
      return;
    }
    readBlockedList().then((list) => {
      blockedSet = new Set(list.map(normalizeCompanyName));
      if (jobsFeaturesActive) {
        scheduleRefresh();
      }
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "jobfilter:getStatus") {
      return;
    }
    const site = getJobsSite();
    const detail = getCurrentDetailCompany();
    const builtinButtons =
      document.querySelectorAll(`.${BUILTIN_CARD_BTN_CLASS}`).length +
      (document.getElementById(BUILTIN_SINGLE_BTN_ID) ? 1 : 0);
    sendResponse({
      ok: true,
      site,
      onLinkedIn: site === "linkedin",
      onBuiltin: site === "builtin",
      onJobsPage: isJobsPage(),
      jobsFeaturesActive,
      currentCompany: detail ? detail.name : "",
      buttonVisible:
        site === "builtin" ? builtinButtons > 0 : Boolean(document.getElementById(BUTTON_ID))
    });
  });

  installNavigationHooks();
  onRouteChange();
})();
