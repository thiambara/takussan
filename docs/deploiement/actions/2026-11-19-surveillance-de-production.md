---
titre: "Surveiller la production (sondes de disponibilité de api, www et ws) et retirer la sonde CheckPrint restante"
type: externe
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

Aucune étape de la phase F ne prévoit de sonde de disponibilité pour la production. Créer chez UptimeRobot les
sondes de `https://api.takussan.com/up`, `https://www.takussan.com/` et `https://ws.takussan.com/up`. Côté
préproduction : ajouter la sonde de `https://preview.ws.takussan.com/up` et retirer `preview.api.checkprintplus.com`
(projet arrêté le 2026-10-04 ; hebergement.md).

## Comment vérifier

Le tableau UptimeRobot montre les sondes, et une coupure forcée alerte.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · reporté de hebergement.md : sonde `preview.api` en place, sonde CheckPrint encore à retirer ; sonde `preview.ws` non relevée
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · aucune sonde prévue par le plan
