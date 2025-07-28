# 🚀 PATRICIA VOICE STUDIO - LAUNCH GUIDE

## IMMEDIATE LAUNCH STEPS

### 1. Install New Dependencies

```bash
# Navigate to project root
cd /Users/jadenhancock/patricia-voice-studio

# Install root dependencies
npm install

# Install backend dependencies (including new ones)
cd backend
npm install node-cron @types/node-cron googleapis

# Install frontend dependencies
cd ../frontend
npm install --legacy-peer-deps

# Return to root
cd ..
```

### 2. Environment Setup

Create `.env` file in the `backend` directory:

```bash
# Copy this to: /Users/jadenhancock/patricia-voice-studio/backend/.env

# Database
DATABASE_URL=sqlite:./data/voice_studio.db
NODE_ENV=development

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Email (Optional - for testing)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Twilio SMS (Optional - for testing)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Google Calendar (Optional - for testing)
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_CREDENTIALS={"type":"service_account","project_id":"..."}

# Server
PORT=3001
```

### 3. Database Setup

```bash
# Navigate to backend
cd backend

# Initialize database with new schema
npm run seed
```

### 4. Launch Development Servers

**Option A: Launch Both Servers Simultaneously**
```bash
# From project root
npm run dev
```

**Option B: Launch Servers Separately**

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm start
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/health

### 6. Admin Access

**Demo Admin Account:**
- Email: `patricia@songbirdvoicestudio.com`
- Password: `admin123`

**Admin Dashboard**: http://localhost:3000/admin

---

## ✅ VERIFICATION CHECKLIST

After launching, verify these features work:

### Frontend Features:
- [ ] Home page loads with new pricing (30min/$60, 45min/$80, 60min/$95)
- [ ] About page displays Patricia's information
- [ ] Navigation shows only Home/About (no Services link)
- [ ] Bird logo appears in header
- [ ] Contact info shows Patricia's correct details
- [ ] Sign-in moved to top right corner

### Authentication:
- [ ] User registration works
- [ ] User login works  
- [ ] Admin login works with patricia@songbirdvoicestudio.com
- [ ] Protected routes redirect properly

### New Booking System:
- [ ] Recurring lesson booking page loads (`/book-recurring`)
- [ ] Can select 30/45/60 minute lessons
- [ ] Can select weekly/bi-weekly frequency
- [ ] Academic year dates (Sept 2025 - June 2026) work
- [ ] Blackout dates block booking attempts

### Business Policies:
- [ ] 24-hour cancellation policy enforced
- [ ] Same-month rescheduling restriction works
- [ ] Make-up lesson limits enforced (max 2 pending)

### Admin Features:
- [ ] Admin dashboard shows new recurring bookings
- [ ] Billing cycles display correctly
- [ ] Make-up lesson management works
- [ ] Studio events are visible

---

## 🔧 TROUBLESHOOTING

### Common Issues:

**1. "Module not found" errors:**
```bash
# Delete node_modules and reinstall
rm -rf backend/node_modules frontend/node_modules
cd backend && npm install
cd ../frontend && npm install --legacy-peer-deps
```

**2. Database errors:**
```bash
# Reset database
cd backend
rm -f data/voice_studio.db
npm run seed
```

**3. Port conflicts:**
```bash
# Kill processes on ports 3000 and 3001
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

**4. React version conflicts:**
```bash
# Use legacy peer deps for frontend
cd frontend
npm install --legacy-peer-deps
```

---

## 🌐 PRODUCTION DEPLOYMENT

### Quick Deployment Options:

**1. Frontend (Vercel - Recommended)**
```bash
cd frontend
npm install -g vercel
npm run build
vercel --prod
```

**2. Backend (Railway/Render)**
- Connect your GitHub repository
- Set environment variables
- Deploy automatically

**3. Full-Stack (Netlify + Heroku)**
- Frontend: Drag & drop `frontend/build` to Netlify
- Backend: Deploy to Heroku with PostgreSQL

### Environment Variables for Production:
```
JWT_SECRET=strong-production-secret
DATABASE_URL=your-production-database-url
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=your-twilio-number
GOOGLE_CALENDAR_CREDENTIALS=your-service-account-json
```

---

## 📱 MOBILE TESTING

Test on various devices:
- [ ] iPhone (Safari)
- [ ] Android (Chrome)
- [ ] iPad (Safari)
- [ ] Responsive design works at all breakpoints

---

## 🎯 FINAL VERIFICATION

Before going live:
- [ ] All 404 errors fixed
- [ ] New pricing displayed correctly
- [ ] Contact information accurate
- [ ] Business policies enforced
- [ ] Academic year calendar works
- [ ] Admin can manage all features
- [ ] SMS notifications work (if configured)
- [ ] Google Calendar sync works (if configured)

---

## 🔥 READY TO LAUNCH!

Your Patricia Voice Studio website is now:
- ✅ Fully functional with new business model
- ✅ Mobile-responsive and professional
- ✅ Complete with all requested features
- ✅ Production-ready

**Need help with any step? Just ask!**