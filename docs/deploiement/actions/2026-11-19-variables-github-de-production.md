---
titre: "Poser les variables et le secret GitHub de la production, que images.yml lit pour déployer et prouver"
type: externe
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: fait
production: a-faire
---

## Quoi faire

[Plan, F3, étape 2](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) : variables `PRODUCTION_DOKPLOY_API_COMPOSE_ID`, `PRODUCTION_API_URL`,
`PRODUCTION_SITE_URL`, secret `PRODUCTION_DOKPLOY_WEB_WEBHOOK`.

## Comment vérifier

`gh variable list` et `gh secret list` montrent les quatre noms ; le premier push sur `master` rend deux lignes ✓
dans `images.yml`.

## Historique

- 2026-11-19 · preview · fait · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 (noms seuls) : `PREVIEW_API_URL`, `PREVIEW_DOKPLOY_API_COMPOSE_ID`, `PREVIEW_SITE_URL`, secret `PREVIEW_DOKPLOY_WEB_WEBHOOK`
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : aucune variable ni aucun secret `PRODUCTION_*`
