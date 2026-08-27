#!/bin/bash
# ─── GeraldOS Render Deployment Setup ───
# Run this script locally, then paste the output into Render's Environment tab.
#
# Prerequisites:
#   1. A free Neon database: https://console.neon.tech (Sign up → Create project)
#   2. A free Upstash Redis: https://console.upstash.com (Sign up → Create database)
#      (Optional — app works without Redis, just no real-time event streaming)

set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  GeraldOS — Render Environment Variables Setup             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── AUTH_SECRET ──
AUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
echo "✓ Generated AUTH_SECRET"

# ── DATABASE_URL ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Create a free PostgreSQL database"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Option A — Neon (recommended, free tier):"
echo "    1. Go to https://console.neon.tech"
echo "    2. Sign up / Sign in"
echo "    3. Create a new project (any name, e.g. 'geraldos-prod')"
echo "    4. Copy the connection string (looks like:"
echo "       postgresql://neondb_owner:xxxx@ep-xxx.us-east-2.aws.neon.tech/geraldos?sslmode=require)"
echo ""
echo "  Option B — Render PostgreSQL (90-day free trial):"
echo "    1. Render Dashboard → New → PostgreSQL"
echo "    2. Copy the Internal Database URL"
echo ""
read -p "  Paste your DATABASE_URL here: " DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
  echo "  ✗ DATABASE_URL is required. Aborting."
  exit 1
fi
echo "✓ DATABASE_URL set"

# ── REDIS_URL (optional) ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Create a free Redis database (OPTIONAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Option A — Upstash (recommended, free tier):"
echo "    1. Go to https://console.upstash.com"
echo "    2. Sign up → Create Database → Select Redis"
echo "    3. Copy the REDIS_URL (looks like:"
echo "       rediss://xxxxx@us1-xxxx.upstash.io:6379)"
echo ""
echo "  Press Enter to skip Redis (app will work without it):"
read -p "  Paste your REDIS_URL here (or press Enter to skip): " REDIS_URL

if [ -n "$REDIS_URL" ]; then
  echo "✓ REDIS_URL set"
else
  REDIS_URL=""
  echo "○ Redis skipped (app will function without real-time events)"
fi

# ── Output ──
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Copy the values below into Render → Environment           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│ Render Environment Variables (Key → Value):                 │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│ DATABASE_URL  → $DATABASE_URL"
echo "│ AUTH_SECRET   → $AUTH_SECRET"
if [ -n "$REDIS_URL" ]; then
echo "│ REDIS_URL     → $REDIS_URL"
fi
echo "└──────────────────────────────────────────────────────────────┘"
echo ""
echo "How to add them in Render:"
echo "  1. Go to https://dashboard.render.com"
echo "  2. Select your 'geraldos-radiology' service"
echo "  3. Go to 'Environment' tab"
echo "  4. Add each variable above (Key + Value)"
echo "  5. Click 'Save Changes' — Render will auto-redeploy"
echo ""
echo "After adding env vars, the app will:"
echo "  ✓ Connect to PostgreSQL and run migrations"
echo "  ✓ Start the event relay (if REDIS_URL is set)"
echo "  ✓ Serve the full GeraldOS platform at your Render URL"
