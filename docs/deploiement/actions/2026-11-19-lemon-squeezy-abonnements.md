---
titre: "Ouvrir Lemon Squeezy (compte, store, webhook) ou décider de s'en passer, avant de vendre un abonnement"
type: externe
tickets: [TCK-1172]
cles: [LEMON_SQUEEZY_API_KEY, LEMON_SQUEEZY_SIGNING_SECRET, LEMON_SQUEEZY_STORE]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

TCK-1172 : compte et store, webhook enregistré chez Lemon Squeezy, puis les trois clés. Sans
`LEMON_SQUEEZY_SIGNING_SECRET`, chaque webhook reçoit un 403.

## Comment vérifier

Un achat de test met l'abonnement à jour.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : les trois clés `LEMON_SQUEEZY_*` vides
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · idem
