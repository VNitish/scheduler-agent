#!/bin/bash

echo "🚀 Setting up Smart Scheduler AI Agent..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version 18+ required. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"
echo ""

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# 2. Set up environment variables
if [ ! -f .env.local ]; then
    echo "⚙️  Creating .env.local file..."
    cp .env.example .env.local
    echo -e "${YELLOW}⚠️  Please fill in your environment variables in .env.local${NC}"
    echo ""
else
    echo -e "${GREEN}✓ .env.local already exists${NC}"
    echo ""
fi

# 3. Set up database
echo "🗄️  Setting up database..."
cd packages/database

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL=" ../../.env.local || grep -q 'DATABASE_URL=""' ../../.env.local; then
    echo -e "${YELLOW}⚠️  DATABASE_URL not set in .env.local${NC}"
    echo "   Please add your Supabase connection string to .env.local"
    echo "   Then run: npm run db:push"
else
    echo "   Generating Drizzle migrations..."
    npm run db:generate

    echo "   Pushing schema to database..."
    npm run db:push

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database schema pushed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to push database schema${NC}"
        echo "   Make sure your DATABASE_URL is correct in .env.local"
    fi
fi

cd ../..
echo ""

# 4. Build packages
echo "🔨 Building packages..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to build packages${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Packages built successfully${NC}"
echo ""

# Success message
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "  1. Fill in all required environment variables in .env.local"
echo "     - NEXT_PUBLIC_GOOGLE_CLIENT_ID"
echo "     - GOOGLE_CLIENT_SECRET"
echo "     - DATABASE_URL (Supabase)"
echo "     - NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD"
echo "     - OPENAI_API_KEY or ANTHROPIC_API_KEY"
echo "     - (Optional) ELEVENLABS_API_KEY, TWILIO credentials"
echo ""
echo "  2. If you haven't pushed the database schema, run:"
echo "     cd packages/database && npm run db:push"
echo ""
echo "  3. Start the development server:"
echo "     npm run dev"
echo ""
echo "  4. Open your browser at:"
echo "     http://localhost:3000"
echo ""
echo "📚 For more information, see README.md"
