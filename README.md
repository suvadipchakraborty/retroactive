# Retroactive

Tech history, one day at a time — built entirely as a static site with no backend.

## How it works

- Data comes live from Wikipedia's free, no-key **"on this day"** REST API
  (`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{MM}/{DD}`),
  called directly from the browser.
- A small keyword classifier tags each event/birth/death as Computing,
  Internet & web, Space & science, Gaming, Companies & business, People, or
  Tech history, and fills in with notable general history if a date is thin
  on tech.
- Each date's response is cached in `localStorage` for a week, so repeat
  visits don't refetch.
- "Filed" stories and your terminal/paper mode preference are also kept in
  `localStorage` — nothing leaves your browser, no server, no database.

## Features

- Browse any date: step a day at a time, jump to today, jump to a specific
  date, or shuffle to a random one.
- Filter by category, file stories you like for later.
- A CRT "terminal mode" toggle for a green-phosphor alternate read.
- Installable as a home-screen PWA.

## Deploying

This is a static site — no build step. Push this folder to a GitHub repo and
connect it to Cloudflare Pages with:

- **Build command:** (leave blank)
- **Build output directory:** `/`

That's it.

---
Built by **Suva**.
