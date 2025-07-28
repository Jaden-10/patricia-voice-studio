# 🚀 QUICK START - Patricia Voice Studio

## 1. Run the Launch Script

```bash
# Navigate to project directory
cd /Users/jadenhancock/patricia-voice-studio

# Run the launch script
chmod +x launch.sh
./launch.sh
```

## 2. Start the Application

```bash
# Start both servers at once
npm run dev
```

## 3. Access the Website

- **Website**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin

## 4. Login as Patricia

- **Email**: patricia@songbirdvoicestudio.com
- **Password**: admin123

---

## 🎯 What You'll See

### ✅ **Fixed Issues:**
- No more 404 errors on About/Services pages
- Bird logo in header
- Sign-in moved to top right corner
- Updated contact information everywhere

### ✅ **New Pricing:**
- 30 minutes: $60
- 45 minutes: $80
- 60 minutes: $95
- Audition Coaching: Custom

### ✅ **New Features:**
- Academic year booking (Sept 2025 - June 2026)
- Monthly billing system
- Recurring lesson schedules
- Make-up lesson management
- Business policy enforcement
- SMS notifications (when configured)
- Google Calendar sync (when configured)

---

## 🔧 If Something Goes Wrong

1. **Delete node_modules and reinstall:**
```bash
rm -rf backend/node_modules frontend/node_modules
./launch.sh
```

2. **Reset database:**
```bash
cd backend
rm -f data/voice_studio.db
npm run seed
cd ..
```

3. **Kill conflicting processes:**
```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

---

## 🌐 Ready for Production?

See `LAUNCH_GUIDE.md` for complete deployment instructions to Vercel, Netlify, Railway, or other hosting platforms.

**Your voice studio website is ready to launch! 🎵**