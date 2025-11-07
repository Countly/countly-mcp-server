#!/bin/bash

# Countly MCP Server - Quick Start Script
# This script helps you set up and run the Countly MCP Server with Docker

set -e

echo "🚀 Countly MCP Server - Quick Start"
echo "===================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo "❌ Error: Docker Compose is not installed"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  Please edit .env and set your COUNTLY_SERVER_URL"
    echo "   Example: COUNTLY_SERVER_URL=https://your-countly-instance.com"
    echo ""
fi

# Check if token file exists
if [ ! -f countly_token.txt ]; then
    echo "🔑 Token file not found"
    echo ""
    read -p "Enter your Countly auth token: " TOKEN
    echo "$TOKEN" > countly_token.txt
    chmod 600 countly_token.txt
    echo "✅ Token file created: countly_token.txt"
    echo ""
fi

# Ask user what to do
echo "What would you like to do?"
echo "1) Build and start the server"
echo "2) Start the server (using existing image)"
echo "3) Stop the server"
echo "4) View logs"
echo "5) Rebuild the server"
echo ""
read -p "Enter your choice (1-5): " CHOICE

case $CHOICE in
    1)
        echo ""
        echo "🔨 Building and starting Countly MCP Server..."
        $DOCKER_COMPOSE up -d --build
        echo ""
        echo "✅ Server is running!"
        echo "   Health check: http://localhost:3000/health"
        echo "   MCP endpoint: http://localhost:3000/mcp"
        echo ""
        echo "View logs with: $DOCKER_COMPOSE logs -f"
        ;;
    2)
        echo ""
        echo "▶️  Starting Countly MCP Server..."
        $DOCKER_COMPOSE up -d
        echo ""
        echo "✅ Server is running!"
        echo "   Health check: http://localhost:3000/health"
        echo "   MCP endpoint: http://localhost:3000/mcp"
        ;;
    3)
        echo ""
        echo "⏹️  Stopping Countly MCP Server..."
        $DOCKER_COMPOSE down
        echo "✅ Server stopped"
        ;;
    4)
        echo ""
        echo "📋 Server logs (Ctrl+C to exit):"
        echo ""
        $DOCKER_COMPOSE logs -f
        ;;
    5)
        echo ""
        echo "🔨 Rebuilding Countly MCP Server..."
        $DOCKER_COMPOSE down
        $DOCKER_COMPOSE build --no-cache
        $DOCKER_COMPOSE up -d
        echo ""
        echo "✅ Server rebuilt and running!"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac
