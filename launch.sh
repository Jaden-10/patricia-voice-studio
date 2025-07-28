#!/bin/bash

# Patricia Voice Studio - Quick Launch Script
echo "🎵 Patricia Voice Studio - Quick Launch 🎵"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📦 Installing dependencies..."

# Install root dependencies
echo "Installing root dependencies..."
npm install

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install node-cron @types/node-cron googleapis

# Install frontend dependencies  
echo "Installing frontend dependencies..."
cd ../frontend
npm install --legacy-peer-deps

# Return to root
cd ..

echo "⚙️ Setting up environment..."

# Copy environment template if .env doesn't exist
if [ ! -f "backend/.env" ]; then
    cp backend/.env.template backend/.env
    echo "📝 Created backend/.env from template. Please update with your credentials."
else
    echo "✅ backend/.env already exists"
fi

echo "🗄️ Setting up database..."

# Setup database
cd backend
npm run seed
cd ..

echo "✅ Setup complete!"
echo ""
echo "🚀 Ready to launch!"
echo ""
echo "To start the application:"
echo "  Option 1 (Both servers): npm run dev"
echo "  Option 2 (Separate):"
echo "    Terminal 1: cd backend && npm run dev"
echo "    Terminal 2: cd frontend && npm start"
echo ""
echo "🌐 Access URLs:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001/api/health"
echo "  Admin:    http://localhost:3000/admin"
echo ""
echo "👤 Admin Login:"
echo "  Email:    patricia@songbirdvoicestudio.com"
echo "  Password: admin123"
echo ""
echo "📖 See LAUNCH_GUIDE.md for detailed instructions"