# YBD (Yo Big Dawg)

Phase 1 foundation for a static web-based darts game.

This release includes:
- React + TypeScript app scaffolded with Vite.
- GitHub Pages deployment configuration.
- Progressive Web App support (manifest + service worker).
- Offline fallback page.
- Local browser profile storage demo.

## Requirements

- Node.js 24+
- npm 11+

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

Two deployment options are included.

1. GitHub Actions deployment (recommended)
   - Workflow file: `.github/workflows/deploy-pages.yml`
   - Push to `main` and the action builds/deploys automatically.

2. Manual deploy from local machine

```bash
npm run deploy
```

## Manual Phase 1 Test Checklist

1. Open the site and verify the landing page loads under `/ybd/` path.
2. Enter a player name, save profile, refresh, and verify data persists.
3. Install as a PWA on a supported browser.
4. Go offline and verify fallback page loads.
5. Reconnect and verify app recovers.

## Notes

- This project is static-only. No backend database is used.
- Multiplayer and WebRTC game features begin in Phase 2.
