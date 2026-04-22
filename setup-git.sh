#!/bin/bash
# One-shot setup: configure git identity, init the repo, commit everything,
# point at GitHub, and push. Safe to re-run — idempotent.
set -e

cd "$(dirname "$0")"
echo "==> Working in: $(pwd)"

# --- Git identity (only set if missing) ---
if [ -z "$(git config --global user.name)" ]; then
  echo "==> Setting git user.name"
  git config --global user.name "Ryan Hand"
fi
if [ -z "$(git config --global user.email)" ]; then
  echo "==> Setting git user.email"
  git config --global user.email "ryan@inhabitr.ai"
fi

# --- Init + commit ---
if [ ! -d .git ]; then
  echo "==> git init"
  git init
fi

echo "==> Staging files"
git add .

if git diff --cached --quiet; then
  echo "==> Nothing new to commit"
else
  echo "==> Committing"
  git commit -m "Initial scaffold"
fi

echo "==> Ensuring branch is 'main'"
git branch -M main

# --- Remote ---
echo "==> Setting remote to GitHub"
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/ryanhandinc-furniture/furniture-builder.git

# --- Push ---
echo "==> Pushing to GitHub (a browser window may open to authorize)"
git push -u origin main

echo ""
echo "Done. Your code is at:"
echo "  https://github.com/ryanhandinc-furniture/furniture-builder"
