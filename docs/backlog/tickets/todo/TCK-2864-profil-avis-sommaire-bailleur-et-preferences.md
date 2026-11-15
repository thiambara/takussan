---
id: TCK-2864
title: "Profil : la répartition des notes, « N avis en attente de validation » et « Bail clôturé · Noter » ; le « À régler » du bailleur (pièces d'identité, points, « Envoyer le RIB »), sa page de versement et d'annuaire réunie au bureau ; la rangée imposée des préférences"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2863]
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#23-notifications"
  models: []
tags: [front, profil, avis, bailleur, notifications, audit-ux, app]
---

## Objectif utilisateur

L'agent lit sa réputation d'un coup d'œil ; le locataire note son ancien logement ; le bailleur sait ce qui l'empêche d'être payé et le règle depuis son profil ; chacun ne voit que les notifications qui le concernent.

## Contrat de données

- `meta.distribution`, `meta.pending_count`, opportunité `lease_closed`, envoi du RIB, événement imposé et personas destinataires : **livrés par TCK-2863**.
- Pièces du bailleur : `GET /api/me/pieces` (TCK-2612, existe) — le sommaire ne lit aujourd'hui aucun fait KYC (`lib/profil/sommaire.ts:80-137` ne connaît que téléphone, 2FA, fiche).

Relevé (audit-f3-coque.md, app-profil e2, e4, e6 ; « Écarts couverts » 2 à 6) : `ProfileReviewsList.tsx:104-130, 139-156` sans répartition ni compte en attente ; aucune `CarteAvisEnAttente` au bureau ; sommaire du bailleur sans encart pièces, sans points sur « Moyens de versement » et « Sécurité », sans « Envoyer le RIB » ; au bureau, versement (`/payouts`) et annuaire (`/directory`) en deux sections (choix accepté, repris ici à la demande du porteur) ; `NotificationPreferencesMatrix.tsx` sans rangée imposée.

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-profil.tsx` et `app-profil-pieces.tsx`, approche a :

- **e4 « Mes avis »**, **les deux formats** : sous la note de tête, la **répartition par étoile** 5 → 1 (barres et comptes, `TeteAvis`) ; au-dessus de la liste, « 1 avis en attente de validation » (l. 434). **Bureau** : la carte compacte « Bail clôturé le 31 oct. · F3, Sacré-Cœur 3 » avec **« Noter »** (`CarteAvisEnAttente`, l. 586-590).
- **e6 « Sommaire (bailleur) »**, **les deux formats** : l'encart / la rangée « À régler » « Envoyez vos pièces d'identité pour recevoir vos reversements. » avec « Envoyer » (l. 484) ; les **points** sur « Moyens de versement » (compte à confirmer) et « Sécurité » (pièces à envoyer) ; sur un compte bancaire « À confirmer », **« Envoyer le RIB »** (l. 705-709) ; sous le moyen par défaut, « reversements du 5 de chaque mois » (l. 702) quand `payout_day` est servi (TCK-2909 / TCK-2915, famille 4 : cet élément se livre après eux). **Bureau** : une seule page « versement + Annuaire public » en dessous, sous-titre « 2 réglages demandent votre attention » (l. 499).
- **e2 « Préférences de notifications »**, **les deux formats** : la rangée « Vérification d'identité » marquée « Toujours envoyée : sécurité du compte. » (cases figées, `app-profil-pieces.tsx` l. 231) ; les événements que la persona ne reçoit jamais ne sont pas affichés.

## Contraintes strictes (métier)

- « Envoyer le RIB » ouvre le dépôt d'un fichier, sous step-up 2FA ; succès → statut « En revue ».
- Le compte « N réglages demandent votre attention » compte les mêmes choses que les points et les encarts (une seule source, `sommaire.ts`).
- La répartition ne compte que les avis approuvés.
- Les anciennes URL `/app/profile/payouts` et `/app/profile/directory` continuent de mener au bon endroit (redirection ou ancre).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Mes avis : répartition, compte en attente, carte « Bail clôturé · Noter » (bureau ; et au téléphone dans « À laisser » si la maquette téléphone la dessine).
- [ ] Sommaire du bailleur : encart pièces, points, « Envoyer le RIB » ; page réunie au bureau.
- [ ] Préférences : rangée imposée, masquage par persona.
- [ ] Tests : barres 5 → 1 avec leurs comptes ; « 1 avis en attente de validation » ; « Noter » ouvre le formulaire d'avis du bail ; encart pièces quand `me/pieces` dit « à envoyer » ; point sur « Sécurité » ; « Envoyer le RIB » ; rangée imposée non modifiable.

## Critères d'acceptation

- [ ] AC1 — Agent avec `distribution = {5: 4, 3: 1}` : cinq lignes 5 → 1, la ligne 5★ porte « 4 », la ligne 4★ « 0 ».
- [ ] AC2 — `pending_count = 1` : « 1 avis en attente de validation » au-dessus de la liste ; 0 : rien.
- [ ] AC3 — À 1440, locataire avec une opportunité `lease_closed` : la carte « Bail clôturé le 31 oct. · … » et « Noter », qui ouvre l'avis.
- [ ] AC4 — Bailleur dont les pièces sont à envoyer : l'encart « Envoyez vos pièces d'identité pour recevoir vos reversements. » mène à l'étape ; « Sécurité » porte un point ; pièces envoyées : ni encart ni point.
- [ ] AC5 — Compte bancaire « À confirmer » : « Envoyer le RIB » → dépôt d'un PDF → le statut devient « En revue ».
- [ ] AC5 bis — Moyen par défaut d'un bailleur dont l'agence a `payout_day = 5` : « reversements du 5 de chaque mois » ; `null` : rien.
- [ ] AC6 — À 1440, la page du bailleur réunit versement et « Annuaire public », sous-titre « 2 réglages demandent votre attention » quand deux choses attendent.
- [ ] AC7 — Préférences : « Vérification d'identité » est rendue, ses cases désactivées, avec « Toujours envoyée : sécurité du compte. » ; un agent ne voit pas les événements du locataire.
- [ ] AC8 — Vérifier au navigateur (audit, non vérifiables) : la note de tête avec un agent noté ; les points et le nombre d'encarts « À régler » avec un agent sans 2FA et un bailleur — corriger si absents.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2864.json` : app-profil e2, e4, e6, téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; rien de ce qui précède n'est rangé en « donnée » ni « à proposer ».
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- La fiche publique de l'agent : TCK-2862.

## Notes d'implémentation

_(à remplir par implementing-specs)_
