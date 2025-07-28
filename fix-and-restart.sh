#!/bin/bash

echo "🔧 Fixing Issues and Restarting..."

# Kill any processes on ports 3000 and 3001
echo "Freeing up ports..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "Port 3000 is free"
lsof -ti:3001 | xargs kill -9 2>/dev/null || echo "Port 3001 is free"

# Wait a moment
sleep 2

echo "✅ Fixes applied!"
echo "🚀 Starting servers..."

# Start the application
npm run dev