---
id: TCK-2576
title: WhatsApp au premier rang des fiches d'agence et d'agent — l'API publique le sert
status: done
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

**Décision du porteur (2026-11-16) : option (a).** Le WhatsApp de l'agence est un **numéro d'agence
déclaré WhatsApp** — nouvelle colonne `agencies.phone_whatsapp` (migration additive), saisie par qui
configure l'agence dans sa fiche `/app/agency` —, **jamais** le numéro personnel de l'administrateur.
Pour l'agent, la règle de `PropertyContactNumbers::hasWhatsApp()` restreinte au numéro principal.
Ordre des boutons : WhatsApp, puis Appeler, puis Message.

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

- [x] API, fiche d'agent : `phone_whatsapp` (booléen) servi avec `phone`, et seulement quand le
  numéro est publié (vérifié, même règle que `PropertyContactNumbers::hasWhatsApp()` restreinte au
  numéro principal — `principalUtilisable` + `phone_whatsapp` —, pour ne pas réécrire la règle).
- [x] API, fiche d'agence : décider la source (numéro de l'agence déclaré WhatsApp — colonne à créer,
  ou administrateur de l'agence) ; écrire la décision ici avant de l'implémenter.
- [x] Front, `ContactDeFiche` : WhatsApp au premier rang quand l'API le dit, lien `wa.me` sur le
  numéro publié (réutiliser `components/contact/WhatsAppButton.tsx`) ; Appeler, puis Message, ensuite.
  Clés i18n `fr`/`en`/`wo`.

## Critères d'acceptation

- [x] AC1 — Un agent au numéro vérifié et déclaré WhatsApp : la barre d'actions commence par
  WhatsApp, lien `wa.me` sur ce numéro.
- [x] AC2 — Numéro non vérifié, ou vérifié mais non déclaré WhatsApp : aucun bouton WhatsApp, et
  aucun champ WhatsApp dans la réponse publique pour un numéro non publié.
- [x] AC3 — Même règle sur la fiche d'agence, selon la source décidée.

## Hors périmètre

- Le propriétaire : aucun numéro n'est publié sur sa fiche (TCK-2523).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **`agencies.phone_whatsapp` est un NUMÉRO (chaîne, E.164), pas un booléen** comme `users.phone_whatsapp` :
  `agencies.phone` est un texte libre, souvent la ligne fixe du bureau, et le WhatsApp d'une agence est
  le plus souvent un autre numéro. Saisi dans « Identité et contact » de `/app/agency`, à côté du
  téléphone (masqué pour une agence `individual`, sans fiche publique d'agence) ; normalisé par `TelephoneSaisi` et jugé par `TelephoneJoignable` (les règles des numéros de
  paiement hors ligne). Aucune route neuve : le `PATCH /api/agencies/{id}` existant.
- **Une règle par fiche, en un point** : `User::principalPublicSurWhatsApp()` (que
  `PropertyContactNumbers::hasWhatsApp()` appelle désormais) et `Agency::numeroWhatsAppPublic()`. La clé
  `phone_whatsapp` est ABSENTE de la réponse quand le numéro n'est pas publié (agent) ou pas déclaré
  (agence) — ni `phone`, ni le numéro de l'admin n'y suppléent.
- **Front** : `ContactDeFiche` reçoit `whatsapp` (le numéro) et rend WhatsApp, puis Appeler, puis Message.
  Au téléphone, avec trois canaux, Appeler et Message passent en boutons carrés à nom accessible (trois
  libellés ne tiennent pas en 360 px). Le lien est `LienWhatsApp` (`components/contact/LienWhatsApp.tsx`),
  qui porte aussi l'icône que `WhatsAppButton` réutilise : un fichier sans traduction, pour que la fiche
  n'embarque pas `contact`/`propertyContact`.
- AC1 : `WhatsAppDesFichesTest::test_ac1_…`, `ContactDeFiche.test.tsx` (« AC1 — la barre commence par
  WhatsApp… »), `agents/[slug]/page.server.test.tsx` (AC1).
- AC2 : `WhatsAppDesFichesTest::test_ac2_…` (×2) — **ablation** : clé servie sans condition → rouge ;
  `page.server.test.tsx` (AC2 ×3, propriétaire) — **ablation** : WhatsApp déduit de `telephone` → rouge.
- AC3 : `WhatsAppDesFichesTest::test_ac3_…` (×2, dont l'admin WhatsApp vérifié jamais servi) — **ablation** :
  `numeroWhatsAppPublic()` retombant sur `phone` → rouge ; `agencies/[slug]/page.server.test.tsx` (AC3) —
  **ablation** : repli sur `telephone` → rouge.

