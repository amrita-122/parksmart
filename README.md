# Smart Parking Management System

A full-stack web application for discovering, reserving, and managing parking spots. Built with React on the frontend, Node.js/Express on the backend, and MongoDB as the database. Includes an Arduino IoT bridge that pushes real-time sensor data directly into the backend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 3, React Router DOM |
| Backend | Node.js, Express 4 |
| Database | MongoDB Atlas, Mongoose ODM |
| Authentication | JWT, Google OAuth2 |
| Payments | Stripe (Payment Intents API) |
| Maps | Google Maps JavaScript API (@react-google-maps/api) |
| Email / OTP | Nodemailer + Gmail OAuth2 |
| IoT Bridge | Node.js serialport, Arduino over COM5 at 9600 baud |

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
```

The frontend sends a JWT in the `Authorization: Bearer` header on every authenticated request. The `authenticate` middleware in Express verifies it and attaches the user to `req.user`.

---

## Features

### Authentication

- **Sign up** requires name, email, phone number, password, and a 6-digit OTP sent to the email. OTP is verified at signup time.
- **Log in** accepts either email or phone number plus password.
- **Google sign-in** uses the Google ID token exchange flow. The backend verifies the token with `OAuth2Client`, then creates or finds the user and returns a JWT.
- Passwords are hashed with bcryptjs (10 salt rounds).
- JWT tokens are stored in `localStorage` on the client.

### Parking Spots

- View all spots.
- Find the nearest available spot by passing `lat` and `lng` as query params. Euclidean distance is used to compare spots.
- Find nearby spots within a radius (default 0.5 km). Uses a bounding-box query on `lat`/`lng` (1 km ≈ 0.009 degrees).

### Reservations

- Reserve a spot by providing `spotId`, `startTime`, and `endTime`.
- The backend validates:
  - `startTime` must be in the future and before `endTime`
  - The user has no overlapping active reservations
  - The spot has no overlapping active reservations
  - The user has at least one completed payment on record
- Reservation statuses: `reserved` → `checked-in` → `completed` / `cancelled`
- Check-in transitions a reservation from `reserved` to `checked-in` and marks the spot as occupied.
- Check-out transitions to `completed` and marks the spot as available again.
- Users can also cancel a reservation, which frees the spot.

### Payments

- The frontend creates a Stripe Payment Intent via `POST /api/payment/create-intent` (amount in cents, USD).
- After the user confirms on the frontend, the payment record is saved to the database via `POST /api/payment/checkout`.
- Supported payment methods stored in the database: `credit_card`, `debit_card`, `paypal`, `bank_transfer`.
- A completed payment is required before a reservation can be made.

### IoT Sensor Bridge

`backend/bridge.js` reads lines from an Arduino over serial port COM5 at 9600 baud. It expects either `"occupied"` or `"available"` from the Arduino.

On each reading it calls `POST /api/parking/update-status` with the `spotNumber` (hardcoded to `"11"` in bridge.js) and the parsed `isAvailable` boolean.

The backend then:
- If the sensor says occupied but no user has checked in: marks any active reservation for that spot as `"violated"`.
- If the sensor says available but a user is checked in: calculates unused minutes, adds them to the user's wallet field, and marks the reservation as completed.

### Admin

- Admin users can add and delete parking spots.
- Admin-only endpoints return all reservations and all payments across all users. These are protected by an inline role check (`req.user.role !== "admin"`).

### History and Settings

- Users can view their own reservation history and payment history.
- The settings page allows users to update their name, email, and phone number.

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
occupiedBy    ObjectId → User   nullable
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
| POST | `/add` | Add a new parking spot (lotNumber, spotNumber, lat, lng) | No |
| DELETE | `/delete/:id` | Delete a parking spot by ID | No |
| GET | `/all` | Get all parking spots | No |
| POST | `/reserve` | Reserve a spot with time-conflict and payment checks | Yes |
| POST | `/checkin` | Check in to a reserved spot | Yes |
| POST | `/checkout` | Check out of a spot, marks reservation completed | No |
| GET | `/nearby` | Get spots within a radius of lat/lng | No |
| POST | `/update-status` | Called by the IoT bridge to update spot occupancy | No |

### Payment — `/api/payment`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| POST | `/create-intent` | Creates a Stripe PaymentIntent, returns client_secret | Yes |
| POST | `/checkout` | Saves a completed payment record to the database | Yes |

### User — `/api/user`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| GET | `/reservations` | Get the logged-in user's reservations | Yes |
| GET | `/payments` | Get the logged-in user's payment history | Yes |
| POST | `/reserve` | Reserve a spot (no overlap or payment check) | No |
| DELETE | `/cancel/:id` | Cancel a reservation and free the spot | No |
| GET | `/spot/:id/reservations` | Get active/future reservations for a specific spot | No |

### Admin — `/api/admin`

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| GET | `/reservations` | Get all reservations (all users) | Yes + admin role |
| GET | `/payments` | Get all payments (all users) | Yes + admin role |

### Settings — `/app/settings`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | Get user info |
| PUT | `/settings` | Update name, email, phone number |

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
node server.js
```

**Frontend**
```bash
cd frontend
npm install
# Create a .env file with the Vite variables listed below
npm run dev
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
MONGODB_URL=
JWT_SECRET=
PORT=3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
REFRESH_TOKEN=
REDIRECT_URL=http://localhost:3000/auth/google/callback
GMAIL_USER=
MAPS_API=
STRIPE_SECRET_KEY=
```

**frontend/.env**
```
VITE_GOOGLE_CLIENT_ID=
VITE_MAPS_API=
VITE_STRIPE_PUBLIC_KEY=
```

---

