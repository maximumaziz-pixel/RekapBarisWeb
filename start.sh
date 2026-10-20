#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Set the credentials and DATABASE_URL, then rerun ./start.sh."
  else
    echo "Missing .env. Create it from the setup instructions in README.md, then rerun ./start.sh."
  fi
  exit 1
fi

npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
npm prune --omit=dev
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.js --update-env
  exit 0
fi
exec npm start
