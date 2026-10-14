#!/bin/bash
# Copy to ~/deploy.sh on the VPS (server.js /api/deploy webhook runs `cd ~ && ./deploy.sh`)
set -e

echo "🚀 Deploy started..."
cd ~/appzeto
git pull origin main

# FRONTEND
cd Frontend
npm install
npm run build
sudo rm -rf /var/www/appzeto/*
sudo cp -r dist/* /var/www/appzeto/

# BACKEND (API + 6 workers, defined in ecosystem.config.cjs)
cd ../Backend
npm install
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "✅ Deploy finished"
