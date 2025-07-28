#!/bin/bash

echo "🔍 Checking Patricia Voice Studio Status..."
echo "=========================================="

# Check if backend is running
echo "🖥️ Checking Backend (port 3001)..."
if curl -s http://localhost:3001/api/health > /dev/null; then
    echo "✅ Backend is running"
    echo "📡 API Health: $(curl -s http://localhost:3001/api/health | jq -r '.status // "OK"' 2>/dev/null || echo "OK")"
else
    echo "❌ Backend not responding"
fi

echo ""

# Check if frontend is running  
echo "🌐 Checking Frontend (port 3000)..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend not responding"
fi

echo ""

# Check database
echo "🗄️ Checking Database..."
if [ -f "backend/data/voice_studio.db" ]; then
    echo "✅ Database file exists"
    
    # Check if tables exist
    cd backend
    if sqlite3 data/voice_studio.db ".tables" | grep -q "users"; then
        echo "✅ Database tables initialized"
        
        # Check if admin user exists
        ADMIN_COUNT=$(sqlite3 data/voice_studio.db "SELECT COUNT(*) FROM users WHERE email='patricia@songbirdvoicestudio.com';" 2>/dev/null || echo "0")
        if [ "$ADMIN_COUNT" -gt 0 ]; then
            echo "✅ Admin user exists"
        else
            echo "⚠️ Admin user not found"
        fi
    else
        echo "❌ Database tables not initialized"
    fi
    cd ..
else
    echo "❌ Database file not found"
fi

echo ""
echo "🎯 Access Points:"
echo "Frontend: http://localhost:3000"
echo "Admin:    http://localhost:3000/admin"
echo "API:      http://localhost:3001/api/health"
echo ""
echo "👤 Admin Login:"
echo "Email:    patricia@songbirdvoicestudio.com"
echo "Password: admin123"