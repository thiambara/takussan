---
titre: "Ouvrir le WhatsApp du Radar : application Meta séparée, numéro dédié, gabarit d'accord relu par l'avocat, webhook"
type: externe
tickets: [TCK-2395, TCK-2471, TCK-2392]
cles: [RADAR_WHATSAPP_PHONE_NUMBER_ID, RADAR_WHATSAPP_ACCESS_TOKEN, RADAR_WHATSAPP_WEBHOOK_URL_TOKEN, RADAR_WHATSAPP_WEBHOOK_APP_SECRET, RADAR_WHATSAPP_WEBHOOK_VERIFY_TOKEN, RADAR_WHATSAPP_ACCORD_V4_TEMPLATE]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

TCK-2395 et TCK-2471 : une seconde application Meta, un numéro dédié, un jeton système ; le gabarit d'accord
(`accord.v4`) relu par l'avocat puis approuvé ; webhook du Radar abonné à `messages` ; les clés `RADAR_WHATSAPP_*`,
et le pilote `cloud` en dernier. Puis les deux décisions de TCK-2392 : allumer les sources de collecte, et ne passer
`RADAR_MERGE_AUTO=true` qu'après mesure. `radar:backfill-similarity` est sans objet sur une base neuve.

## Comment vérifier

Un accord envoyé à un numéro de test et sa réponse reçue par le webhook du Radar.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : les cinq `RADAR_WHATSAPP_*` vides, `RADAR_WHATSAPP_ACCORD_V4_TEMPLATE` absente
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · avant le premier démarchage
