# JobFilter Chrome Extension

JobFilter lets you hide jobs from companies you do not want to see.

## Features

- LinkedIn support (`linkedin.com/jobs/*`)
- "Hide jobs from this company" button on the currently selected job
- Automatically hides any job cards from blacklisted companies
- Blacklist manager page to add, remove, and clear companies
- Popup menu with quick access to blacklist manager

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder: `JobFilter`.

## How to use

1. Open LinkedIn jobs.
2. Click a job posting.
3. Click **Hide "<Company>" jobs** in the job detail panel.
4. Future jobs from that company are hidden automatically.
5. Click the extension icon -> **Manage blacklist** to edit blocked companies.

## Notes

- Blacklist data is stored in `chrome.storage.sync`.
- If LinkedIn changes markup, selectors in `content.js` may need updates.
