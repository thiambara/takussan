---
titre: "Déclarer les clients OAuth de production (Google, et Facebook et Apple si on les garde) avec leurs URI de retour"
type: externe
tickets: [TCK-081, TCK-517]
cles: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET, APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

[Plan, F3, étape 1](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) : `GOOGLE_REDIRECT_URI` de production déclarée aussi dans le client Google. Facebook et
Apple : décider s'ils sont proposés ; sinon les retirer de l'écran de connexion. Apple exige la clé `.p8` montée pour
`APPLE_PRIVATE_KEY_PATH`.

## Comment vérifier

Une connexion réelle par chaque fournisseur gardé, depuis `www.takussan.com`.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : Google posé ; `FACEBOOK_*` et `APPLE_*` vides — à décider
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · aucun client de production
