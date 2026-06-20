#!/usr/bin/env bash
#
# deploy-prod-vps.sh — Déploiement PROD à lancer directement depuis le VPS.
#
# Reproduit l'action GitHub `.github/workflows/deploy.yml`, mais SANS injecter
# le secret ENV_FILE : le `.env` réutilisé est celui de la dernière version
# déployée (shared/.env, persistant entre les releases).
#
# Usage : bash scripts/deploy-prod-vps.sh
#
# Le REPO_URL peut être surchargé sans éditer ce fichier :
#   REPO_URL="git@github.com:thiambara/takussan.git" bash scripts/deploy-prod-vps.sh

set -euo pipefail

# ─── Configuration figée ──────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-git@github.com:thiambara/takussan.git}"
BRANCH="master"
APP_DIR="/var/www/takussan"

# ─── Réutiliser le .env de la dernière version déployée ───────────────────────
# En ne définissant PAS ENV_FILE, deploy.sh retombe sur ${APP_DIR}/shared/.env
# (cf. deploy.sh, branche elif) au lieu de le réécrire depuis un secret.
unset ENV_FILE

exec bash "${APP_DIR}/deploy.sh" "${REPO_URL}" "${BRANCH}" "${APP_DIR}"
