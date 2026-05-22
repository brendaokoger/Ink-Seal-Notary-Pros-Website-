#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./push-main-and-redeploy-pages.sh <github_username> <repo_name>
# Example:
#   ./push-main-and-redeploy-pages.sh octocat Ink-Seal-Notary-Pros-Website-

GITHUB_USERNAME="${1:-}"
REPO_NAME="${2:-}"

if [[ -z "$GITHUB_USERNAME" || -z "$REPO_NAME" ]]; then
  echo "Usage: $0 <github_username> <repo_name>"
  exit 1
fi

REMOTE_URL="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

# Ensure we're in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository"
  exit 1
fi

# Show quick status
CURRENT_BRANCH="$(git branch --show-current)"
echo "Current branch: ${CURRENT_BRANCH}"
git status --short

# Configure or fix origin
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "Remote origin set to: $(git remote get-url origin)"

# Push current branch directly to remote main
git push -u origin "${CURRENT_BRANCH}:main"

# Confirm the remote main head
git fetch origin
echo "Remote main latest commit:"
git log --oneline origin/main -1

echo "Done. GitHub Pages should auto-redeploy from main if Pages source is set to main/root."
echo "Check: https://${GITHUB_USERNAME}.github.io/${REPO_NAME}/"
