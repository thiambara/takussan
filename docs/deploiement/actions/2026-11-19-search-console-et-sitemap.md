---
titre: "Ouvrir la propriété Search Console par DNS, soumettre le sitemap servi par www, et relever l'index à J+7"
type: externe
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: sans-objet
production: a-faire
---

## Quoi faire

[Plan, F1, étape 7 ; F3, étapes 3 et 7 ; F5, étape 1](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md), D-72 de l'ardoise : propriété de domaine par TXT
chez Cloudflare, relevé initial dans TCK-517 ; le sitemap compte plus de `<loc>` que de biens publiés ; soumission ;
relevé à J+7 (TCK-517, AC5).

## Comment vérifier

La Search Console montre le sitemap lu, et le relevé de J+7 est dans TCK-517.

## Historique

- 2026-11-19 · preview · sans-objet · Claude (inventaire, pour le porteur) · la préproduction est en `noindex` par construction (TCK-926)
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : aucun enregistrement TXT de vérification Google relevé sur l'apex (un seul TXT, non lu)
