# Parksmart

Plain-JavaScript parking app. No TypeScript, Docker, migrations, or AI/LLM code.
- `backend/`: Express 4 + Mongoose (MongoDB) + socket.io, CommonJS. Also Stripe payments, Gmail-OAuth OTP email, and an optional Arduino serial bridge.
- `frontend/`: React 19 + Vite + Tailwind 3, ES modules. Deployed on Vercel.
- Two independent npm projects. There is no root package.json, so `cd` into the right half first.
- Scoped details live in `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

## Commands
Backend (`backend/`): `npm start` (node server.js), `npm test` (jest --runInBand --forceExit), `node seed.js` (creates admin user), `node bridge.js` (Arduino bridge).
Frontend (`frontend/`): `npm run dev | build | lint | preview`. There are no frontend tests.
CI (`.github/workflows/ci.yml`, Node 20): backend `npm test`, frontend `npm run lint` + `npm run build`. Run the matching commands before finishing a change.

## Environment variables (no `.env.example`; `.env` files are gitignored, never print or commit them)
Backend: `MongoDB_URL` (config/db.js; exact casing), `PORT`, `JWT_SECRET`, `CLIENT_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REDIRECT_URI`, `REFRESH_TOKEN`, `GMAIL_USER`, `STRIPE_SECRET_KEY`.
Frontend: `VITE_API_URL`, `VITE_MAPS_API`, `VITE_STRIPE_PUBLIC_KEY`, `VITE_GOOGLE_CLIENT_ID`.
The code, `seed.js`, the README and CI now all use these names. Keep the backend `MongoDB_URL` casing exactly; it is easy to "correct" by mistake.

## Pitfalls
- The README's endpoint table is stale. Trust the code, not the README.
- The tests mock `config/passport`, `config/db`, `socket` and the models, so a passing `npm test` does not prove the server boots. Start it with `npm start` to check.
- `npm audit` reports about 26 known vulnerabilities in backend dependencies. They have not been addressed.
- Never hand-edit `package-lock.json`.
- The repo is on OneDrive. Exclude `node_modules` from recursive searches.
- There is no `.gitattributes` or Prettier config, so expect CRLF warnings. Do not mass-reformat (indentation is mixed); match the surrounding file's style.
- The git history lags the working tree: `app.js`, `socket.js`, `seed.js`, `__tests__/` and `.github/` may be untracked. Check `git status` before assuming what is committed.

## Known security gaps (do not copy these patterns; flag them if you touch the code)
- No auth on parking add/delete/checkin/checkout/update-status or on user reserve/cancel.
- `userId` is taken from the request body.
- `POST /api/payment/checkout` trusts the client's `amount` and `transactionId` and does not verify the Stripe intent.
- The login JWT has no expiry.
- `routes/settings.js` uses `req.user` without the `authenticate` middleware.
- `seed.js` hardcodes the admin password.
- The Google OAuth callback redirects to a hardcoded `localhost:5173`.
