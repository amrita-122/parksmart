# Smart Parking System

A full-stack IoT parking management platform built with the MERN stack and Arduino hardware integration. The system provides real-time parking spot monitoring via physical IR sensors, a booking and payment engine, Google Maps integration, and a role-based admin dashboard — all connected through a RESTful API and a serial bridge that translates hardware sensor signals into live web events.

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
│               React + Vite (port 5173)                  │
│    Map View │ Booking UI │ Payment Flow │ Admin Panel   │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP / REST
┌─────────────────────▼───────────────────────────────────┐
│                      API LAYER                          │
│              Node.js + Express (port 3000)              │
│   Auth │ Parking │ Bookings │ Payments │ Notifications  │
└──────┬──────────────┬────────────────────────────────────┘
       │              │
┌──────▼──────┐  ┌────▼──────────────────────────────────┐
│  MongoDB    │  │           BRIDGE LAYER                 │
│  (Mongoose) │  │       bridge.js — Serial listener      │
└─────────────┘  │  Reads Arduino → Updates spot status   │
                 └────────────────┬──────────────────────┘
                                  │ USB Serial
                 ┌────────────────▼──────────────────────┐
                 │           HARDWARE LAYER               │
                 │  Arduino Uno + IR Sensors              │
                 │  Detects vehicle presence per spot     │
                 └───────────────────────────────────────┘

External Services:
  - Google Maps JavaScript API  (spot map rendering)
  - Payment Gateway             (billing and reservations)
  - Email Service (Nodemailer)  (booking confirmations, alerts)
```

The Arduino bridge (`bridge.js`) opens a serial connection to the Arduino board, listens for occupancy signals, and writes the result directly to MongoDB. The frontend polls spot status changes and re-renders the map in real time without requiring a full page refresh.

---

## Tech Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Frontend     | React 18, Vite, React Router        |
| Backend      | Node.js, Express.js                 |
| Database     | MongoDB, Mongoose ODM               |
| Auth         | JWT (JSON Web Tokens), bcrypt       |
| Hardware     | Arduino Uno, IR Sensor, SerialPort  |
| Maps         | Google Maps JavaScript API          |
| Payments     | Payment gateway integration         |
| Email        | Nodemailer (SMTP)                   |
| Dev Tools    | Nodemon, dotenv, cors               |

---

## Features

**User-facing**
- View a live Google Maps overlay of all parking spots with colour-coded availability
- Book a parking spot for a specific date and time window
- Pay for reservations through an integrated payment flow
- Receive email confirmations on booking creation, update, and cancellation
- Account dashboard showing booking history and active reservations

**Admin**
- Full CRUD control over parking spots (add, remove, edit metadata)
- View all bookings across all users with filter and search
- Monitor real-time sensor status per spot
- Manage user accounts and view system-wide usage stats

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
│   ├── public/
│   └── src/
│       ├── api/                  # Axios instances and API call helpers
│       ├── components/           # Reusable UI components
│       ├── context/              # Auth context, global state
│       ├── hooks/                # Custom React hooks
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── MapView.jsx       # Google Maps spot overlay
│       │   ├── BookingForm.jsx
│       │   ├── PaymentPage.jsx
│       │   ├── Dashboard.jsx     # User booking history
│       │   └── admin/
│       │       ├── AdminDashboard.jsx
│       │       ├── ManageSpots.jsx
│       │       └── ManageUsers.jsx
│       ├── App.jsx
│       └── main.jsx
│
├── backend/
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── parkingController.js
│   │   ├── bookingController.js
│   │   ├── paymentController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification
│   │   └── adminMiddleware.js    # Role check
│   ├── models/
│   │   ├── User.js
│   │   ├── ParkingSpot.js
│   │   └── Booking.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── parkingRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── paymentRoutes.js
│   │   └── adminRoutes.js
│   ├── utils/
│   │   ├── emailService.js       # Nodemailer helpers
│   │   └── generateToken.js
│   ├── bridge.js                 # Arduino serial listener
│   ├── seed.js                   # Demo data seeder
│   └── server.js
│
└── arduino/
    └── parking_sensor.ino        # Arduino sketch
```

---

## API Reference

All protected routes require an `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint              | Access  | Description              |
|--------|-----------------------|---------|--------------------------|
| POST   | `/api/auth/register`  | Public  | Register a new user      |
| POST   | `/api/auth/login`     | Public  | Login and receive JWT    |
| GET    | `/api/auth/profile`   | User    | Get current user profile |

### Parking Spots

| Method | Endpoint                   | Access  | Description                       |
|--------|----------------------------|---------|-----------------------------------|
| GET    | `/api/parking/all`         | Public  | Get all spots with current status |
| GET    | `/api/parking/:id`         | Public  | Get a single spot by ID           |
| POST   | `/api/parking`             | Admin   | Create a new parking spot         |
| PUT    | `/api/parking/:id`         | Admin   | Update spot details               |
| DELETE | `/api/parking/:id`         | Admin   | Remove a spot                     |
| PATCH  | `/api/parking/:id/status`  | Admin   | Manually override spot status     |

### Bookings

| Method | Endpoint                    | Access  | Description                       |
|--------|-----------------------------|---------|-----------------------------------|
| POST   | `/api/bookings`             | User    | Create a new booking              |
| GET    | `/api/bookings/mine`        | User    | Get current user's bookings       |
| GET    | `/api/bookings/:id`         | User    | Get a specific booking            |
| PUT    | `/api/bookings/:id/cancel`  | User    | Cancel a booking                  |
| GET    | `/api/bookings/all`         | Admin   | Get all bookings across all users |

### Payments

| Method | Endpoint                      | Access  | Description                        |
|--------|-------------------------------|---------|------------------------------------|
| POST   | `/api/payments/checkout`      | User    | Initiate payment for a booking     |
| GET    | `/api/payments/:bookingId`    | User    | Get payment status for a booking   |

### Admin

| Method | Endpoint              | Access  | Description                    |
|--------|-----------------------|---------|--------------------------------|
| GET    | `/api/admin/users`    | Admin   | Get all registered users       |
| DELETE | `/api/admin/users/:id`| Admin   | Delete a user account          |
| GET    | `/api/admin/stats`    | Admin   | Get system-wide usage stats    |

---

## Database Schema

### User
```js
{
  name:      String,   // required
  email:     String,   // required, unique
  password:  String,   // hashed with bcrypt
  role:      String,   // "user" | "admin"  (default: "user")
  createdAt: Date
}
```

### ParkingSpot
```js
{
  spotNumber:   String,   // e.g. "A1", "B3"
  location:     String,   // human-readable location label
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

### Booking
```js
{
  user:          ObjectId,   // ref: User
  spot:          ObjectId,   // ref: ParkingSpot
  startTime:     Date,
  endTime:       Date,
  totalPrice:    Number,
  status:        String,     // "confirmed" | "cancelled" | "completed"
  paymentStatus: String,     // "pending" | "paid" | "refunded"
  createdAt:     Date
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

Full sketch with debounce logic is in `arduino/parking_sensor.ino`.

### Uploading the Sketch

1. Open Arduino IDE
2. Go to File → Open → `arduino/parking_sensor.ino`
3. Select board: Tools → Board → Arduino Uno
4. Select port: Tools → Port → (your COM port)
5. Click Upload

### Serial Bridge

`bridge.js` opens the serial port, reads incoming lines, and updates the corresponding `ParkingSpot` document in MongoDB:

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

### Backend — `backend/.env`

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
```

### Frontend — `frontend/.env`

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

### 4. Seed the database (optional)

```bash
cd backend
npm run seed
```

This creates 10 demo parking spots and the following test accounts:

| Role  | Email              | Password  |
|-------|--------------------|-----------|
| Admin | admin@parking.com  | Admin123! |
| User  | user1@parking.com  | User123!  |

### 5. Start the application

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

### 6. Verify the backend

```bash
curl http://localhost:3000/health
# → { "status": "ok" }

curl http://localhost:3000/api/parking/all
# → [ array of parking spot documents ]
```

---

## Authentication Flow

1. User registers via `POST /api/auth/register` — password is hashed with bcrypt before storage
2. User logs in via `POST /api/auth/login` — server returns a signed JWT
3. Client stores the token and attaches it as a Bearer token on all subsequent requests
4. `authMiddleware.js` verifies the token signature and expiry on every protected route
5. `adminMiddleware.js` additionally checks `user.role === "admin"` on admin-only routes
6. Token expiry is configurable via `JWT_EXPIRES_IN` in the backend `.env`

---

## Roles and Permissions

| Action                         | User | Admin |
|--------------------------------|------|-------|
| View spot availability         | ✅   | ✅    |
| Book a spot                    | ✅   | ✅    |
| Cancel own booking             | ✅   | ✅    |
| View own bookings              | ✅   | ✅    |
| Make a payment                 | ✅   | ✅    |
| View all bookings              | ❌   | ✅    |
| Create / edit / delete spots   | ❌   | ✅    |
| Manually override spot status  | ❌   | ✅    |
| Manage user accounts           | ❌   | ✅    |
| View system stats              | ❌   | ✅    |

---

## Status

Active development. Not yet deployed. Live demo link will be added here once available.

---

## Author

**Amrita Sood**
Bachelor of Computer Information Systems — University of the Fraser Valley (Graduating May 2026)

[LinkedIn](https://www.linkedin.com/in/amrita-sood) · [GitLab](https://sc-gitlab.ufv.ca/Amrita.Sood)