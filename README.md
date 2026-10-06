# Smart Parking Management System

A full-stack web application for discovering, reserving, and managing parking spots. Built with React on the frontend, Node.js/Express on the backend, and MongoDB as the database. Includes an Arduino IoT bridge that pushes real-time sensor data directly into the backend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 3, React Router 7, Recharts (admin charts) |
| Backend | Node.js, Express 4 |
| Real-time | socket.io (server) and socket.io-client (live spot updates) |
| Database | MongoDB Atlas, Mongoose ODM |
| Authentication | JWT, Google OAuth2 |
| Payments | Stripe (Payment Intents API) |
| Maps | Google Maps JavaScript API (@react-google-maps/api) |
| Email / OTP | Nodemailer + Gmail OAuth2 |
| IoT Bridge | Node.js serialport, Arduino over COM5 at 9600 baud |
| Testing / CI | Jest + supertest (backend), ESLint (frontend), GitHub Actions |
| Hosting | Frontend on Vercel (`frontend/vercel.json` rewrites all paths to `index.html`); no backend deployment config yet |

---

## How It Works

```
React SPA (Vite, :5173)
        |
        |  HTTP/REST  (Axios, Bearer JWT)
        v
Express API (:3000)
        |
        |  Mongoose
        v
MongoDB Atlas
        
Arduino --> bridge.js (serialport) --> POST /api/parking/update-status
                                              |
                                              v
                        socket.io "spot:updated" --> connected browsers (live map)
```

The frontend sends a JWT in the `Authorization: Bearer` header on every authenticated request. The `authenticate` middleware in Express verifies it and attaches the user to `req.user`.

Server structure: `backend/server.js` creates the HTTP server, initialises socket.io (`socket.js`), connects to MongoDB and listens on `PORT`. `backend/app.js` builds the Express app (`helmet` security headers, CORS for `CLIENT_URL`, JSON parsing capped at 10 KB, Passport, rate limits of 20 requests per minute on `/api/auth`, 30 per minute on `/api/payment` and 600 per 15 minutes on all of `/api` and `/app`, a `/health` endpoint) and mounts the routers.

---

## Features

### Authentication

- **Sign up** requires name, email, phone number, password, and a 6-digit OTP sent to the email. OTP is verified at signup time and deleted once used. The OTP is only ever emailed: `/sendotp` never returns it in the response, and answers 502 (discarding the OTP) if the email could not be sent.
- **Log in** accepts either email or phone number plus password.
- **Google sign-in** uses the Google ID token exchange flow. The backend verifies the token with `OAuth2Client`, then creates or finds the user and returns a JWT.
- Passwords are hashed with bcryptjs (10 salt rounds).
- JWT tokens are stored in `localStorage` on the client.
- Every JWT (signup, email/phone login, Google) expires after 1 day by default; set `JWT_EXPIRES_IN` (for example `1h`) to change it. There is no refresh-token flow yet, so users sign in again after expiry.
- Login returns the same `401 Invalid credentials` for an unknown user, a Google-only account and a wrong password, so it cannot be used to discover which emails are registered.

### Parking Spots

- View all spots.
- Find the nearest available spot by passing `lat` and `lng` as query params (`GET /api/parking/nearest`, requires login). Euclidean distance is used to compare spots.
- Find nearby spots within a radius (default 0.5 km). Uses a bounding-box query on `lat`/`lng` (1 km ≈ 0.009 degrees).

### Reservations

**Current behavior**

- Reserve a spot with `POST /api/parking/reserve` by providing `spotId`, `startTime`, and `endTime`. The user comes from the JWT.
- The backend validates:
  - The spot exists and is available
  - `startTime` and `endTime` are valid dates and `endTime` is after `startTime`
  - `startTime` is not in the past (a 10-minute grace window covers the time spent paying) and is no more than 20 minutes from now
  - The user has no other active (`reserved` or `checked-in`) reservation whose time range overlaps this one (409). `POST /api/payment/create-intent` runs the same check so the user is not charged for a booking that would be rejected. Back-to-back bookings are allowed. Two bookings can never share a spot, because the spot is claimed with one conditional write. Because that check is a read followed by writes, it runs a second time after the reservation is saved; if a simultaneous request from the same user also got saved, the new booking is undone (reservation deleted, payment or wallet refunded, spot released) and answers 409.
  - The user has a completed payment that has not been used yet. Each payment covers exactly one reservation: the reservation claims it, so one payment cannot be reused for unlimited bookings.
- A successful reservation marks the spot unavailable (`reservedBy` is set) and broadcasts a `spot:updated` socket event.
- Reservation statuses: `reserved` → `checked-in` → `completed`, `reserved` → `cancelled`, or `reserved` → `violated` (set by the sensor, see IoT Sensor Bridge).
- Check-in (`POST /api/parking/checkin`) moves a `reserved` reservation to `checked-in`, sets the spot's `occupiedBy` to the user and broadcasts `spot:updated`. Check-in, check-out, checkout-credit and cancel only work on the logged-in user's own reservations (403 otherwise).
- Check-out (`POST /api/parking/checkout`) moves a `checked-in` reservation to `completed`, makes the spot available again (clearing `occupiedBy`) and broadcasts `spot:updated`. `POST /api/user/checkout-credit` does the same and also credits unused time to the wallet (see Wallet).
- Cancelling (`DELETE /api/user/cancel/:id`) is only allowed before check-in. It frees the spot, broadcasts `spot:updated` and keeps the reservation with status `cancelled` so history and the admin view still show it. Cancelling does not refund the payment.

### Payments

- The frontend creates a Stripe Payment Intent via `POST /api/payment/create-intent` by sending `startTime` and `endTime`. The server prices the booking itself ($5 per started hour, `utils/pricing.js`); any amount in the body is ignored.
- The intent is tagged with the user's id and the amount must be between $0.50 and $1,000.
- After the user confirms on the frontend, `POST /api/payment/checkout` records the payment. The server retrieves the PaymentIntent from Stripe and only saves it if it has `succeeded`, belongs to the same user and has not been recorded before. The stored amount is the one Stripe reports; the `amount` sent by the client is ignored.
- Supported payment methods in the schema: `credit_card`, `debit_card`, `paypal`, `bank_transfer`. Only card payments are created today, so the checkout route always records `credit_card`.
- A completed, unused payment whose amount equals the server price for the booked duration is required before a reservation can be made.

### IoT Sensor Bridge

`backend/bridge.js` reads lines from an Arduino over a serial port (default COM5 at 9600 baud). It expects either `"occupied"` or `"available"` from the Arduino and ignores any other line.

On each reading it calls `POST /api/parking/update-status` with the `spotNumber` (default `"11"`) and the parsed `isAvailable` boolean. The request carries an `x-device-key` header taken from `DEVICE_API_KEY` in `backend/.env`; the backend compares it with its own `DEVICE_API_KEY` and rejects anything else (and rejects everything if the key is not configured). Generate a long random value, for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

**Current behavior:** the backend sets `isAvailable` on the matching spot and broadcasts a `spot:updated` socket event so open maps update live. It returns 404 if the spot number does not exist. An `available` report is ignored (200 with `ignored: true`, no broadcast) while the spot is reserved, so the sensor cannot free a spot someone has booked; an `occupied` report is always applied. A reserved spot is freed only by check-out, checkout-credit or cancel.

**Reservation rules driven by the sensor** (covered by unit tests; not yet verified against real hardware):

- **Occupied, nobody checked in:** if a `reserved` reservation exists for the spot and its `startTime` was more than 5 minutes ago, it is marked `violated` and the spot's hold (`reservedBy`) is released so the spot frees normally when the car leaves. A booking that has not started, or started less than 5 minutes ago, is left alone so the holder can park and check in. A violation does not refund the payment.
- **Available, user checked in:** the reservation is completed, the unused minutes are credited to the user's wallet at $5 per hour and the spot is freed, exactly like `POST /api/user/checkout-credit`. Both paths share `utils/checkoutCredit.js`, which claims the `checked-in` to `completed` change atomically so a manual check-out and a sensor report cannot credit twice.

**Bridge settings** (all optional, in `backend/.env`): `SERIAL_PORT` (default `COM5`), `BAUD_RATE` (default `9600`), `SPOT_NUMBER` (default `11`, must exist in the database) and `BRIDGE_API_URL` (default `http://localhost:3000`).

### Admin

- Admin users can add and delete parking spots.
- Admin-only endpoints return all reservations and all payments across all users (password hashes are never included).
- Every admin route is protected by the `requireAdmin` middleware (`backend/middlewares/authorize.js`), which reads the user's role from the database rather than trusting the token.

### History and Settings

- Users can view their own reservation history and payment history.
- The settings page shows the wallet balance and lets users update their name, email, and phone number (`GET`/`PUT /app/settings`). Only those three fields can be changed, and the password hash is never returned.

### Wallet

- Each user has a `walletBalance` (default 0, never negative).
- `GET /api/user/wallet` returns the balance, and the Settings page displays it.
- `POST /api/user/checkout-credit` checks a user out and credits the unused part of the booking at $5 per hour (`RATE_PER_HOUR` in `reservationData.js`).
- The Check In/Out page calls `/api/user/checkout-credit`, so unused time is credited when you check out early and the freed spot is broadcast to open maps.
- A reservation can be paid from the wallet: `POST /api/parking/reserve` with `useWallet: true` debits the server-computed price in one conditional write (402 if the balance is too low) and records a `wallet` payment. The balance is refunded if the reservation fails to save. The Payment page offers a "Pay with wallet" button.

### Input validation

- Every value from the request that reaches a database query is checked to be a primitive of the expected type (`utils/validate.js`): ids must be 24-character hex strings, emails, phone numbers and passwords are shape- and length-checked (passwords up to 72 characters, bcrypt's limit), and `useWallet` must be a boolean. Invalid input gets a 400.
- `middlewares/sanitize.js` additionally drops any key starting with `$` or containing `.` from the body and query string, so an object such as `{ "$ne": null }` can never be interpreted as a Mongo operator.
- `POST /api/payment/checkout` ignores any `reservationId` in the body; only `/api/parking/reserve` links a payment to a reservation.

### Real-time Updates

`backend/socket.js` runs a socket.io server on the same port as the API. Reserve, check-out and `update-status` broadcast a `spot:updated` event carrying the updated spot, and `frontend/src/components/Maps.jsx` subscribes to it so the map refreshes without polling.

---

## Data Models

**User**
```
name          String   required
email         String   required, unique
password      String   bcrypt hashed; not required for Google OAuth users
role          "user" | "admin"   default: "user"
provider      "local" | "google"   default: "local"
phoneNumber   String   10 digits, required for local accounts, unique
walletBalance Number   default: 0, min: 0
cars          [ObjectId → Car]
createdAt     Date
```

**Car** (schema defined, no API routes currently)
```
userId        ObjectId → User
carMake       String   required
carModel      String   required
carColor      String   required
licensePlate  String   required, unique, uppercased
isPrimary     Boolean  default: false
registrationDate Date
```

**ParkingSpot**
```
lotNumber     String   required
spotNumber    String   required, unique
isAvailable   Boolean  default: true
reservedBy    ObjectId → User   nullable
occupiedBy    ObjectId → User   nullable (not set by any route yet)
lat           Number   required
lng           Number   required
```

**Reservation**
```
userId     ObjectId → User       required
spotId     ObjectId → ParkingSpot  required
startTime  Date   required
endTime    Date   required
status     "reserved" | "checked-in" | "completed" | "cancelled"   default: "reserved"
```

**CheckIn / CheckOut** (schemas defined in `parking_db.js`, not yet written to by any route)
```
userId         ObjectId → User         required
reservationId  ObjectId → Reservation  required
checkInTime / checkOutTime   Date      default: now
```

Indexes: spots on `(lat, lng)` and `isAvailable`; reservations on `userId`, `spotId` and `status`.

**Payment**
```
userId         ObjectId → User         required
reservationId  ObjectId → Reservation  optional
amount         Number   required
status         "pending" | "completed" | "failed"   default: "pending"
paymentMethod  "credit_card" | "debit_card" | "paypal" | "bank_transfer"   required
transactionId  String   unique, required
timestamp      Date
```

**OTP**
```
email      String   required
otp        String   required
createdAt  Date     TTL: auto-expires after 10 minutes
```

**Notification** (schema defined, no API routes currently)
```
userId     ObjectId → User   required
message    String   required
type       "reservation" | "payment" | "parking_update" | "system_alert"
isRead     Boolean  default: false
timestamp  Date
```

---

## API Endpoints

### Auth — `/api/auth`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| POST | `/sendotp` | Validates email/name/phone/password are unused, generates a 6-digit OTP, emails it | No |
| POST | `/signup` | Creates user account after verifying the submitted OTP matches the latest stored OTP | No |
| POST | `/login` | Accepts email or phone number + password, returns JWT | No |
| GET | `/google` | Redirects to Google OAuth consent screen (Passport.js) | No |
| GET | `/google/callback` | Handles OAuth callback, redirects to frontend with JWT in query param | No |
| POST | `/google` | Accepts a Google ID token from the frontend, verifies it, returns JWT | No |

### Parking — `/api/parking`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| POST | `/add` | Add a new parking spot (lotNumber, spotNumber, lat, lng) | Yes + admin role |
| DELETE | `/delete/:id` | Delete a parking spot by ID | Yes + admin role |
| GET | `/all` | Get all parking spots | No |
| POST | `/reserve` | Reserve a spot (20-minute start window; claims one unused completed payment) | Yes |
| POST | `/checkin` | Move a reservation from `reserved` to `checked-in` | Yes (own reservation) |
| POST | `/checkout` | Move a reservation to `completed`, free the spot, broadcast `spot:updated` | Yes (own reservation) |
| GET | `/nearest` | Get the nearest available spot to `lat`/`lng` | Yes |
| GET | `/nearby` | Get spots within a radius (km, default 0.5) of `lat`/`lng` | No |
| POST | `/update-status` | Called by the IoT bridge to set `isAvailable` and broadcast `spot:updated` | Device key (`x-device-key` header) |

### Payment — `/api/payment`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| POST | `/create-intent` | Creates a Stripe PaymentIntent priced from `startTime`/`endTime`, returns client_secret | Yes |
| POST | `/checkout` | Verifies the PaymentIntent with Stripe, then saves the payment (`transactionId` required; the amount comes from Stripe) | Yes |

### User — `/api/user`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| GET | `/reservations` | Get the logged-in user's reservations | Yes |
| GET | `/payments` | Get the logged-in user's payment history | Yes |
| GET | `/wallet` | Get the logged-in user's wallet balance | Yes |
| DELETE | `/cancel/:id` | Cancel a reservation before check-in: frees the spot and deletes the record | Yes (own reservation) |
| POST | `/checkout-credit` | Check out and credit unused time to the wallet at $5/hour | Yes |

### Admin — `/api/admin`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| GET | `/reservations` | Get all reservations (all users) | Yes + admin role |
| GET | `/payments` | Get all payments (all users) | Yes + admin role |

### Settings — `/app/settings`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| GET | `/app/settings` | Get the logged-in user's info (no password hash) | Yes |
| PUT | `/app/settings` | Update name, email, phone number (409 if the email or phone is taken) | Yes |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |

---

## Frontend Routes

| Path | Page | Protected |
|------|------|-----------|
| `/` | Home (map view) | Yes |
| `/signin` | Sign in | Public only |
| `/signup` | Sign up with OTP | Public only |
| `/reserve` | Reserve a spot | Yes |
| `/payment` | Stripe payment | Yes |
| `/payment/success` | Payment confirmation | No |
| `/check` | Check in / Check out | Yes |
| `/history` | Reservation and payment history | Yes |
| `/settings` | User settings | Yes |
| `/admin` | Admin dashboard | Yes + admin only |

---

## Getting Started

**Prerequisites:** Node.js, a MongoDB Atlas cluster, a Google Cloud project with OAuth2 enabled, a Stripe test account, a Gmail account with OAuth2 set up.

**Backend**
```bash
cd backend
npm install
# Create a .env file with the variables listed below
npm start            # runs node server.js
node seed.js         # optional: creates the admin user admin@ufv.ca; uses SEED_ADMIN_PASSWORD, or generates a random password and prints it once
npm test             # Jest tests (models, db and passport are mocked, no database needed)
```

**Frontend**
```bash
cd frontend
npm install
# Create a .env file with the Vite variables listed below
npm run dev          # dev server on :5173
npm run lint         # ESLint
npm run build        # production build
```

**IoT Bridge (optional — requires an Arduino, COM5 by default)**
```bash
cd backend
node bridge.js
```

---

## Environment Variables

**backend/.env**
```
MongoDB_URL=
JWT_SECRET=                        # required: the server refuses to start without it
JWT_EXPIRES_IN=1d                  # optional: lifetime of every issued token (default 1d)
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback  # optional: redirect-flow callback; must be an authorized redirect URI in Google Cloud
TRUST_PROXY=1                      # optional: number of reverse-proxy hops, so rate limits use the real client IP
DEVICE_API_KEY=                    # shared secret for the Arduino bridge; sensor updates are rejected without it
SERIAL_PORT=COM5                   # optional, bridge only: serial port (also BAUD_RATE, SPOT_NUMBER, BRIDGE_API_URL)
SEED_ADMIN_PASSWORD=               # optional: password for node seed.js (random if unset)
PORT=3000
CLIENT_URL=http://localhost:5173   # CORS and socket.io origin (this is the default)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
REFRESH_TOKEN=
REDIRECT_URI=http://localhost:3000/auth/google/callback
GMAIL_USER=
STRIPE_SECRET_KEY=
```

**frontend/.env**
```
VITE_API_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=
VITE_MAPS_API=
VITE_STRIPE_PUBLIC_KEY=
```

`VITE_API_URL` is read once in `frontend/src/config.js` and used by every page. It falls back to `http://localhost:3000` when unset.

---

## Testing and CI

- Backend: `cd backend && npm test` runs Jest with supertest over `backend/__tests__/` (health, auth and parking routes). The tests mock the Mongoose models, socket.io, the database config and Passport, so they do not exercise a real database.
- Frontend: `cd frontend && npm test` runs Vitest with Testing Library over `ProtectedRoute`, `PublicRoute` and the History page. Coverage is still thin (the other pages have no tests); `npm run lint` and `npm run build` are the other checks.
- CI: `.github/workflows/ci.yml` runs on pushes and pull requests to `main`/`master` (Node 20): backend `npm ci` + `npm test`, then frontend `npm ci` + lint + test + build.

---

## Known Limitations

Current gaps that are worth fixing before a real deployment:

- Claiming a spot in `/api/parking/reserve` is atomic, so two users booking the same spot at the same moment can no longer both succeed. Overlap checks for the same user are in place (see Reservations).
- There is no refresh-token flow and tokens cannot be revoked before they expire. The token is kept in `localStorage`.
- The redirect-based Google login (`GET /api/auth/google` and its callback) is fixed and tested, but the frontend still signs in with the ID-token flow (`POST /api/auth/google`) and has no button for the redirect flow. It has no OAuth `state` check because there is no session store.
- Frontend dev tooling has 5 high `npm audit` findings that come through Tailwind 3 (`braces`) and only affect the build machine; the shipped dependencies are clean. Fixing them means migrating to Tailwind 4.
- Request validation is hand-written per route (`utils/validate.js`), not a schema library. Rate limits are per IP and in memory, so they reset on restart and are not shared across instances.

---

