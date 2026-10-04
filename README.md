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

Server structure: `backend/server.js` creates the HTTP server, initialises socket.io (`socket.js`), connects to MongoDB and listens on `PORT`. `backend/app.js` builds the Express app (CORS for `CLIENT_URL`, JSON parsing, Passport, a rate limit of 20 requests per minute on `/api/auth`, a `/health` endpoint) and mounts the routers.

---

## Features

### Authentication

- **Sign up** requires name, email, phone number, password, and a 6-digit OTP sent to the email. OTP is verified at signup time.
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
  - `startTime` is no more than 20 minutes from now
  - The user has a completed payment that has not been used yet. Each payment covers exactly one reservation: the reservation claims it, so one payment cannot be reused for unlimited bookings.
- A successful reservation marks the spot unavailable (`reservedBy` is set) and broadcasts a `spot:updated` socket event.
- Reservation statuses: `reserved` → `checked-in` → `completed`. The schema also allows `cancelled`.
- Check-in (`POST /api/parking/checkin`) moves a `reserved` reservation to `checked-in`. Check-in, check-out, checkout-credit and cancel only work on the logged-in user's own reservations (403 otherwise).
- Check-out (`POST /api/parking/checkout`) moves a `checked-in` reservation to `completed`, makes the spot available again and broadcasts `spot:updated`. `POST /api/user/checkout-credit` does the same and also credits unused time to the wallet (see Wallet).
- Cancelling (`DELETE /api/user/cancel/:id`) is only allowed before check-in. It frees the spot and deletes the reservation record.

**Planned (not yet implemented)**

- Validate that `startTime` is in the future and before `endTime`.
- Reject reservations that overlap an existing active reservation for the same user or the same spot.
- Mark the spot as occupied (`occupiedBy`) on check-in.
- Keep cancelled reservations with a `cancelled` status instead of deleting them.

### Payments

- The frontend creates a Stripe Payment Intent via `POST /api/payment/create-intent` (amount in cents, USD).
- The intent is tagged with the user's id and the amount must be between $0.50 and $1,000.
- After the user confirms on the frontend, `POST /api/payment/checkout` records the payment. The server retrieves the PaymentIntent from Stripe and only saves it if it has `succeeded`, belongs to the same user and has not been recorded before. The stored amount is the one Stripe reports; the `amount` sent by the client is ignored.
- Supported payment methods in the schema: `credit_card`, `debit_card`, `paypal`, `bank_transfer`. Only card payments are created today, so the checkout route always records `credit_card`.
- A completed, unused payment is required before a reservation can be made.

### IoT Sensor Bridge

`backend/bridge.js` reads lines from an Arduino over serial port COM5 at 9600 baud. It expects either `"occupied"` or `"available"` from the Arduino.

On each reading it calls `POST /api/parking/update-status` with the `spotNumber` (hardcoded to `"11"` in bridge.js) and the parsed `isAvailable` boolean. The request carries an `x-device-key` header taken from `DEVICE_API_KEY` in `backend/.env`; the backend compares it with its own `DEVICE_API_KEY` and rejects anything else (and rejects everything if the key is not configured). Generate a long random value, for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

**Current behavior:** the backend sets `isAvailable` on the matching spot and broadcasts a `spot:updated` socket event so open maps update live. It returns 404 if the spot number does not exist.

**Planned (not yet implemented):**
- If the sensor says occupied but no user has checked in: mark any active reservation for that spot as `"violated"` (this status does not exist in the schema yet).
- If the sensor says available but a user is checked in: calculate the unused minutes, add them to the user's wallet, and mark the reservation as completed.
- Make the serial port and spot number configurable instead of hardcoded.

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
- The Check In/Out page currently calls `/api/parking/checkout`, which does not credit the wallet. **Planned:** switch the UI to the credit endpoint and let the balance pay for future reservations.

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
| POST | `/create-intent` | Creates a Stripe PaymentIntent, returns client_secret | Yes |
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

**IoT Bridge (optional — requires Arduino on COM5)**
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
DEVICE_API_KEY=                    # shared secret for the Arduino bridge; sensor updates are rejected without it
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

`VITE_API_URL` is read by the map, home, admin and settings pages. Several older files (sign in/up, reserve, payment, check in/out, history) still hardcode `http://localhost:3000`, so change both until they are migrated.

---

## Testing and CI

- Backend: `cd backend && npm test` runs Jest with supertest over `backend/__tests__/` (health, auth and parking routes). The tests mock the Mongoose models, socket.io, the database config and Passport, so they do not exercise a real database.
- Frontend: there are no tests yet; `npm run lint` and `npm run build` are the checks.
- CI: `.github/workflows/ci.yml` runs on pushes and pull requests to `main`/`master` (Node 20): backend `npm ci` + `npm test`, then frontend `npm ci` + lint + build.

---

## Known Limitations

Current gaps that are worth fixing before a real deployment:

- Claiming a spot in `/api/parking/reserve` is atomic, so two users booking the same spot at the same moment can no longer both succeed. Time-range overlap checks are still Planned (see Reservations), and the device route `/api/parking/update-status` can still overwrite `isAvailable` on a reserved spot.
- Payments are matched to reservations by user, not by price, so a cheap payment can still claim a longer booking. Pricing should be computed on the server from the booked duration.
- There is no refresh-token flow and tokens cannot be revoked before they expire. The token is kept in `localStorage`.
- The redirect-based Google login (`GET /api/auth/google` and its callback) is not working: the Passport verify callback in `config/passport.js` has the wrong argument order and a relative `callbackURL`. The frontend uses the ID-token flow (`POST /api/auth/google`), which does work.
- No request-body schema validation beyond the checks in each route, no `helmet` headers, and the rate limit only covers `/api/auth`.
- The wallet credit endpoint exists but the Check In/Out page does not use it.
- The frontend still hardcodes `http://localhost:3000` in many files (see Environment Variables).

---

