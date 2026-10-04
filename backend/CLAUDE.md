# Backend

CommonJS (`require`/`module.exports`), Express 4, Mongoose 8. Errors are JSON `{ message }`, using async/await with try/catch.

## Startup
`server.js` loads dotenv, creates the HTTP server, calls `socket.init(httpServer)`, runs `connectDb()` and listens on `PORT`.
`app.js` sets CORS (origin `CLIENT_URL`, default `http://localhost:5173`), `express.json()`, passport, and a 20 req/min rate limit on `/api/auth` only. It also serves `/health`.

## Route mounts
| Mount | File |
|---|---|
| `/api/auth` | `routes/auth.js` |
| `/api/parking` | `routes/parkingData.js` |
| `/api/payment` | `routes/payment.js` |
| `/api/user` | `routes/reservationData.js` |
| `/api/admin` | `routes/admin.js` |
| `/app/settings` | `routes/settings.js` (note: not under `/api`) |

Auth middleware is `middlewares/authenticate.js`. Most routes do not use it yet; see the root CLAUDE.md.

## Key flows
- **Signup:** `POST /api/auth/sendotp` emails an OTP via Gmail OAuth2 (`utils/mailSender.js`). `POST /signup` verifies it, hashes the password with bcrypt and returns a JWT.
- **Reservation:** the client creates a Stripe intent (`/api/payment/create-intent`), confirms it, then calls `/api/payment/checkout`. After that `POST /api/parking/reserve` requires a completed payment, a start time within 20 minutes and an available spot. It marks the spot unavailable.
- **Check-in/out:** `/api/parking/checkin` and `/checkout`. `/api/user/checkout-credit` credits `User.walletBalance` at $5/hour for unused time.
- **IoT:** `bridge.js` reads `occupied`/`available` from serial and POSTs `/api/parking/update-status`. That route only sets `isAvailable` and emits. The violation/wallet logic in the README is not implemented.

## Socket contract
`socket.js` exports `init(httpServer)` and an emitter. The `spot:updated` event is emitted on reserve and update-status. `frontend/src/components/Maps.jsx` subscribes to it. Keep the payload shape stable.

## Models (`models/`)
`ParkingSpot`, `Reservation`, `CheckIn` and `CheckOut` are all in `parking_db.js`. `Payment` is in `payments.js`. `OtpModel` has a 10-minute TTL. `Car` and `Notification` have no routes.

## Tests (`__tests__/`)
Jest + supertest, matching `**/__tests__/**/*.test.js`. Tests mock the models, `socket`, `config/db` and `config/passport`, so they never touch a real database. Follow that pattern and add a test when you add a route. Run `npm test` from `backend/`.

## bridge.js
A standalone script that is not started by the server. It hardcodes Windows port `COM5`, 9600 baud, spot `"11"` and `http://localhost:3000`. It uses the native `serialport` module.
