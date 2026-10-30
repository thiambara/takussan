---
id: TCK-2426
title: "Radar : la console envoie un message d'accord par l'API WhatsApp et montre la réponse reçue en texte"
status: todo
phase: P3
family: front
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2395]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [front, radar, whatsapp, adr-0077]
---

## Objectif utilisateur

L'opérateur envoie le message d'accord sans quitter la console, et lit la réponse de l'annonceur
reçue par l'API comme il lit celle d'une capture.

## Contexte

TCK-2395 livre l'API : `POST /api/admin/radar/outreaches/{outreach}/send`, le canal du message
(`channel`, `provider_status` dans `RadarOutreachResource`) et les réponses `proof = provider_message`
(texte dans `transcript`, aucune capture). La fiche annonceur (`RadarAdvertiserCard`) ne connaît que
le lien `wa.me` et les captures.

## Delta à produire

- [ ] Un bouton « Envoyer par l'API » sur un brouillon prêt, à côté du lien `wa.me`, et ses refus
      (`radar.whatsapp.*`) traduits.
- [ ] Le canal d'un message envoyé (manuel, API, envoi ambigu) sur sa carte.
- [ ] Une réponse `provider_message` montrée par sa transcription, sans galerie de captures ;
      `radar.verification.no_text` (vocal, image) dit que la réponse n'est pas lisible ici.
- [ ] Savoir si le canal est disponible : à trancher (une clé de configuration exposée, ou le bouton
      toujours là et le refus `radar.whatsapp.not_configured` affiché).

## Critères d'acceptation

- [ ] AC1 — Le bouton envoie, et la carte passe « envoyé » par l'API sans recharger la fiche.
- [ ] AC2 — Une réponse reçue s'affiche en texte, et l'issue se pose comme pour une capture.

## Hors périmètre

- L'envoi en lot (plusieurs annonceurs d'un geste) : une décision du porteur, après la mesure du
  taux d'acceptation de `radar.verification_accord`.
