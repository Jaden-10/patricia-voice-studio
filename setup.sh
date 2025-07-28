#!/bin/bash

echo "🎵 Setting up Patricia Voice Studio Application..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "⚠️  Node.js version $NODE_VERSION detected. Recommended: 18.0.0+"
fi

echo "✅ Node.js version: $NODE_VERSION"
echo ""

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install

# Set up database
echo "🗄️  Setting up database..."
npm run seed

cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install --legacy-peer-deps

cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "🚀 To start the application:"
echo "  Backend:  cd backend && npm run dev"
echo "  Frontend: cd frontend && npm start"
echo "  Full app: npm run dev (from root)"
echo ""
echo "🔐 Default accounts:"
echo "  Admin:    patricia@songbirdvoicestudio.com / admin123"
echo "  Client:   demo@example.com / demo123"
echo ""
echo "📚 Check backend/README.md for API documentation"
echo "🌐 Backend will run on: http://localhost:5000"
echo "🎨 Frontend will run on: http://localhost:3000"
echo ""
echo "⚠️  Remember to change default passwords in production!"