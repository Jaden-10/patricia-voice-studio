# API Documentation - Patricia Voice Studio

## Base URL
- Development: `http://localhost:5000/api`
- Production: `https://your-domain.com/api`

## Authentication
Most endpoints require JWT token in Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Response Format
All responses follow this structure:
```json
{
  "success": boolean,
  "data": object | array | null,
  "message": string
}
```

## Error Codes
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Authentication Endpoints

### POST /auth/register
Register new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully. Please check your email to verify your account.",
  "data": { "userId": 123 }
}
```

### POST /auth/login
User login.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "client",
      "is_verified": true
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### POST /auth/verify-email
Verify email address.

**Request Body:**
```json
{
  "token": "verification_token_from_email"
}
```

### POST /auth/forgot-password
Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

### POST /auth/reset-password
Reset password with token.

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "password": "newpassword123"
}
```

### GET /auth/me
Get current user info. **Requires Authentication**

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "client"
    }
  }
}
```

---

## Booking Endpoints

### GET /bookings
Get user's bookings. **Requires Authentication**

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "lesson_date": "2024-01-15T14:00:00.000Z",
      "duration": 60,
      "price": 85.00,
      "status": "confirmed",
      "notes": "Focus on breathing techniques"
    }
  ]
}
```

### POST /bookings
Create new booking. **Requires Authentication**

**Request Body:**
```json
{
  "lesson_date": "2024-01-15T14:00:00.000Z",
  "duration": 60,
  "notes": "First lesson"
}
```

### PUT /bookings/:id
Reschedule booking. **Requires Authentication**

**Request Body:**
```json
{
  "lesson_date": "2024-01-16T15:00:00.000Z",
  "notes": "Rescheduled due to conflict"
}
```

### DELETE /bookings/:id
Cancel booking. **Requires Authentication**

### GET /bookings/availability/:date
Check availability for specific date.

**Example:** `/bookings/availability/2024-01-15`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "time": "2024-01-15T09:00:00.000Z",
      "available": true
    },
    {
      "time": "2024-01-15T10:00:00.000Z",
      "available": false
    }
  ]
}
```

---

## Payment Endpoints

### POST /payments/venmo-link
Generate Venmo payment link. **Requires Authentication**

**Request Body:**
```json
{
  "booking_id": 123
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": 456,
    "venmoLink": "https://venmo.com/patricia-freund?txn=pay&amount=85.00&note=Voice%20lesson%2060min%20-%201/15/2024",
    "amount": 85.00,
    "note": "Voice lesson 60min - 1/15/2024"
  }
}
```

### POST /payments/zelle-info
Generate Zelle payment info. **Requires Authentication**

**Request Body:**
```json
{
  "booking_id": 123
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": 456,
    "zelleEmail": "patricia@songbirdvoicestudio.com",
    "amount": 85.00,
    "reference": "LESSON-123-1699123456789",
    "instructions": "Please send payment via Zelle using the email above and include the reference number in the memo."
  }
}
```

### GET /payments
Get user's payments. **Requires Authentication**

### GET /payments/:id
Get payment details. **Requires Authentication**

---

## Admin Endpoints
All admin endpoints require admin role.

### GET /admin/bookings
Get all bookings.

**Query Parameters:**
- `startDate` - Filter from date (YYYY-MM-DD)
- `endDate` - Filter to date (YYYY-MM-DD)

### GET /admin/clients
Get all clients with booking statistics.

### GET /admin/clients/:id
Get client details with full booking/payment history.

### PUT /admin/bookings/:id/status
Update booking status.

**Request Body:**
```json
{
  "status": "confirmed"
}
```

**Valid statuses:** `pending`, `confirmed`, `completed`, `cancelled`, `rescheduled`

### POST /admin/availability
Set availability.

**Request Body:**
```json
{
  "date": "2024-01-15",
  "start_time": "09:00",
  "end_time": "17:00",
  "is_available": true,
  "reason": "Normal business hours"
}
```

### GET /admin/dashboard
Get dashboard statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalClients": 25,
    "totalBookings": 150,
    "pendingBookings": 5,
    "thisMonthRevenue": 1200.00,
    "upcomingLessons": [...]
  }
}
```

### PUT /admin/settings/:key
Update business setting.

**Request Body:**
```json
{
  "value": "new_value"
}
```

---

## Notification Endpoints

### POST /notifications/sms
Send SMS notification. **Admin Only**

**Request Body:**
```json
{
  "phone": "+1234567890",
  "message": "Your lesson reminder...",
  "booking_id": 123
}
```

### POST /notifications/reminders
Send reminder notifications. **Admin Only**

**Request Body:**
```json
{
  "hours": 24
}
```

**Valid hours:** `24` or `2`

### POST /notifications/schedule-reminders
Schedule automatic reminders for upcoming lessons. **Admin Only**

### GET /notifications/history
Get notification history. **Admin Only**

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

---

## User Management Endpoints

### GET /users/profile
Get user profile. **Requires Authentication**

### PUT /users/profile
Update user profile. **Requires Authentication**

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890"
}
```

### PUT /users/password
Change password. **Requires Authentication**

**Request Body:**
```json
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass123"
}
```

### GET /users/notifications
Get user notifications. **Requires Authentication**

### PUT /users/notifications/:id/read
Mark notification as read. **Requires Authentication**

### GET /users/messages
Get user messages. **Requires Authentication**

### POST /users/messages
Send message to admin. **Requires Authentication**

**Request Body:**
```json
{
  "subject": "Question about lesson",
  "message": "I have a question...",
  "message_type": "general"
}
```

---

## Business Rules

### Booking Rules
- Lessons available: 45 minutes ($70) or 60 minutes ($85)
- Minimum booking advance: 24 hours
- Reschedule limitation: Same month only
- Maximum reschedules: 2 per month per user

### Business Hours
- Default: 9:00 AM - 6:00 PM
- Configurable via admin settings
- Admin can block specific dates/times

### Payment Process
1. Client books lesson (status: `pending`)
2. Client gets payment link (Venmo/Zelle)
3. Admin confirms payment (status: `confirmed`)
4. Automatic reminders sent (24h, 2h before)
5. After lesson (status: `completed`)

### Notification System
- 24-hour reminder (email + SMS)
- 2-hour reminder (email + SMS)
- Booking confirmations
- Rescheduling notifications
- Payment reminders

---

## Rate Limiting
- 100 requests per 15 minutes per IP
- Authentication endpoints: stricter limits
- Admin endpoints: higher limits for legitimate use

## CORS Policy
- Development: `http://localhost:3000`
- Production: Configured domain only
- Credentials included for authentication

## Security Headers
- Helmet.js security headers
- CORS protection
- Rate limiting
- Input validation
- SQL injection prevention
- XSS protection