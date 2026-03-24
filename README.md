# JobFilter Chrome Extension

JobFilter lets you hide jobs from companies you do not want to see.

## Features

- **LinkedIn** — hide button on the selected job in the detail pane; list items hide when blocked
- **Built In** (`builtin.com`) — hide button on each job card on `/jobs` (and on individual `/job/...` pages when the layout includes the company link)
- Same shared blocklist everywhere (stored in `chrome.storage.sync` as `blockedCompanies`)
- Options page to add, remove, and clear companies
- Popup with status + quick link to manage the blocklist

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder: `JobFilter`.

## How to use

### LinkedIn

1. Open LinkedIn Jobs.
2. Select a job so the detail panel loads.
3. Click **Hide "<Company>" jobs** in the detail panel.

### Built In

1. Open [Built In Jobs](https://builtin.com/jobs) (or search/filter as usual).
2. On each job card, click **Hide "<Company>" jobs** under the company name.
3. Cards from that company disappear from the list.

### Blocklist

- Extension icon → **Manage blocklist** to edit entries (applies to both sites).

## Notes

- Blocklist data is stored in `chrome.storage.sync` under `blockedCompanies` (older installs may migrate once from `blacklistedCompanies`).
- If either site changes markup, selectors in `content.js` may need updates.
