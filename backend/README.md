# Patricia Voice Studio - Backend API

## Overview
Node.js/Express backend API for Patricia Freund's Songbird Voice Studio booking system.

## Features
- **Authentication**: JWT-based auth with email verification
- **Booking System**: Complete lesson scheduling with conflict prevention
- **Payment Integration**: Venmo/Zelle payment link generation
- **Admin Panel**: Full management interface for Patricia
- **Notifications**: SMS/Email reminders via Twilio
- **Business Rules**: Month-based rescheduling, pricing tiers

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Initialize Database
```bash
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Password reset
- `GET /api/auth/me` - Get current user

### Bookings
- `GET /api/bookings` - Get user bookings
- `POST /api/bookings` - Create booking
- `PUT /api/bookings/:id` - Reschedule booking
- `DELETE /api/bookings/:id` - Cancel booking
- `GET /api/bookings/availability/:date` - Check availability

### Payments
- `POST /api/payments/venmo-link` - Generate Venmo payment link
- `POST /api/payments/zelle-info` - Generate Zelle payment info
- `GET /api/payments` - Get user payments
- `GET /api/payments/:id` - Get payment details

### Admin (Patricia Only)
- `GET /api/admin/bookings` - All bookings
- `GET /api/admin/clients` - All clients
- `PUT /api/admin/bookings/:id/status` - Update booking status
- `POST /api/admin/availability` - Set availability
- `GET /api/admin/dashboard` - Dashboard statistics

### Notifications
- `POST /api/notifications/sms` - Send SMS (admin)
- `POST /api/notifications/reminders` - Send reminders (admin)

## Database Schema

### Users
- Client and admin user accounts
- Email verification system
- Password reset functionality

### Bookings
- Lesson scheduling with duration/pricing
- Status tracking (pending, confirmed, completed, cancelled)
- Reschedule history and limits

### Payments
- Payment method tracking (Venmo/Zelle)
- Status monitoring
- Reference number generation

### Notifications
- SMS/Email notification history
- Scheduled reminder system
- Type-based categorization

## Business Logic

### Booking Rules
- Lessons: 45min ($70) or 60min ($85)
- Minimum 24h advance booking
- Reschedule only within same month
- Maximum 2 reschedules per month

### Payment Flow
1. Book lesson → Pending status
2. Generate payment link (Venmo/Zelle)
3. Admin confirms payment → Confirmed status
4. Auto-reminders sent (24h, 2h before)

### Availability
- Business hours: 9 AM - 6 PM (configurable)
- Admin can block dates/times
- Automatic conflict prevention

## Default Accounts

After running `npm run seed`:

**Admin (Patricia)**
- Email: patricia@songbirdvoicestudio.com
- Password: admin123

**Demo Client**
- Email: demo@example.com  
- Password: demo123

⚠️ **Change default passwords in production!**

## Environment Variables

Required for production:
- `JWT_SECRET` - Strong secret key
- `DATABASE_URL` - SQLite/PostgreSQL URL
- `TWILIO_*` - SMS credentials
- `EMAIL_*` - Email service config

## Development

### Scripts
- `npm run dev` - Development server with auto-reload
- `npm run build` - TypeScript compilation
- `npm run start` - Production server
- `npm run seed` - Database setup with sample data

### Testing
```bash
# Health check
curl http://localhost:5000/api/health

# Login test
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo123"}'
```

## Deployment

### Environment Setup
1. Set all environment variables
2. Use PostgreSQL for production database
3. Configure email/SMS services
4. Set up SSL certificates

### Database Migration
For production PostgreSQL:
1. Update `DATABASE_URL` to PostgreSQL connection
2. Run migrations: `npm run seed`
3. Verify admin account creation

## Security Features
- Helmet.js security headers
- Rate limiting (100 req/15min)
- CORS protection
- JWT token expiration
- Password hashing (bcrypt)
- Input validation
- SQL injection prevention

## Monitoring
- Request logging
- Error tracking
- Health check endpoint
- Database connection monitoring

## Support
For issues or questions about the backend API, check the logs and ensure all environment variables are properly configured.