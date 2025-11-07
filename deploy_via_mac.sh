#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════╗"
echo "║   Terralink Backend Deployment via Mac        ║"
echo "╔════════════════════════════════════════════════╗"
echo ""

# Create deployment package
cd ~/terralink-project/backend
echo "📦 Creating deployment package..."
tar -czf /tmp/terralink-backend.tar.gz .

# Use the expect-based script
cp /tmp/deploy_from_mac_expect.sh /tmp/deploy_from_mac.sh
chmod +x /tmp/deploy_from_mac.sh

# Transfer files to Mac
echo "📤 Transferring to Mac..."
sshpass -p 'aliyan' scp /tmp/terralink-backend.tar.gz Aliyan@192.168.68.208:/tmp/
sshpass -p 'aliyan' scp /tmp/deploy_from_mac.sh Aliyan@192.168.68.208:/tmp/

# Execute deployment on Mac
echo "🚀 Executing deployment from Mac..."
sshpass -p 'aliyan' ssh Aliyan@192.168.68.208 'chmod +x /tmp/deploy_from_mac.sh && /tmp/deploy_from_mac.sh'

echo ""
echo "✅ Backend deployed successfully!"
echo "Test it: curl http://192.168.68.226:3000/health"
