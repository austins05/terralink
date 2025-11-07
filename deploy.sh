#!/bin/bash

# Terralink Backend Deployment Script
# Deploys the backend to the VM at 192.168.68.226

set -e

VM_USER="user"
VM_HOST="192.168.68.226"
VM_PASSWORD="ncat2406zik!"
DEPLOY_PATH="/home/user/terralink-backend"

echo "🚀 Starting Terralink Backend Deployment..."

# Create deployment directory on VM
echo "📁 Creating deployment directory..."
sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no $VM_USER@$VM_HOST "mkdir -p $DEPLOY_PATH"

# Copy files to VM
echo "📦 Copying files to VM..."
sshpass -p "$VM_PASSWORD" scp -o StrictHostKeyChecking=no -r \
  package.json \
  src/ \
  .env.example \
  README.md \
  $VM_USER@$VM_HOST:$DEPLOY_PATH/

# Install dependencies and start service
echo "⚙️  Installing dependencies and starting service..."
sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no $VM_USER@$VM_HOST << 'ENDSSH'
cd /home/user/terralink-backend

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install dependencies
npm install

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  Please update .env with your Tabula API credentials"
fi

# Stop existing process if running
pm2 stop terralink-backend 2>/dev/null || true

# Start the service
pm2 start src/index.js --name terralink-backend
pm2 save
pm2 startup

echo "✅ Backend deployed and running!"
pm2 status
ENDSSH

echo "✅ Deployment complete!"
echo "🔗 Backend should be running at http://192.168.68.226:3000"
echo "📝 Don't forget to update the .env file on the VM with your Tabula API credentials"
