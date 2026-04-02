# Smart Parking System

A full-stack IoT parking management platform built with the MERN stack and Arduino hardware integration. The system provides real-time parking spot monitoring via physical IR sensors, a booking and payment engine, Google Maps integration, OTP-based authentication, and a role-based admin dashboard — all connected through a RESTful API and a serial bridge that translates hardware sensor signals into live database updates.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Hardware Setup](#hardware-setup)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Authentication Flow](#authentication-flow)
- [Roles and Permissions](#roles-and-permissions)
- [Status](#status)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                       │
│           React 18 + Vite + Tailwind (port 5173)        │
│  Maps │ Reserve │ CheckIn/Out │ Payment │ Admin Panel   │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP / REST
┌─────────────────────▼───────────────────────────────────┐
│                      API LAYER                          │
│              Node.js + Express (port 3000)              │
│  auth │ parkingData │ reservationData │ payment │ admin │
│            settings │ Passport.js session               │
└──────┬──────────────┬────────────────────────────────────┘
       │              │
┌──────▼──────┐  ┌────▼──────────────────────────────────┐
│  MongoDB    │  │           BRIDGE LAYER                 │
│  (Mongoose) │  │    bridge.js — Arduino serial listener │
└─────────────┘  │  Reads sensor state → updates DB       │
                 └────────────────┬──────────────────────┘
                                  │ USB Serial
                 ┌────────────────▼──────────────────────┐
                 │           HARDWARE LAYER               │
                 │  Arduino Uno + IR Sensors              │
                 │  Detects vehicle presence per spot     │
                 └───────────────────────────────────────┘

External Services:
  - Google Maps JavaScript API  (Maps.jsx — live spot overlay)
  - Payment Gateway             (Payment.jsx / PaymentSuccess.jsx)
  - Nodemailer via mailSender   (OTP delivery, booking notifications)
```

The Arduino bridge (`bridge.js`) opens a serial connection to the Arduino, listens for occupancy signals, and writes the result directly to MongoDB. The frontend re-renders the map in real time without a full page refresh.

---

## Tech Stack

| Layer        | Technology                                    |
|--------------|-----------------------------------------------|
| Frontend     | React 18, Vite, React Router, Tailwind CSS    |
| Backend      | Node.js, Express.js                           |
| Database     | MongoDB, Mongoose ODM                         |
| Auth         | JWT, bcrypt, Passport.js, OTP (email-based)   |
| Hardware     | Arduino Uno, IR Sensor, SerialPort (Node.js)  |
| Maps         | Google Maps JavaScript API                    |
| Payments     | Payment gateway integration                   |
| Email        | Nodemailer (`mailSender.js`)                  |
| Dev Tools    | Nodemon, dotenv, cors                         |

---

## Features

**User-facing**
- OTP-based email verification on sign-up
- View a live Google Maps overlay of all parking spots with colour-coded availability
- Reserve a parking spot for a specific time window
- Check in and check out of a reserved spot
- Pay for reservations through an integrated payment flow with a success confirmation screen
- View full reservation and payment history
- Update account settings

**Admin**
- Admin dashboard with system-wide overview
- Manage parking spot data and availability
- Monitor real-time sensor status per spot
- Manage reservations across all users

**Hardware / IoT**
- IR sensors detect vehicle presence at the physical level
- Arduino reads sensor state and transmits over USB serial at 9600 baud
- `bridge.js` translates serial output into MongoDB writes
- Spot availability reflects physical state within seconds of a change

---

## Project Structure

```
code-crafters/
│
├── frontend/
│   ├── postcss.config.cjs
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── index.css
│       ├── main.jsx
│       ├── components/
│       │   ├── BottomWarning.jsx
│       │   ├── Button.jsx
│       │   ├── DialogBox.jsx
│       │   ├── heading.jsx
│       │   ├── InputBox.jsx
│       │   ├── Maps.jsx           # Google Maps spot overlay
│       │   ├── Navbar.jsx
│       │   ├── ProtectedRoute.jsx # Redirects unauthenticated users
│       │   ├── PublicRoute.jsx    # Redirects authenticated users
│       │   └── SubHeading.jsx
│       ├── layouts/
│       │   └── MainLayout.jsx
│       └── pages/
│           ├── AdminDashboard.jsx
│           ├── CheckInOut.jsx
│           ├── History.jsx
│           ├── Home.jsx
│           ├── Payment.jsx
│           ├── PaymentSuccess.jsx
│           ├── Reserve.jsx
│           ├── Settings.jsx
│           ├── SignIn.jsx
│           └── SignUp.jsx
│
├── backend/
│   ├── .env
│   ├── bridge.js                  # Arduino serial listener
│   ├── server.js
│   ├── config/
│   │   ├── db.js                  # MongoDB connection
│   │   └── passport.js            # Passport.js strategy config
│   ├── controllers/
│   │   ├── authControllers.js
│   │   └── otpControllers.js
│   ├── middlewares/
│   │   └── authenticate.js        # JWT verification middleware
│   ├── models/
│   │   ├── Car.js
│   │   ├── notification.js
│   │   ├── OtpModel.js
│   │   ├── parking_db.js
│   │   ├── payments.js
│   │   └── User.js
│   ├── routes/
│   │   ├── admin.js
│   │   ├── auth.js
│   │   ├── parkingData.js
│   │   ├── payment.js
│   │   ├── reservationData.js
│   │   └── settings.js
│   └── utils/
│       └── mailSender.js          # Nodemailer email helper
│
└── README.md
```

---

## API Reference

All protected routes require an `Authorization: Bearer <token>` header.

### Auth — `/api/auth`

| Method | Endpoint              | Access  | Description                         |
|--------|-----------------------|---------|-------------------------------------|
| POST   | `/register`           | Public  | Register a new user account         |
| POST   | `/send-otp`           | Public  | Send OTP to email for verification  |
| POST   | `/verify-otp`         | Public  | Verify OTP and activate account     |
| POST   | `/login`              | Public  | Login and receive JWT               |
| GET    | `/profile`            | User    | Get current user profile            |

### Parking Data — `/api/parkingData`

| Method | Endpoint        | Access  | Description                        |
|--------|-----------------|---------|------------------------------------|
| GET    | `/`             | Public  | Get all spots with current status  |
| GET    | `/:id`          | Public  | Get a single spot by ID            |
| POST   | `/`             | Admin   | Add a new parking spot             |
| PUT    | `/:id`          | Admin   | Update spot details                |
| DELETE | `/:id`          | Admin   | Remove a spot                      |
| PATCH  | `/:id/status`   | Admin   | Manually override spot status      |

### Reservation Data — `/api/reservationData`

| Method | Endpoint        | Access  | Description                        |
|--------|-----------------|---------|------------------------------------|
| POST   | `/`             | User    | Create a new reservation           |
| GET    | `/mine`         | User    | Get current user's reservations    |
| GET    | `/:id`          | User    | Get a specific reservation         |
| PUT    | `/:id/cancel`   | User    | Cancel a reservation               |
| POST   | `/:id/checkin`  | User    | Check in to a reserved spot        |
| POST   | `/:id/checkout` | User    | Check out of a spot                |
| GET    | `/all`          | Admin   | Get all reservations               |

### Payment — `/api/payment`

| Method | Endpoint            | Access  | Description                        |
|--------|---------------------|---------|------------------------------------|
| POST   | `/checkout`         | User    | Initiate payment for a reservation |
| GET    | `/:reservationId`   | User    | Get payment status                 |

### Settings — `/api/settings`

| Method | Endpoint        | Access  | Description                        |
|--------|-----------------|---------|------------------------------------|
| GET    | `/`             | User    | Get user settings                  |
| PUT    | `/`             | User    | Update user settings               |

### Admin — `/api/admin`

| Method | Endpoint        | Access  | Description                        |
|--------|-----------------|---------|------------------------------------|
| GET    | `/users`        | Admin   | Get all registered users           |
| DELETE | `/users/:id`    | Admin   | Delete a user account              |
| GET    | `/stats`        | Admin   | Get system-wide usage stats        |

---

## Database Schema

### User — `User.js`
```js
{
  name:      String,   // required
  email:     String,   // required, unique
  password:  String,   // hashed with bcrypt
  role:      String,   // "user" | "admin"  (default: "user")
  isVerified: Boolean, // set to true after OTP verification
  createdAt: Date
}
```

### OtpModel — `OtpModel.js`
```js
{
  email:     String,   // linked to user email
  otp:       String,   // hashed OTP code
  createdAt: Date,     // TTL index — expires after set duration
}
```

### ParkingSpot — `parking_db.js`
```js
{
  spotNumber:   String,   // e.g. "A1", "B3"
  location:     String,   // human-readable label
  coordinates: {
    lat: Number,
    lng: Number
  },
  status:       String,   // "available" | "occupied" | "reserved"
  sensorId:     String,   // maps to Arduino sensor ID
  pricePerHour: Number,
  updatedAt:    Date
}
```

### Car — `Car.js`
```js
{
  user:         ObjectId,  // ref: User
  licensePlate: String,    // required
  make:         String,
  model:        String,
  color:        String
}
```

### Payment — `payments.js`
```js
{
  reservation:   ObjectId,  // ref: Reservation
  user:          ObjectId,  // ref: User
  amount:        Number,
  status:        String,    // "pending" | "paid" | "refunded"
  transactionId: String,
  createdAt:     Date
}
```

### Notification — `notification.js`
```js
{
  user:      ObjectId,  // ref: User
  message:   String,
  read:      Boolean,   // default: false
  createdAt: Date
}
```

---

## Hardware Setup

### Components

- Arduino Uno
- IR sensor module (one per parking spot)
- USB cable
- Breadboard and jumper wires

### Wiring (per sensor)

```
IR Sensor VCC  →  Arduino 5V
IR Sensor GND  →  Arduino GND
IR Sensor OUT  →  Arduino Digital Pin 2
```

### Arduino Sketch

The sketch reads the sensor state, debounces the signal (50ms), and writes `occupied` or `available` to the serial port at 9600 baud.

```cpp
const int IR_SENSOR_PIN = 2;

void setup() {
  Serial.begin(9600);
  pinMode(IR_SENSOR_PIN, INPUT);
}

void loop() {
  int state = digitalRead(IR_SENSOR_PIN);
  if (state == HIGH) {
    Serial.println("occupied");
  } else {
    Serial.println("available");
  }
  delay(100);
}
```

### Uploading the Sketch

1. Open Arduino IDE
2. Go to File → Open → `arduino/parking_sensor.ino`
3. Select board: Tools → Board → Arduino Uno
4. Select port: Tools → Port → (your COM port)
5. Click Upload

### Serial Bridge

`bridge.js` opens the serial port, reads incoming lines, and writes the occupancy status to the corresponding `ParkingSpot` document in MongoDB:

```bash
node bridge.js
```

Update `ARDUINO_PORT` in your `.env` to match your system:

| OS      | Format                    |
|---------|---------------------------|
| Windows | `COM3`, `COM5`, etc.      |
| macOS   | `/dev/cu.usbmodem14201`   |
| Linux   | `/dev/ttyUSB0`            |

---

## Environment Variables

### `backend/.env`

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/smart-parking
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

ARDUINO_PORT=COM5

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=noreply@smartparking.com

PAYMENT_API_KEY=your_payment_key_here
PAYMENT_API_SECRET=your_payment_secret_here

GOOGLE_MAPS_API_KEY=your_google_maps_key_here

SESSION_SECRET=your_session_secret_here
```

### `frontend/.env`

```env
VITE_API_URL=http://localhost:3000
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key_here
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB running locally or a MongoDB Atlas URI
- Arduino IDE (only needed for hardware integration)

### 1. Clone the repository

```bash
git clone https://sc-gitlab.ufv.ca/Amrita.Sood/code-crafters.git
cd code-crafters
```

### 2. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 3. Configure environment variables

Create `.env` files in both `backend/` and `frontend/` using the templates in the [Environment Variables](#environment-variables) section above.

### 4. Start the application

```bash
# Terminal 1 — Backend API
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — Arduino bridge (only with hardware)
cd backend && node bridge.js
```

Frontend: `http://localhost:5173`
Backend API: `http://localhost:3000`

### 5. Verify the backend

```bash
curl http://localhost:3000/health
# → { "status": "ok" }

curl http://localhost:3000/api/parkingData
# → [ array of parking spot documents ]
```

---

## Authentication Flow

1. User submits email and password on `/signup`
2. `POST /api/auth/send-otp` — server generates an OTP, hashes it, stores it in `OtpModel`, and sends it to the user's email via `mailSender.js`
3. User submits the OTP on the verification screen
4. `POST /api/auth/verify-otp` — server validates the OTP, sets `isVerified: true` on the user, and returns a signed JWT
5. Client stores the JWT and attaches it as a `Bearer` token on all subsequent requests
6. `authenticate.js` middleware verifies the token signature and expiry on every protected route
7. Admin routes additionally check `user.role === "admin"`
8. Passport.js handles session-based auth where applicable

---

## Roles and Permissions

| Action                          | User | Admin |
|---------------------------------|------|-------|
| View spot availability          | ✅   | ✅    |
| Reserve a spot                  | ✅   | ✅    |
| Check in / check out            | ✅   | ✅    |
| Cancel own reservation          | ✅   | ✅    |
| View own reservation history    | ✅   | ✅    |
| Make a payment                  | ✅   | ✅    |
| Update account settings         | ✅   | ✅    |
| View all reservations           | ❌   | ✅    |
| Create / edit / delete spots    | ❌   | ✅    |
| Manually override spot status   | ❌   | ✅    |
| Manage user accounts            | ❌   | ✅    |
| View system stats               | ❌   | ✅    |

---

## Status

Active development. Not yet deployed. Live demo link will be added here once available.

---

## Author

**Amrita Sood**
Bachelor of Computer Information Systems — University of the Fraser Valley (Graduating May 2026)

[LinkedIn](https://www.linkedin.com/in/amrita-sood) · [GitLab](https://sc-gitlab.ufv.ca/Amrita.Sood)