---
id: TCK-2898
title: "Coffre de documents : « Remplace la carte qui expire » et la photo recadrée à l'ajout, le sous-dossier du bail chez le bailleur, « Devis et rapports » et le PDF des factures chez le prestataire"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2897]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [front, documents, coffre, bailleur, prestataire, locataire, audit-ux, app]
---

## Objectif utilisateur

Le locataire qui photographie sa nouvelle carte d'identité remplace l'ancienne d'un geste, avec une photo droite et recadrée ; le bailleur trouve le bail de sa locataire rangé sous le bien ; le prestataire retrouve devis, rapports et factures en PDF.

## Contrat de données

- Sous-dossier de bail (bailleur), dossier « Devis et rapports » et PDF de facture (prestataire) : TCK-2897.
- Remplacer : `POST documents/{document}/versions` existe (versions, TCK-2656 lot 3) — aucun endpoint neuf.
- Recadrage et redressement : dans le navigateur, avant l'envoi ; le fichier envoyé est l'image recadrée (bornes de taille actuelles).

Audit (`audit-f4-patrimoine.md`, app-documents) :

- **e0** : fin de ligne = chevron au lieu de l'icône Télécharger (« écart accepté »).
- **e1** : « Redressée et recadrée » non tenu (aucun redressement) ; « À renouveler » rendu seulement s'il y a une pièce à échéance — à vérifier au navigateur.
- **e2** : interrupteur « Remplace la carte qui expire » absent (décision L2-1 (a) de TCK-2656 : le remplacement passe par la fiche).
- **e8** : sous-dossier « Bail de … » dans le dossier du bien absent ; « Relevés et factures » de la maquette rendu en deux dossiers (« Relevés et attestations », « Mes factures ») ; biens sans document comptés et non listés (décision 1 a de TCK-2656).
- **e9** : « Devis et rapports » absent ; factures sans geste de fin de ligne ; variante jamais relevée sur un vrai profil prestataire.

## Direction UX / Artistique

**Référence de fidélité** : page `app-documents`, approche `a`, fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-documents-a.tsx` et `app-documents-pieces.tsx` :

- **e0 « Locataire — le coffre »** (téléphone et bureau) : l'icône Télécharger en fin de ligne d'un document, qui télécharge sans ouvrir la fiche.
- **e1 « Locataire — ajouter »** (`MobileAjouter`, l. 152-226 ; bureau `BureauAjouter`) : la tuile « Prendre une photo — Redressée et recadrée toute seule » ; après la prise, l'aperçu « Photo nette, recadrée » (l. 244) avec « Changer ». Téléphone : redressement et recadrage proposés après la prise (coins ajustables, rotation) ; bureau : même étape dans la modale.
- **e2 « Locataire — nommer et ranger »** (`Remplace`, l. 216-226) : quand une pièce du même genre expire bientôt, l'interrupteur « Remplace la carte qui expire — L'ancienne reste dans les versions », activé par défaut — téléphone et bureau.
- **e8 « Bailleur — un dossier par bien »** (`COFFRE_BAILLEUR`, `app-documents-pieces.tsx` l. 100-130) : dans le dossier du bien, la ligne de dossier « Bail de Fatou Kiné Diallo — Contrat, état des lieux · 2 documents » ; le dossier « Relevés et factures » (relevés mensuels, « Factures d'intervention 2026 — 9 factures · 1 521 000 F ») ; chaque bien listé, même vide.
- **e9 « Prestataire — factures et pièces »** (`PUCES_PRESTATAIRE`, l. 907 ; arbre l. 932) : puces « Tout · Factures · Devis et rapports · Mes pièces » comptées au téléphone ; le dossier « Devis et rapports » (replié « 1 devis · 12 rapports de fin d'intervention ») ; chaque facture avec son geste Télécharger (PDF).

## Contraintes strictes (métier)

- Remplacer = **nouvelle version** du document qui expire (l'ancienne reste dans les versions), jamais un second document ; interrupteur désactivé → un document neuf, comme aujourd'hui.
- Un document généré n'a ni versions ni remplacement (ADR-0099 § 3).
- Lister chaque bien du bailleur, même sans document, **renverse la décision 1 a de TCK-2656** : le faire ici, avec un état « Aucun document » par bien.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Ligne du coffre : icône Télécharger en fin de ligne (téléphone et bureau).
- [ ] Ajout par photo : étape de redressement / recadrage (coins, rotation), image recadrée envoyée.
- [ ] « Nommer et ranger » : interrupteur « Remplace la carte qui expire » quand une pièce du même genre expire dans la fenêtre de 60 jours ; activé → nouvelle version.
- [ ] Bailleur : sous-dossier de bail dans le dossier du bien ; « Relevés et factures » en un dossier ; biens vides listés.
- [ ] Prestataire : puces comptées, dossier « Devis et rapports », Télécharger le PDF d'une facture.
- [ ] Mettre à jour `TCK-2656.json` (a-8, a-9, L2-1, e0) : ces écarts disparaissent.
- [ ] Tests : remplacement → `POST documents/{id}/versions` et non `POST documents` ; recadrage envoie une image aux nouvelles dimensions ; sous-dossier rendu depuis la réponse ; « Devis et rapports » ; geste Télécharger d'une facture vers `…/pdf`.

## Critères d'acceptation

- [ ] AC1 — Chez un locataire dont la carte d'identité expire dans 42 jours, ajouter une nouvelle photo de carte d'identité avec « Remplace la carte qui expire » activé envoie `POST /api/documents/{id de l'ancienne}/versions` ; le coffre compte toujours une seule carte d'identité, dont la fiche montre 2 versions.
- [ ] AC2 — Le même ajout avec l'interrupteur désactivé envoie `POST /api/documents` (deux documents).
- [ ] AC3 — Sans pièce du même genre qui expire, l'interrupteur n'est pas rendu.
- [ ] AC4 — Après la prise de photo, l'utilisateur peut tourner l'image d'un quart de tour et déplacer un coin ; le fichier envoyé a les dimensions du recadrage choisi.
- [ ] AC5 — Chez un bailleur, le dossier du bien rend une ligne de sous-dossier « Bail de <locataire> » qui s'ouvre sur le contrat ; un bien sans document est listé avec « Aucun document ».
- [ ] AC6 — Chez un bailleur, les relevés et les factures d'intervention sont dans un seul dossier « Relevés et factures ».
- [ ] AC7 — Chez un prestataire, la puce « Devis et rapports » porte le compte servi et filtre sur ce dossier ; le geste Télécharger d'une facture appelle `GET /api/service-provider-bills/{id}/pdf`.
- [ ] AC8 — Chaque ligne de document téléversé ou généré du coffre porte un bouton « Télécharger » en fin de ligne, distinct de l'ouverture de la fiche.
- [ ] AC9 — Vérifier au navigateur, avec un vrai profil prestataire actif, que « Mes factures », « Devis et rapports » et « Mes pièces » sont rendus ; avec une pièce qui expire dans 60 jours, que « À renouveler » apparaît dans la feuille d'ajout (e1) ; corriger si absent.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2656.json` (écrans e0, e1, e2, e8, e9) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2656.json` (écrans e0, e1, e2, e8, e9) liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La lecture de la date d'expiration sur la photo (« Lu sur la photo », TCK-2899).
- La vue de l'agence (TCK-2896).

## Notes d'implémentation

_(à remplir par implementing-specs)_
