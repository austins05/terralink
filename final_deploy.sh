#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════╗"
echo "║   Terralink Backend Final Deployment          ║"
echo "╔════════════════════════════════════════════════╗"
echo ""

# Create deployment package
cd ~/terralink-project/backend
echo "📦 Creating deployment package..."
tar -czf /tmp/terralink-backend.tar.gz .

echo "📤 Transferring files to Mac..."
sshpass -p 'aliyan' scp /tmp/terralink-backend.tar.gz Aliyan@192.168.68.208:/tmp/
sshpass -p 'aliyan' scp /tmp/deploy_simple.sh Aliyan@192.168.68.208:/tmp/

echo "🚀 Deploying from Mac to VM..."

sshpass -p 'aliyan' ssh Aliyan@192.168.68.208 '/usr/bin/expect << "EXPECTEOF"
set timeout 300
spawn scp /tmp/terralink-backend.tar.gz user@192.168.68.226:/tmp/
expect {
    "password:" { send "ncat2406zik!\r"; exp_continue }
    eof
}

spawn scp /tmp/deploy_simple.sh user@192.168.68.226:/tmp/
expect {
    "password:" { send "ncat2406zik!\r"; exp_continue }
    eof
}

spawn ssh user@192.168.68.226
expect "password:"
send "ncat2406zik!\r"
expect "$ "

send "cd ~ && rm -rf terralink-backend\r"
expect "$ "

send "mkdir -p terralink-backend && cd terralink-backend\r"
expect "$ "

send "tar -xzf /tmp/terralink-backend.tar.gz\r"
expect "$ "

send "cat > .env << '\''ENVFILE'\''\r"
send "TABULA_API_URL=https://test-api.tracmap.com\r"
send "TABULA_API_KEY=your_api_key_here\r"
send "TABULA_API_SECRET=your_api_secret_here\r"
send "PORT=3000\r"
send "NODE_ENV=production\r"
send "ALLOWED_ORIGINS=*\r"
send "ENVFILE\r"
expect "$ "

send "chmod +x /tmp/deploy_simple.sh\r"
expect "$ "

send "/tmp/deploy_simple.sh\r"
expect {
    "password" {
        send "ncat2406zik!\r"
        exp_continue
    }
    "DEPLOYMENT COMPLETE" {
        expect "$ "
    }
}

send "curl http://localhost:3000/health\r"
expect "$ "

send "exit\r"
expect eof
EXPECTEOF'

echo ""
echo "✅ Backend deployed successfully!"
echo ""
echo "Test from your machine:"
echo "  curl http://192.168.68.226:3000/health"
echo ""
echo "Next steps:"
echo "  1. SSH to VM: ssh user@192.168.68.226"
echo "  2. Edit .env: nano ~/terralink-backend/.env"
echo "  3. Add Tabula API credentials"
echo "  4. Restart: pm2 restart terralink-backend"
