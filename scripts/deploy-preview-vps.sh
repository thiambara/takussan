#!/usr/bin/env bash
#
# deploy-preview-vps.sh — Déploiement PREVIEW à lancer directement depuis le VPS.
#
# Reproduit l'action GitHub `.github/workflows/deploy-preview.yml`, mais SANS
# injecter le secret ENV_FILE_PREVIEW : le `.env` réutilisé est celui de la
# dernière version déployée (shared/.env, persistant entre les releases).
#
# Usage : bash scripts/deploy-preview-vps.sh
#
# Le REPO_URL peut être surchargé sans éditer ce fichier :
#   REPO_URL="git@github.com:thiambara/takussan.git" bash scripts/deploy-preview-vps.sh

set -euo pipefail

# ─── Configuration figée ──────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-git@github.com:thiambara/takussan.git}"
BRANCH="preview"
APP_DIR="/var/www/takussan-preview"

# ─── Réutiliser le .env de la dernière version déployée ───────────────────────
# En ne définissant PAS ENV_FILE_PREVIEW, deploy.sh retombe sur ${APP_DIR}/shared/.env
# (cf. deploy.sh, branche elif) au lieu de le réécrire depuis un secret.
unset ENV_FILE_PREVIEW

exec bash "${APP_DIR}/deploy.sh" "${REPO_URL}" "${BRANCH}" "${APP_DIR}"
