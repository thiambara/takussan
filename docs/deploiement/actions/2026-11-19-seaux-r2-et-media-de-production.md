---
titre: "Créer les seaux R2 de production, le jeton qui ne voit qu'eux, et servir media.takussan.com"
type: externe
tickets: [TCK-517]
cles: [R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_MEDIA_URL]
creee: 2026-11-19
preview: fait
production: a-faire
---

## Quoi faire

[Plan, F1, étape 6](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) : seaux `takussan-prod-media` (WEUR, domaine `media.takussan.com` proxifié) et
`takussan-prod-private` ; jeton `takussan-prod-app` limité à ces deux seaux, avec sa preuve inverse ; un objet sonde
servi en 200 par `media.takussan.com`, aucune URL publique côté privé, puis la sonde supprimée.

## Comment vérifier

Le jeton est refusé sur un seau de préproduction ; `curl -sI https://media.takussan.com/<sonde>` rend 200 ;
le seau privé n'a pas de domaine public.

## Historique

- 2026-11-19 · preview · fait · Claude (inventaire, pour le porteur) · reporté de hebergement.md (seaux et jeton de préproduction, 2026-09-22) ; re-mesuré le 2026-11-19 : CNAME `media-preview.takussan.com` proxifié présent ; aucun relevé de l'objet sonde (étape 6, dernier point) n'a été trouvé
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : aucun enregistrement `media.takussan.com`
