#!/bin/bash
# Publish this project to a GitHub account.
#
#   ./publish.sh                         push to the configured origin
#   ./publish.sh EemonWorks my-repo      push to a specific account/repo
#
# Create the repository on GitHub first and leave it EMPTY - do not let GitHub add a
# README, .gitignore or licence, because that creates a commit this history cannot
# fast-forward onto.
#
# Authenticate with a personal access token (classic, "repo" scope) generated on the
# account you are pushing to: https://github.com/settings/tokens
#
# If you run this from a terminal inside the GitHub Copilot app, that app injects
# credentials for a different account (GH_TOKEN, a "copilot" git credential helper,
# credential.interactive=never and GIT_TERMINAL_PROMPT=0). Left in place they make the
# push fail with 403 without ever prompting. The script clears them for its own run.

set -euo pipefail

cd "$(dirname "$0")"

ACCOUNT="${1:-}"
REPO_NAME="${2:-}"
BRANCH="main"

if [ -n "$ACCOUNT" ] && [ -n "$REPO_NAME" ]; then
  URL="https://github.com/${ACCOUNT}/${REPO_NAME}.git"
elif URL="$(git remote get-url origin 2>/dev/null)"; then
  ACCOUNT="$(printf '%s' "$URL" | sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#')"
else
  echo "No origin remote set. Usage: ./publish.sh <account> <repo-name>" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes:" >&2
  git status --short >&2
  echo >&2
  echo "Commit or stash them first." >&2
  exit 1
fi

echo "Repository : ${URL}"
echo "Pushing    : $(git rev-list --count HEAD) commits -> ${BRANCH}"
echo

printf 'Personal access token for %s (input hidden): ' "$ACCOUNT"
stty -echo 2>/dev/null || true
read -r TOKEN
stty echo 2>/dev/null || true
printf '\n\n'

if [ -z "$TOKEN" ]; then
  echo "No token entered, nothing done." >&2
  exit 1
fi

# Hand the token to git via askpass so it never reaches argv, the remote URL,
# the reflog or shell history.
ASKPASS="$(mktemp)"
trap 'rm -f "$ASKPASS"' EXIT
cat >"$ASKPASS" <<'ASKPASS_EOF'
#!/bin/sh
case "$1" in
  *sername*) printf '%s\n' "$RTG_USER" ;;
  *assword*) printf '%s\n' "$RTG_PASS" ;;
esac
ASKPASS_EOF
chmod 700 "$ASKPASS"

unset GH_TOKEN GITHUB_TOKEN GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT \
      GIT_CONFIG_KEY_0 GIT_CONFIG_KEY_1 GIT_CONFIG_KEY_2 \
      GIT_CONFIG_VALUE_0 GIT_CONFIG_VALUE_1 GIT_CONFIG_VALUE_2 2>/dev/null || true

RTG_USER="$ACCOUNT" \
RTG_PASS="$TOKEN" \
GIT_ASKPASS="$ASKPASS" \
GIT_TERMINAL_PROMPT=1 \
git -c credential.helper= \
    -c "credential.https://github.com.helper=" \
    push "$URL" "HEAD:${BRANCH}"

echo
echo "Pushed to ${URL%.git}"
echo "In Cloudflare Pages: preset None, build command 'exit 0', output directory '.',"
echo "production branch '${BRANCH}'."
