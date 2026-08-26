#!/usr/bin/env bash
# redeploy_fork.sh
#
# Personal-fork addition (not upstream): pulls the latest commit from this
# fork's current branch, syncs Python deps, rebuilds the frontend from
# source, and restarts the systemd service set up by install_service.sh.
#
# Refuses to run if the local branch has diverged from origin (fast-forward
# only — never force-resets local state) or if the service isn't installed.
#
# Run from anywhere inside the repo:
#   bash scripts/setup/redeploy_fork.sh
#
# Override the service name if you installed it under a different one:
#   SERVICE_NAME=my-remoteterm bash scripts/setup/redeploy_fork.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SERVICE_NAME="${SERVICE_NAME:-remoteterm}"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
UV_BIN="$(command -v uv || printf '%s' "$HOME/.local/bin/uv")"

echo -e "${BOLD}=== RemoteTerm fork redeploy ===${NC}"
echo -e "  Repo directory : ${CYAN}${REPO_DIR}${NC}"
echo -e "  Service name   : ${CYAN}${SERVICE_NAME}.service${NC}"
echo

cd "$REPO_DIR"

if ! command -v systemctl &>/dev/null; then
    echo -e "${RED}Error: systemd not found. This script assumes an install_service.sh deployment.${NC}"
    exit 1
fi

if ! systemctl list-unit-files "${SERVICE_NAME}.service" &>/dev/null; then
    echo -e "${RED}Error: ${SERVICE_NAME}.service is not installed. Run scripts/setup/install_service.sh first.${NC}"
    exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo -e "${RED}Error: uncommitted local changes to tracked files. Commit, stash, or discard them first.${NC}"
    exit 1
fi

BEFORE_COMMIT="$(git rev-parse --short HEAD)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$CURRENT_BRANCH" = "HEAD" ]; then
    echo -e "${RED}Error: repo is in detached HEAD state. Check out a branch first.${NC}"
    exit 1
fi

echo -e "${YELLOW}Fetching latest from origin...${NC}"
git fetch origin "$CURRENT_BRANCH"

if ! git merge-base --is-ancestor HEAD "origin/${CURRENT_BRANCH}"; then
    echo -e "${RED}Error: local ${CURRENT_BRANCH} has diverged from origin/${CURRENT_BRANCH}.${NC}"
    echo    "Resolve manually (rebase/merge) before redeploying — this script only fast-forwards."
    exit 1
fi

echo -e "${YELLOW}Fast-forwarding to origin/${CURRENT_BRANCH}...${NC}"
git merge --ff-only "origin/${CURRENT_BRANCH}"
AFTER_COMMIT="$(git rev-parse --short HEAD)"

if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
    echo -e "${GREEN}Already up to date at ${AFTER_COMMIT}.${NC}"
else
    echo -e "${GREEN}Updated ${BEFORE_COMMIT} -> ${AFTER_COMMIT}.${NC}"
fi

echo
echo -e "${YELLOW}Syncing Python dependencies...${NC}"
"$UV_BIN" sync

echo
echo -e "${YELLOW}Building frontend from source...${NC}"
(cd frontend && npm ci && npm run build)

echo
echo -e "${YELLOW}Restarting ${SERVICE_NAME}.service...${NC}"
sudo systemctl restart "${SERVICE_NAME}.service"

echo -e "${YELLOW}Waiting for the service to report healthy...${NC}"

# Read the port/scheme back from the unit's actual ExecStart rather than
# assuming defaults, so this keeps working if either was customized.
UNIT_EXEC_START="$(systemctl show "${SERVICE_NAME}.service" -p ExecStart --value)"
PORT="$(printf '%s' "$UNIT_EXEC_START" | grep -oP -- '--port[ =]\K[0-9]+' | head -1)"
PORT="${PORT:-8000}"
SCHEME="http"
if printf '%s' "$UNIT_EXEC_START" | grep -q -- '--ssl-certfile'; then
    SCHEME="https"
fi
HEALTH_URL="${SCHEME}://localhost:${PORT}/api/health"

for _ in $(seq 1 15); do
    if [ "$(curl -sk -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)" = "200" ]; then
        echo -e "${GREEN}Healthy: ${HEALTH_URL}${NC}"
        curl -sk "$HEALTH_URL" | python3 -c \
            "import json, sys; d = json.load(sys.stdin); print('  commit:', d['app_info']['commit_hash']); print('  radio_connected:', d['radio_connected'])"
        exit 0
    fi
    sleep 1
done

echo -e "${RED}Service did not report healthy at ${HEALTH_URL} within 15s.${NC}"
echo    "Check: sudo systemctl status ${SERVICE_NAME}.service --no-pager -l"
exit 1
