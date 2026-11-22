---
id: TCK-3001
title: "Le journal d'accès de Traefik ne garde plus le chemin des requêtes, ni les jetons qu'il a vus"
status: todo
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-11-22
updated: 2026-11-22
depends_on: []
blocks: [TCK-517]
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [infra, traefik, journaux, secrets, whatsapp, production, decision-2026-11-22]
---

## Objectif utilisateur

Qu'un secret porté par une URL (jeton de webhook, signature de média) ne survive pas dans le journal du serveur.

## Contrat de données

Aucun endpoint. Relevé P73.03 du 2026-11-22 (`docs/infra/hebergement.md`, ligne « Journal d'accès de Traefik ») :
`accessLog` en `fields.defaultMode: keep`, donc `RequestPath` complet ; le journal portait le jeton d'URL et le jeton de
vérification du webhook WhatsApp, et des URL de média signées. Les jetons sont dans le **chemin** lui-même
(`/api/webhooks/messagerie/whatsapp/{jeton}`) : Traefik ne sait masquer ni un segment ni une chaîne de requête.
**Décidé par le porteur le 2026-11-22 : retirer `RequestPath` du journal.**

## Contraintes strictes (métier)

- Le geste vit dans `deploy/server/journaux-traefik.sh` (source de `traefik.yml` côté `accessLog`), jamais à la main seul :
  la reconstruction du serveur doit le reposer.
- Ce qui reste au journal doit suffire à un diagnostic : hôte, méthode, statut, durées, `RouterName`/`ServiceName`,
  `User-Agent`. L'écrire dans le commentaire du script.
- **Rotation des jetons : à trancher avec le porteur avant tout geste** — le jeton d'URL est l'URL de rappel déclarée chez
  Meta (étape C de l'action [ouvrir le pont WhatsApp](../../../deploiement/actions/2026-11-19-ouvrir-le-pont-whatsapp.md)) :
  le changer exige de redéclarer l'URL. Six caractères de chacun ont aussi été affichés dans une session le 2026-11-22.
- Le journal déjà écrit contient les jetons : il se purge (rotation des fichiers `json-file` du conteneur) après le
  changement de configuration, pas avant.

## Delta à produire

- [ ] `deploy/server/journaux-traefik.sh` : `fields.names.RequestPath: drop` (et toute autre clé qui porterait l'URL, à
  relire), commentaire mis à jour, sonde du script adaptée.
- [ ] Script rejoué sur le serveur, Traefik redémarré, `traefik.yml` relu.
- [ ] Purge du journal existant de `dokploy-traefik`.
- [ ] Décision de rotation consignée ; si oui : `WHATSAPP_WEBHOOK_URL_TOKEN` et `WHATSAPP_WEBHOOK_VERIFY_TOKEN` neufs dans
  Dokploy (sauvegarde de l'environnement avant), URL de rappel redéclarée chez Meta, défi d'abonnement rejoué.
- [ ] Ligne « Journal d'accès de Traefik » de hebergement.md et historique de l'action « durcir » (point 6).

## Critères d'acceptation

- [ ] AC1 — une requête sonde `GET /api/webhooks/messagerie/whatsapp/SONDE-<date>?x=SONDE` laisse une ligne au journal
  **sans** `SONDE` ni clé `RequestPath`, avec statut et hôte.
- [ ] AC2 — `docker logs dokploy-traefik | grep -c RequestPath` rend `0` après la purge.
- [ ] AC3 — si rotation : le défi d'abonnement rend `42` avec le nouveau jeton, et un refus avec l'ancien.
- [ ] AC4 — la reconstruction du serveur (runbook) repose ce réglage.

## Hors périmètre

- Les journaux de l'API Laravel et du front.
- La rotation des autres jetons de webhook (SMS, Radar), non relevés dans ce journal au 2026-11-22.

## Notes d'implémentation

_(à remplir par implementing-specs)_
