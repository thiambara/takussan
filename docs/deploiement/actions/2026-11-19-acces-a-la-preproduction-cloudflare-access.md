---
titre: "Décider Cloudflare Access ou l'authentification basique pour la préproduction, avant d'ouvrir la production"
type: decision
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: a-faire
production: sans-objet
---

## Quoi faire

hebergement.md : la préproduction est fermée par une authentification basique (`PREVIEW_BASIC_AUTH`), à revoir
« avant la production ». Une fois la production publique, la préproduction ne doit plus pouvoir être prise pour
elle ni indexée. Décider : garder l'authentification basique, ou passer à Cloudflare Access (proxifier les noms de
préproduction).

## Comment vérifier

La décision est datée dans hebergement.md ; `curl -sI https://preview.takussan.com/` rend ce qui a été décidé.

## Historique

- 2026-11-19 · production · sans-objet · Claude (inventaire, pour le porteur) · la production est publique par définition ; la décision porte sur l'accès à la préproduction
- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : secret GitHub `PREVIEW_BASIC_AUTH` présent ; reporté de hebergement.md : décision non prise
