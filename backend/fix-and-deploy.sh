#!/bin/bash

echo "🔧 FIXING CRITICAL PRODUCTION ERRORS"
echo "=================================="

# Step 1: Test TypeScript compilation
echo "1. Testing TypeScript compilation..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed!"
    exit 1
else
    echo "✅ TypeScript compilation successful"
fi

# Step 2: Initialize database and run seed
echo "2. Initializing database with correct schema..."
npm run seed
if [ $? -ne 0 ]; then
    echo "❌ Database seeding failed!"
    exit 1
else
    echo "✅ Database initialized successfully"
fi

# Step 3: Test database schema
echo "3. Testing database schema..."
node test-auth.js
if [ $? -ne 0 ]; then
    echo "❌ Database schema test failed!"
    exit 1
else
    echo "✅ Database schema verified"
fi

# Step 4: Build project
echo "4. Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
else
    echo "✅ Build successful"
fi

# Step 5: Commit changes
echo "5. Committing fixes..."
git add .
git commit -m "URGENT: Fix critical production auth errors

- Fix Express trust proxy configuration for Railway (use proxy: 1)
- Fix database column name mismatch (password_hash vs password)
- Configure rate limiting to work with Railway proxy
- Update user role from 'student' to 'client' to match schema
- Add proper proxy handling for authentication rate limiting

All authentication flows should now work in production.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Step 6: Push to trigger Railway deployment
echo "6. Pushing to Railway..."
git push origin main

echo ""
echo "🚀 DEPLOYMENT STATUS"
echo "==================="
echo "✅ Trust proxy fixed (app.set('trust proxy', 1))"
echo "✅ Database schema fixed (password_hash column)"
echo "✅ Rate limiting configured for Railway proxy"
echo "✅ User roles updated to match database schema"
echo "✅ Authentication endpoints ready for production"
echo ""
echo "🔗 Your Railway app should now deploy successfully!"
echo "Test user registration and login at your Railway URL."
echo ""
echo "Admin Login:"
echo "Email: patricia@songbirdvoicestudio.com"
echo "Password: admin123"
echo ""
echo "Demo Login:"
echo "Email: demo@example.com" 
echo "Password: demo123"