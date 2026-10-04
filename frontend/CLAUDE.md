# Frontend

React 19 + Vite + Tailwind 3 (ES modules, JSX). Source is in `src/` (`pages/`, `components/`, `layouts/MainLayout.jsx`).

## Commands
`npm run dev | build | lint | preview`. There are no tests, so run `npm run lint` and `npm run build` before finishing.
ESLint 9 flat config (`eslint.config.js`): recommended + react-hooks + react-refresh. `no-unused-vars` is an **error**; names starting with a capital letter or underscore are ignored.

## API base URL
Import `API_URL` from `src/config.js` (reads `VITE_API_URL`, falls back to `http://localhost:3000`). Do not hardcode the host.

## Tooling notes
- The Tailwind config is `tailwind.config.cjs` (CommonJS). The package is `"type": "module"`, so a `.js` config that uses `module.exports` fails to load on newer Node versions.
- `npm audit --omit=dev` is clean. The remaining dev-only findings come from Tailwind 3's dependency chain.

## Other env vars
`VITE_MAPS_API` (Google Maps), `VITE_STRIPE_PUBLIC_KEY` and `VITE_GOOGLE_CLIENT_ID` (read in `main.jsx`). CI builds with a differently named `VITE_STRIPE_KEY`, so the build passes without validating these.

## Conventions
- Auth: the JWT is stored in `localStorage`. Routes are wrapped in `ProtectedRoute` or `PublicRoute` (named exports from `components/`) in `App.jsx`.
- Export style is mixed: some pages are named exports (`SignIn`, `Home`), others default (`Payment`, `Settings`). Check how `App.jsx` imports a page before changing its export.
- Live spot updates: `Maps.jsx` listens for the backend's `spot:updated` socket event.

## Deploy
`vercel.json` rewrites every path to `/index.html` (SPA routing). There is no backend deployment config.
