# ParkSmart — Intelligent Parking Management System

A full-stack smart parking platform that combines real-time IoT sensor data, geolocation, and integrated payment processing to streamline parking discovery, reservation, and management for both end-users and administrators.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Data Models](#data-models)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [IoT Integration](#iot-integration)
- [Known Limitations & Future Work](#known-limitations--future-work)
- [Team](#team)

---

## Overview

ParkSmart solves the problem of manual, inefficient parking management by providing:

- **Real-time availability** — Arduino sensors update spot occupancy directly through a Node.js serial bridge
- **Reservation system** — users book spots in advance with time-conflict validation and payment-first enforcement
- **Geolocation-aware discovery** — the map surface finds the nearest available spot using the user's live position and Google Maps Distance Matrix
- **Admin control plane** — a dedicated dashboard for managing spots, monitoring reservations, and auditing payments

The system enforces a payment-before-reservation model to eliminate abandoned bookings and handles sensor/user state conflicts with automatic refund logic.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 3 |
| Backend | Node.js, Express 4 |
| Database | MongoDB Atlas (Mongoose ODM) |
| Authentication | JWT, Google OAuth2 (Passport.js) |
| Payments | Stripe (Payment Intents API) |
| Maps | Google Maps JavaScript API, Distance Matrix API |
| Email | Nodemailer + Gmail OAuth2 |
| IoT Bridge | Node.js `serialport` → Arduino |
| Real-time | Polling (10s intervals); socket.io installed but not yet active |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│   React 19 SPA  │  Vite Dev Server (:5173)                  │
│   Tailwind CSS  │  @react-google-maps  │  @stripe/react     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST (Axios)
                           │ Bearer JWT in Authorization header
┌──────────────────────────▼──────────────────────────────────┐
│                        API Layer                            │
│   Express 4  │  Port 3000  │  CORS: localhost:5173          │
│                                                             │
│   /api/auth      → Registration, Login, Google OAuth        │
│   /api/parking   → Spots, Reservations, Check-in/out        │
│   /api/payment   → Stripe intents, transaction records      │
│   /api/user      → Reservation & payment history            │
│   /api/admin     → Admin-only aggregated views              │
│   /app/settings  → Vehicle management                       │
└──────────┬──────────────────────────┬───────────────────────┘
           │ Mongoose                 │ External APIs
┌──────────▼──────────┐   ┌──────────▼──────────────────────┐
│   MongoDB Atlas     │   │  Google OAuth2  │  Stripe API    │
│                     │   │  Google Maps    │  Gmail SMTP    │
│  Users   Cars       │   └─────────────────────────────────┘
│  Spots   Reservations│
│  Payments  OTPs     │   ┌─────────────────────────────────┐
│  Check-ins/outs     │   │  IoT Bridge (bridge.js)         │
│  Notifications      │   │  Arduino → COM5 (9600 baud)     │
└─────────────────────┘   │  → POST /api/parking/update-status│
                          └─────────────────────────────────┘
```

### Request Lifecycle

1. Client sends request with `Authorization: Bearer <jwt>`
2. `authenticate.js` middleware verifies token signature and extracts `{ id, email, role }`
3. Route handler runs business logic, queries MongoDB via Mongoose
4. Response returned as JSON

---

## Features

### User-Facing

**Authentication**
- Email/password signup with 6-digit OTP verification (TTL: 10 minutes)
- Google OAuth2 single sign-on
- JWT issued on login; stored in `localStorage`; sent as Bearer token on every request

**Parking Discovery**
- HTML5 Geolocation feeds live coordinates to the backend
- Nearest available spot found via Euclidean distance on stored `lat/lng`
- Nearby spots discovered via bounding-box range query (±0.009° ≈ 1 km)
- Google Maps Distance Matrix calculates drive time to candidate spots
- Map auto-refreshes every 10 seconds

**Reservation**
- Select a spot + time window (start/end); frontend validates: `start > now`, `start < end`
- Backend checks for user-level and spot-level time overlaps before accepting
- Payment must be completed (Stripe Payment Intent confirmed) before reservation is persisted

**Check-in / Check-out**
- Users check in on arrival; spot status transitions `reserved → checked-in`
- Check-out transitions to `completed` and frees the spot
- IoT sensor disagreements (sensor says occupied, no user checked-in) flag a violation

**Payment**
- Stripe Payment Intents flow: client requests intent → confirms on frontend → backend records transaction
- Payment methods: credit card, debit card, PayPal, bank transfer
- Full payment history per user

**Vehicle Management**
- Store multiple vehicles (make, model, color, license plate)
- Mark a primary vehicle used by default on reservations

### Admin

- View all parking spots and live availability
- Add / remove spots with coordinate input
- Monitor all active and historical reservations
- Audit all payment transactions across users
- Dashboard auto-refreshes every 10 seconds

---

## Data Models

### User
```
name          String   required
email         String   required, unique
password      String   hashed (bcryptjs, 10 rounds)
role          Enum     "user" | "admin"  (default: "user")
provider      Enum     "local" | "google"
phoneNumber   String   10-digit, required for local auth
cars          [ObjectId → Car]
createdAt     Date
```

### ParkingSpot
```
lotNumber     String   required
spotNumber    String   required, unique
isAvailable   Boolean  default: true
reservedBy    ObjectId → User  (nullable)
occupiedBy    ObjectId → User  (nullable)
lat           Number   required
lng           Number   required
```

### Reservation
```
userId        ObjectId → User    required
spotId        ObjectId → Spot    required
startTime     Date               required
endTime       Date               required
status        Enum               "reserved" | "checked-in" | "completed" | "cancelled"
```

### Payment
```
userId          ObjectId → User         required
reservationId   ObjectId → Reservation  optional
amount          Number                  required
status          Enum                    "pending" | "completed" | "failed"
paymentMethod   Enum                    "credit_card" | "debit_card" | "paypal" | "bank_transfer"
transactionId   String                  unique
timestamp       Date
```

### OTP
```
email       String   required
otp         String   6-digit
createdAt   Date     TTL index: expires after 10 minutes
```

### Car
```
userId          ObjectId → User
carMake         String
carModel        String
carColor        String
licensePlate    String   unique, uppercased
isPrimary       Boolean
registrationDate Date
```

---

## API Reference

### Auth — `/api/auth`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/signup` | Register with email, password, phone | No |
| POST | `/verify-otp` | Verify signup OTP | No |
| POST | `/login` | Email/password login, returns JWT | No |
| POST | `/google` | Google OAuth token exchange, returns JWT | No |

### Parking — `/api/parking`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/spots` | List all parking spots | Yes |
| GET | `/nearest` | Nearest available spot by lat/lng | Yes |
| GET | `/nearby` | Spots within radius | Yes |
| POST | `/reserve` | Create reservation (payment required first) | Yes |
| POST | `/checkin` | Check in to reserved spot | Yes |
| POST | `/checkout` | Check out of spot | Yes |
| POST | `/update-status` | IoT sensor status update | Internal |
| POST | `/add-spot` | Add new spot | Admin |
| DELETE | `/delete-spot/:id` | Remove spot | Admin |

### Payment — `/api/payment`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/create-intent` | Create Stripe Payment Intent | Yes |
| POST | `/confirm` | Record confirmed payment | Yes |

### User — `/api/user`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/reservations` | Current user's reservation history | Yes |
| GET | `/payments` | Current user's payment history | Yes |

### Admin — `/api/admin`

| Method | Path | Description | Auth (Admin) |
|--------|------|-------------|------|
| GET | `/reservations` | All reservations | Yes |
| GET | `/payments` | All payment records | Yes |

### Settings — `/app/settings`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cars` | List user's vehicles | Yes |
| POST | `/cars` | Add vehicle | Yes |
| DELETE | `/cars/:id` | Remove vehicle | Yes |
| PATCH | `/cars/:id/primary` | Set primary vehicle | Yes |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A MongoDB Atlas cluster
- Google Cloud project with OAuth2 and Maps API enabled
- Stripe test account
- Gmail account with OAuth2 credentials (for OTP emails)

### 1. Clone

```bash
git clone <repo-url>
cd code-crafters
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in all values (see Environment Variables)
node server.js
# API available at http://localhost:3000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in Vite variables
npm run dev
# App available at http://localhost:5173
```

### 4. IoT Bridge (optional)

Connect the Arduino and update the COM port in `bridge.js` if needed.

```bash
cd backend
node bridge.js
```

### Frontend Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production bundle to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run lint` | Run ESLint |

---

## Environment Variables

### Backend (`backend/.env`)

```env
MONGODB_URL=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/CodeCrafters
JWT_SECRET=<your-jwt-secret>
PORT=3000

GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
REFRESH_TOKEN=<gmail-oauth2-refresh-token>
REDIRECT_URL=http://localhost:3000/auth/google/callback
GMAIL_USER=<your-gmail-address>

MAPS_API=<google-maps-server-api-key>
STRIPE_SECRET_KEY=sk_test_<your-stripe-secret>
```

### Frontend (`frontend/.env`)

```env
VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
VITE_MAPS_API=<google-maps-browser-api-key>
VITE_STRIPE_PUBLIC_KEY=pk_test_<your-stripe-publishable-key>
```

---

## IoT Integration

The `backend/bridge.js` script acts as a hardware bridge between an Arduino sensor array and the backend API.

```
Arduino (Serial, 9600 baud)
  │  "occupied" | "available"
  ▼
bridge.js (Node.js serialport)
  │  POST /api/parking/update-status
  │  { spotId, status }
  ▼
Express Route → MongoDB (isAvailable updated)
```

**Conflict resolution logic:**
- Sensor reports `occupied` but no user has checked in → reservation flagged as violated
- Sensor reports `available` but user is checked in → unused time refunded to user wallet

The COM port and baud rate are configurable constants in `bridge.js`.

---

## Known Limitations & Future Work

| Area | Current State | Improvement |
|------|--------------|-------------|
| Real-time updates | 10-second polling | Replace with WebSocket (socket.io already installed) |
| API base URL | Hardcoded `localhost:3000` in frontend | Move to `VITE_API_URL` env variable |
| CORS | Hardcoded `localhost:5173` | Drive from environment config |
| Testing | No test suite | Add Jest (unit) + Supertest (integration) |
| Deployment | Local-only | Add Dockerfile + docker-compose; CI/CD via GitHub Actions |
| IoT port | Hardcoded `COM5` | Read from environment variable |
| Rate limiting | None | Add `express-rate-limit` on auth and payment routes |
| Monitoring | None | Integrate logging (Winston/Pino) + error tracking |

---