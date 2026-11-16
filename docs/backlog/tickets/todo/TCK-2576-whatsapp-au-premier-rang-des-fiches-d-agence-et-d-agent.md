---
id: TCK-2576
title: WhatsApp au premier rang des fiches d'agence et d'agent — l'API publique le sert
status: todo
phase: P1
family: full
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [api, front, directory, audit-ux]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai.** Fiche d'agent : `phone` et `phone_verified` seuls
(`PublicAgentController.php:311-312`, aucune clé `*whatsapp*`) ; fiche d'agence : `phone` seul
(`PublicAgencyController.php:465`), aucune colonne WhatsApp sur `agencies` ; `ContactDeFiche.tsx`
n'a pas de bouton WhatsApp. Rien de fermé entre-temps (`git log --grep=TCK-2576` : création seulement).

Reste à faire :
- API agent : `phone_whatsapp` (booléen) servi seulement quand `phone` l'est (AC1, AC2), par la règle
  existante `PropertyContactNumbers::hasWhatsApp()` restreinte au numéro principal.
- API agence selon la décision ci-dessous (AC3) — S, ou M avec colonne et saisie.
- Front : WhatsApp au premier rang (réutiliser `components/contact/WhatsAppButton.tsx`), puis Appeler, puis Message ; i18n fr/en/wo.

**Décision attendue du porteur** : le bouton WhatsApp de la fiche d'agence vise-t-il (a) un numéro
d'agence déclaré WhatsApp (nouvelle colonne `agencies.phone_whatsapp`, migration additive, saisie dans
la vitrine `/app/agency`), ou (b) le numéro de l'administrateur de l'agence ?

## Objectif utilisateur

Sur la fiche d'un agent ou d'une agence, le visiteur écrit d'abord sur WhatsApp (décision 4a du
porteur, maquettes D d'agence et d'agent : WhatsApp au premier rang, puis Appeler, puis Message) —
mais seulement quand le numéro publié est bien sur WhatsApp.

## Constat (relevé du 2026-11-09, revue de TCK-2522 / TCK-2523)

- La donnée existe : `users.phone_whatsapp` et `secondary_phone_whatsapp` (TCK-633, lot C), servis
  à l'utilisateur lui-même (`UserResource`) et résumés sur la fiche d'un bien
  (`primary_contact.has_whatsapp`, `PropertyContactNumbers::hasWhatsApp`).
- `GET /api/public/agents/{slug}` ne la sert pas (clés : `phone`, `phone_verified`, aucune
  `*whatsapp*`), ni `GET /api/public/agencies/{slug}` (`phone` seul ; aucune colonne WhatsApp sur
  `agencies`).
- Le front (`ContactDeFiche`) n'affiche donc pas WhatsApp : un bouton qui viserait un numéro hors
  WhatsApp mentirait (TCK-633, lot C).

## Delta à produire

- [ ] API, fiche d'agent : `phone_whatsapp` (booléen) servi avec `phone`, et seulement quand le
  numéro est publié (vérifié, même règle que `PropertyContactNumbers::hasWhatsApp()` restreinte au
  numéro principal — `principalUtilisable` + `phone_whatsapp` —, pour ne pas réécrire la règle).
- [ ] API, fiche d'agence : décider la source (numéro de l'agence déclaré WhatsApp — colonne à créer,
  ou administrateur de l'agence) ; écrire la décision ici avant de l'implémenter.
- [ ] Front, `ContactDeFiche` : WhatsApp au premier rang quand l'API le dit, lien `wa.me` sur le
  numéro publié (réutiliser `components/contact/WhatsAppButton.tsx`) ; Appeler, puis Message, ensuite.
  Clés i18n `fr`/`en`/`wo`.

## Critères d'acceptation

- [ ] AC1 — Un agent au numéro vérifié et déclaré WhatsApp : la barre d'actions commence par
  WhatsApp, lien `wa.me` sur ce numéro.
- [ ] AC2 — Numéro non vérifié, ou vérifié mais non déclaré WhatsApp : aucun bouton WhatsApp, et
  aucun champ WhatsApp dans la réponse publique pour un numéro non publié.
- [ ] AC3 — Même règle sur la fiche d'agence, selon la source décidée.

## Hors périmètre

- Le propriétaire : aucun numéro n'est publié sur sa fiche (TCK-2523).

## Notes d'implémentation

_(à remplir par implementing-specs)_
