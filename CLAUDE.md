# Parksmart

Plain-JavaScript parking app. No TypeScript, Docker, migrations, or AI/LLM code.
- `backend/`: Express 4 + Mongoose (MongoDB) + socket.io, CommonJS. Also Stripe payments, Gmail-OAuth OTP email, and an optional Arduino serial bridge.
- `frontend/`: React 19 + Vite + Tailwind 3, ES modules. Deployed on Vercel.
- Two independent npm projects. There is no root package.json, so `cd` into the right half first.
- Scoped details live in `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

## Commands
Backend (`backend/`): `npm start` (node server.js), `npm test` (jest --runInBand --forceExit), `node seed.js` (creates admin user), `node bridge.js` (Arduino bridge).
Frontend (`frontend/`): `npm run dev | build | lint | test | preview` (`test` is Vitest).
CI (`.github/workflows/ci.yml`, Node 20): backend `npm test`, frontend `npm run lint` + `npm test` + `npm run build`. Run the matching commands before finishing a change.

## Environment variables (no `.env.example`; `.env` files are gitignored, never print or commit them)
Backend: `MongoDB_URL` (config/db.js; exact casing), `PORT`, `JWT_SECRET`, `CLIENT_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REDIRECT_URI`, `REFRESH_TOKEN`, `GMAIL_USER`, `STRIPE_SECRET_KEY`, `DEVICE_API_KEY` (Arduino bridge shared secret), plus optional `JWT_EXPIRES_IN` (default 1d), `SEED_ADMIN_PASSWORD`, bridge-only `SERIAL_PORT`/`BAUD_RATE`/`SPOT_NUMBER`/`BRIDGE_API_URL`, `TRUST_PROXY` (proxy hop count) and `GOOGLE_CALLBACK_URL` (redirect-flow callback). The server exits at startup without `JWT_SECRET`.
Frontend: `VITE_API_URL`, `VITE_MAPS_API`, `VITE_STRIPE_PUBLIC_KEY`, `VITE_GOOGLE_CLIENT_ID`.
The code, `seed.js`, the README and CI now all use these names. Keep the backend `MongoDB_URL` casing exactly; it is easy to "correct" by mistake.

## Pitfalls
- The README keeps unbuilt features (whatever is still listed there) under "Planned" headings. Keep them there; do not delete planned features, and move them out of "Planned" only when implemented.
- The tests mock `config/passport`, `config/db`, `socket` and the models, so a passing `npm test` does not prove the server boots. Start it with `npm start` to check.
- `npm audit` is clean for the backend and for the frontend's runtime dependencies (`npm audit --omit=dev`). 5 high findings remain in the frontend dev tooling: they all come through Tailwind 3 (`braces`), and the only fix is a breaking move to Tailwind 4. Do not run `npm audit fix --force` without planning that migration. Removed unused `two-step-auth`; upgraded `nodemailer`, `googleapis` and `google-auth-library` to current majors. Re-run `npm audit` after dependency changes.
- Never hand-edit `package-lock.json`.
- The repo is on OneDrive. Exclude `node_modules` from recursive searches.
- There is no `.gitattributes` or Prettier config, so expect CRLF warnings. Do not mass-reformat (indentation is mixed); match the surrounding file's style.
- The git history lags the working tree: `app.js`, `socket.js`, `seed.js`, `__tests__/` and `.github/` may be untracked. Check `git status` before assuming what is committed.

## Security conventions (enforced by tests in `backend/__tests__/`)
- Mutating routes use `authenticate`; admin routes add `requireAdmin` (reads the role from the DB, not the JWT); reservation actions check `ownsReservation`; the Arduino route uses `requireDeviceKey` (`x-device-key`). All live in `backend/middlewares/`.
- Take the user from `req.user.id`, never from the request body. Sign tokens only with `utils/token.js` `signToken` so they expire.
- Payments are verified against Stripe in `/api/payment/checkout`; the stored amount comes from Stripe. Each payment is claimed by one reservation in `/api/parking/reserve`.
- Anything from `req.body`/`req.query` that reaches a Mongo query must be type-checked with `backend/utils/validate.js` (ids via `isObjectId`); `middlewares/sanitize.js` also strips `$`/`.` keys. Never return an OTP in a response.
- Never return password hashes (`.select("-password")` or strip them) and never log secrets or connection strings.
- Open gaps (see README "Known Limitations"): no refresh tokens, the redirect-based Google login (`GET /api/auth/google`) works but the frontend does not use it and it has no OAuth `state`, rate limits are per-IP and in memory.
