#!/usr/bin/env bash
# Idempotent bootstrap for the PhaseFit Cloud Agent environment.
set -euo pipefail

# Run from the repository root regardless of where the script is invoked.
cd "$(dirname "$0")/.."

# Refresh dependencies from the committed lockfile.
npm ci

# PhaseFit instantiates its Supabase and OpenAI clients at module load, so
# `next dev` / `next build` require these variables to be *defined* to boot.
# Real values injected as Cloud Agent secrets take precedence (Next.js reads
# them from the process environment). When a variable is absent we fall back to
# a non-secret placeholder written to .env.local so the frontend and API route
# guards still run. Note: *.supabase.co is not reachable from this VM (see
# AGENTS.md), so live backend calls are expected to fail regardless of value.
: > .env.local
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  echo "NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co" >> .env.local
fi
if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key" >> .env.local
fi
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key" >> .env.local
fi
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY=placeholder-openai-key" >> .env.local
fi

echo "install.sh complete."
