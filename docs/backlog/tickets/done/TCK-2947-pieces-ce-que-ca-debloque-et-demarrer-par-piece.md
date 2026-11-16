---
id: TCK-2947
title: "Vos pièces : « Ce que ça débloque » au bureau, le délai de vérification, et « Démarrer » pièce par pièce"
status: done
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2944]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#42-kycdossier-"
tags: [front, entree, pieces, demarrer, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le nouvel entrant sait ce que chaque pièce lui ouvre, quand elle sera vérifiée, et voit dans « Démarrer » chaque pièce qui lui manque.

## Contrat de données

- Étapes par pièce de « Démarrer » (TCK-2944).
- Ce que débloque une pièce : à établir dans le code (RIB → reversement, pièce d'identité → signature), voir contraintes.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-assistants`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-assistants-a.tsx`, visionneuse `?p=app-entree-assistants&a=a`, **e3 « Pièces (/app/pieces) »** :
  - **bureau** : aside « Ce que ça débloque » (RIB → « le reversement de tes loyers, le 10 de chaque mois » ; pièce d'identité → « la signature de tes mandats et de tes baux », `:850-866`) au-dessus de la légende des trois états ;
  - **téléphone et bureau** : « {agence} les vérifie sous 48 h. Tu peux utiliser ton espace en attendant. » (`:746`, `:841`) ;
  - **bureau, coque** : le groupe « Démarrer » liste les pièces une à une.
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-assistants e3, « écarts couverts » 9, 12 ; fiche TCK-2614 (`[1]`, `[2]`, `[4]`).

## Contraintes strictes (métier)

- **Promesses vérifiées** (motif de l'écart TCK-2614 `[2]`) : une ligne de « Ce que ça débloque » n'est écrite que si le code la tient (le reversement exige-t-il le RIB vérifié ? la signature exige-t-elle la pièce d'identité ?). L'implémenteur vérifie chaque règle dans l'API et ne rend que les lignes vraies ; « le 10 de chaque mois » seulement si c'est la date réelle des reversements de l'agence.
- « sous 48 h » seulement si un délai de vérification est un engagement (règle ou réglage) ; sinon « {agence} les vérifie. Tu peux utiliser ton espace en attendant. » et la fiche garde l'écart avec ce motif.
- « Démarrer » lit les étapes `piece:*` de l'API (TCK-2944) pour le bailleur, l'agent et le prestataire ; l'étape `kyc` de l'agence (vérification) garde son libellé et son lien.
- Libellés `fr`/`en`/`wo` (`wo` = français).

## Delta à produire

- [ ] Aside « Ce que ça débloque » (lignes vraies seulement).
- [ ] Phrase du délai de vérification.
- [ ] Groupe « Démarrer » pièce par pièce (colonne, tiroir, page « Démarrer » si elle existe).
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — À 1440, `/app/pieces` d'un bailleur rend l'aside « Ce que ça débloque » ; ses lignes sont exactement celles d'une liste déclarée où chaque ligne cite la règle de l'API qui la tient (fichier:ligne, relevé dans la PR) ; un test compare les lignes rendues à cette liste. La légende des trois états reste.
- [ ] AC2 — La phrase du délai porte « sous 48 h » si et seulement si la règle existe ; sinon la variante sans délai.
- [ ] AC3 — Pour un bailleur à qui manquent RIB et pièce d'identité, « Démarrer » liste « RIB » et « Pièce d'identité » comme deux étapes ; après envoi du RIB, son étape change d'état ; l'étape unique « Vos pièces » n'apparaît plus.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2614 mise à jour (entrées couvertes retirées, motifs réécrits pour les promesses non tenues).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e3 ne rend aucun écart non expliqué.

## Hors périmètre

- La liste des étapes côté API (TCK-2944).

## Notes d'implémentation

2026-11-15 (implementing-specs) — décisions mineures tranchées par l'agent (consigne du porteur : « valide tes choix »).

- **Promesses re-mesurées dans l'API — aucune ligne de « Ce que ça débloque » n'est tenue** :
  - RIB → reversement : un reversement se prépare et se paie sur une destination de paiement (`PayoutMethod`, vérifiée par
    un membre de l'agence — `takussan-api/app/Services/Payout/PayoutPreparationService.php:89-101`, `PayoutMethodService.php`),
    jamais sur le RIB envoyé comme pièce (`DocumentType::Rib` n'est lu que par l'envoi et `PiecesDuProfil`). « Le 10 de chaque
    mois » est faux : le jour est `owner_profiles.payout_day` (1-28) ou celui de l'agence (`PayoutMethodController.php:37-45`).
  - Pièce d'identité → signature : `LeaseSignatureService` / `LandlordSignatory` ne lisent aucune pièce ; aucun mandat ne se
    signe en ligne. Plus largement, « requise ne bloque rien » (`PiecesDuProfil`, en-tête).
  - Donc la liste déclarée `takussan-web/src/lib/pieces/ce-que-ca-debloque.ts` (`CE_QUE_CA_DEBLOQUE`, chaque ligne avec sa
    citation `regle`) est **vide** ; `CeQueCaDebloque` ne rend aucune carte sans ligne ; la légende des trois états reste.
    **AC1 partiel** : l'aside n'est pas rendu, par la contrainte « promesses vérifiées » qui prime sur l'AC.
- **Délai (AC2)** : aucune règle ni réglage de délai de vérification. Le vérificateur n'est pas non plus l'agence :
  `POST /api/documents/{document}/verify` est réservé au super-admin (`DocumentController.php:271-276`) et aucun écran ne
  l'appelle. Décision (la plus sûre) : ni « sous 48 h » ni « {agence} les vérifie » ; la phrase sourcée de TCK-2614 reste
  (« Vous pouvez utiliser votre espace en attendant. »). Test : `vos-pieces.tck-2947.test.tsx`.
- **« Démarrer » pièce par pièce (AC3)** : `lib/navigation/demarrer.ts` connaît `piece:<code>` pour chaque code de
  `CODES_DE_PIECE` (même table que l'écran), tous vers `/app/pieces`, libellés `nav.sidebar.demarrer.etapes.pieces.<code>`
  (« Envoyer votre RIB », « Envoyer votre pièce d'identité »…). L'ancienne étape unique `pieces` et l'étape `kyc` du
  bailleur ne sont plus connues (l'API ne les rend plus) ; `kyc` reste l'étape de vérification de l'agence, libellé et lien
  inchangés. Clés retirées : `etapes.espace.pieces`, `etapes.bailleur.kyc`, `accueil.bailleur.demarrer.{etapes,enPhrase}.kyc`.
- **Décision : une étape faite SORT du groupe** (règle AC5 de TCK-2479 gardée) et compte dans « n sur m » — c'est le
  « change d'état » de l'AC3 ; pas de ligne barrée comme la maquette. Écart écrit dans la fiche TCK-2614.
- **Accueil du bailleur** (`DemarrerDuBailleur`) : il ne connaissait que `kyc` → avec l'API de TCK-2944 il taisait les
  pièces. Il dit désormais `piece:cni|rib|ninea` (« Envoyez votre RIB ») ; la phrase du bureau ne promet plus les
  reversements (« Envoyez votre RIB depuis « Vos pièces ». »).
- **Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2614.json` (AC-F1)** : entrée « coque / Démarrer » réécrite (pièces une à
  une couvertes ; restent le barré, la barre de progression, « Vérifier mon numéro ») ; motifs de l'aside et du délai
  complétés des citations ci-dessus. **AC-F2 non mesuré** (consigne du lot : pas de relevé au navigateur).
- Tests : `vos-pieces.tck-2947.test.tsx` (4, neuf), `demarrer.test.ts` (+6, 2 réécrits), `DemarrerDeLEspace.test.tsx`,
  `AppSidebar.test.tsx`, `accueil-bailleur.tck-2850.test.tsx` mis à jour ; voisins (routes-atteignables, palette,
  préférences, AppSidebar.*, vos-pieces.tck-2614) verts. Ablations (une à une, restaurées par `cp`, vérifiées par md5/cmp) :
  étape `piece:*` sans lien → 3 rouges ; accueil sans les pièces → 3 rouges ; carte jamais rendue → 1 rouge.
