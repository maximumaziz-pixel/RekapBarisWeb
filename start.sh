#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Edit its credentials and DATABASE_URL, then rerun ./start.sh."
  exit 1
fi

npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
npm prune --omit=dev
exec npm start
