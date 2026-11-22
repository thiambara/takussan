---
id: TCK-2864
title: "Profil : la répartition des notes, « N avis en attente de validation » et « Bail clôturé · Noter » ; le « À régler » du bailleur (pièces d'identité, points, « Envoyer le RIB »), sa page de versement et d'annuaire réunie au bureau ; la rangée imposée des préférences"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

**2026-11-15 — implémentation (agent, vague 92).** Chaque règle a un test vérifié rouge sans son correctif (ablation une à une, restauration prouvée par md5).

**Préférences (AC7)** — `catalog` (TCK-2863) lu par `NotificationPreferencesMatrix`, filtré CÔTÉ ÉCRAN (`vueDuCatalogue`, `lib/notification-preferences.ts`) : l'API ne filtre que le `GET ?persona=`, et la réponse du `PATCH` (`payloadFor($user)`) le rend non filtré — un filtre serveur se serait défait au premier toucher. La persona est celle de la coque (`lib/profil/persona-du-profil.ts` : profil actif, hôte par l'agence `individual`), passée par la page ; `plateforme` voit tout (la table de l'API ne lui attribue presque rien). Sans catalogue (API d'avant) : tout, comme avant. `identity_verification` n'entre PAS dans `GROUPES_DE_PREFERENCES` (la parité avec `PreferenceResolver::EVENTS` l'interdit) : rangée à part (`GROUPE_DES_IMPOSES` → « Alertes », en tête), canaux fixes cochés et désactivés, « Toujours envoyée : sécurité du compte. » ; au bureau « — » sur les autres canaux, au téléphone seules ses puces fixes. Groupes vides masqués ; les deux groupes ouverts sont les deux premiers VISIBLES.

**Mes avis (AC1-AC3)** — tête : moyenne, nombre et barres 5 → 1 tirés de la MÊME `meta.distribution` (la somme des barres = « N avis reçus ») ; pour l'agent, `subject_type=agent` (l'ensemble de sa fiche publique, une requête de plus — `ProfileReviewsList.test.tsx` adapté pour ne pas la compter) ; sans répartition, la note de la fiche seule, comme avant. « N avis en attente de validation » : `meta.pending_count` de la boîte (à gauche de « Filtres » au téléphone, sous les filtres au bureau), rien à 0. Ensembles comparés : la fiche publique compte les avis `is_approved` dont l'agent est le sujet (`PublicAgentController::show`), la boîte `subject_type=agent` les mêmes pour un agent seul — mais un agent AUSSI admin d'agence lit, par `ReceivedReviews::for()` (`orWhere agency_id`), les avis d'agent de toute l'agence : sa tête dit alors des chiffres d'agence. Bail clôturé : `lease_closed` marque le groupe de `data` qui propose déjà ce bien (même sous une réservation), sinon forme le sien — une seule carte, comptée une fois dans « À laisser » ; au BUREAU, la carte compacte « Bail clôturé le 31 oct. · … » / « Noter » ouvre le formulaire de ce groupe ; au téléphone (que la maquette ne dessine pas), le formulaire d'emblée. Date du jour lue en UTC. Écart maquette assumé (comme TCK-2863) : sous-titre « Votre avis sur votre ancien logement », pas « Ousmane Niang, locataire ».

**Sommaire du bailleur (AC4-AC6)** — `faitsDuSommaire` lit en plus, et seulement pour qui en a l'usage : `GET /api/me/pieces` quand le PROFIL ACTIF est le bailleur (l'encart mène à `/app/pieces`, qui lit ce même profil), `GET /api/me/payout-methods` pour bailleur et prestataire ; non lus ou illisibles : rien n'est déduit. `aRegler()` reste la seule source du nombre, des points et des encarts : `pieces` (point sur « Sécurité », « 1 sur 2 envoyées » au bureau) et `rib` (point sur « Moyens de versement », seulement un `bank_transfer` `to_confirm` — un Wave non vérifié n'est pas réglable par le titulaire ; l'API rendant `to_confirm` pour TOUT moyen non vérifié, la liste ne dit « À confirmer » / « En revue » que d'un compte bancaire, « En attente de vérification » pour un numéro mobile). **Écart maquette** : la maquette n'a qu'un encart, le compte bancaire à confirmer en a aussi un (« Confirmez votre compte bancaire » / « Envoyer le RIB ») — la contrainte « une seule source » l'emporte, et « 2 réglages » compte bien deux encarts. Détails : « Wave · un compte à confirmer », « Pièces d'identité à envoyer ». « Envoyer le RIB » (PayoutMethodsSection) : choix d'un PDF/image → `POST …/bank-statement` (step-up résolu par `useApiMutation`) → « RIB envoyé », `router.refresh()` (les points du layout sont serveur), relu « En revue ». Page réunie : `/app/profile/payouts` rend en plus le bloc de l'annuaire (`#annuaire`, `max-md:hidden`) à qui a la rangée ; au bureau, l'entrée « Annuaire public » y mène ; `/app/profile/directory` reste (téléphone, ancienne URL).

**Non livré** : AC5 bis — `payout_day` n'est servi nulle part (TCK-2909 le pose sur `owner_profiles`, rendu par le détail du personnel) : rien à lire, aucune forme devinée. AC8, AC-F1..F3 : non mesurés (pas de navigateur dans ce lot).

Tests : `NotificationPreferencesMatrix.tck-2864`, `ProfileReviewsList.tck-2864`, `PayoutMethodsSection.rib.tck-2864`, `sommaire/__tests__/bailleur.tck-2864`, et le câblage : `lib/profil/__tests__/faits-du-sommaire.tck-2864` (pièces lues sous le seul profil bailleur actif, échec → `null`), `persona-du-profil.tck-2864`, `profile/payouts/__tests__/page.tck-2864` (bloc de l'annuaire), `profile/notifications/__tests__/page.tck-2864` (persona passée). 20 ablations, toutes rouges puis restaurées (md5). Adaptés : `PayoutMethodsSection.test.tsx` (mocks du RIB, du routeur, du toast), `ProfileReviewsList.test.tsx` (la requête de tête de l'agent n'est pas comptée).

**Re-mesure des restes (ECARTS-2, 2026-11-16)** — AC5 bis livré depuis : `GET /api/me/payout-methods` sert `meta.payout_day` (et `payout_day_source`) par `PayoutDay::of` — jour du mandat (TCK-2909), sinon celui de l'agence (TCK-2915) —, sur le seul profil bailleur actif de l'utilisateur (`PayoutMethodController.php:35-45`, test `OwnerStatementPayoutDetailsTest.php:149-160`) ; `PayoutMethodsSection.tsx:74,184` affiche « reversements du {jour} de chaque mois » sous le moyen par défaut, rien si null (test `PayoutMethodsSection.jour.tck-2909`). Rien à corriger.
