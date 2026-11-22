---
titre: "Décider et écrire l'ADR du rapporteur d'erreurs (GlitchTip ou Sentry) avant la production"
type: decision
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

[Plan, F1, étape 8](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) : aucun rapporteur d'erreurs n'existe ; les gabarits n'ont ni clé Sentry ni clé
GlitchTip. Une exception en production ne se voit aujourd'hui que dans les journaux du conteneur.

## Comment vérifier

L'ADR est écrit, et une exception provoquée remonte dans l'outil choisi.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : aucune clé `SENTRY_*` dans l'environnement de préproduction ni dans les gabarits
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · idem
