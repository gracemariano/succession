# Arkay Succession Planning — Executive Dashboard

Executive leadership dashboard for **Succession Planning** sessions.

## View locally

```bash
cd /Users/gracenicolemariano/Documents/succession
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

## GitHub Pages

Live: **https://gracemariano.github.io/succession/**

## Adding a new session

1. Copy `meetings/june-2026.json` to `meetings/{month}-{year}.json`
2. Update all fields (commitments, discussions, actions, KPIs)
3. Add an entry to `meetings/index.json` (newest `meetingDate` first)
4. Push to `main` — GitHub Pages deploys automatically

## Structure

| File | Purpose |
|------|---------|
| `index.html` | Dashboard shell |
| `styles.css` | Arkay blue executive styling |
| `app.js` | Month switching, search, rendering |
| `meetings/index.json` | Session manifest |
| `meetings/*.json` | One file per session |

Meeting notes typed in the browser are saved to **localStorage** per session.
