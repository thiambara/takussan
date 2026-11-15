---
id: TCK-2852
title: "Accueil du locataire : « Mon logement » avec photo et « Bail jusqu'au », « À finir » sous le logement, « Wave · Orange Money · Free Money » ; au bureau, « Derniers paiements », « Interventions en cours » et la carte du logement avec l'agent et « Écrire »"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2851]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, accueil, locataire, audit-ux, app]
---

## Objectif utilisateur

Le locataire voit d'un coup son logement, ce qu'il doit, ce qu'il a déjà payé (avec ses quittances), ce qui est en cours chez lui, et à qui écrire.

## Contrat de données

- `GET /api/me/rent-summary` : `lease.end_date`, `lease.property.cover_url`, `lease.agent {user_id, name, avatar_url}` (et `online_means` si besoin) — **livrés par TCK-2851** ; `offline_payment` existe déjà.
- **Derniers paiements** : l'historique déjà lu par `CustomerPayments` (`/app/payments`, TCK-593) — les 3 derniers, avec la quittance (`/api/leases/{lease}/receipts/{payment}/pdf`, déjà appelé par `MonLogement.tsx:123`).
- **Interventions en cours** : `GET /api/maintenance-requests?filter[requester_id]={moi}` sur les statuts ouverts (même lecture que la page Interventions du locataire).
- **Check-list d'entrée** : `TenantOnboardingChecklistWidget` (lecture existante).
- **Écrire** : création d'une conversation directe existante (`POST /api/conversations`) avec `lease.agent.user_id`.

Relevé (audit-f3-coque.md, app-accueil e3 et app-coque e10) : bureau gauche = `CarteDuLoyer` seule (`(accueil)/page.tsx:231`) ; colonne = `MonLogement` (forme téléphone), « Échéances des 30 jours », « Ce qui m'attend », « Documents récents » ; check-list en bandeau de tête (`page.tsx:213`) ; aucun composant « derniers paiements » sous `components/accueil/` ; « Derniers paiements » et « Votre entrée dans les lieux » rangés en « donnée » par TCK-2625 alors que ce sont des sections retirées.

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-accueil-contenu.tsx` (`CarteLoyer` l. 918, `CheckListEntree` l. 956, `AccueilLocataireMobile` l. 979, `AccueilLocataireBureau` l. 1024), écran **e3 « Locataire »** d'`app-accueil.tsx`, approche a ; même contenu en app-coque e10 (bureau jamais relevé).

- **Téléphone** : « Mon logement » porte la **photo** du bien, « F3 à Sacré-Cœur 3 », « **Bail jusqu'au 31 août 2027** » (à la place du loyer mensuel), puis ses trois rangées (Signaler un problème, Dernière quittance, Contacter l'agence) ; **« À finir »** (« 2 étapes restantes », étapes cochées / à faire) **sous** « Mon logement », et non en bandeau de tête ; sous « Payer », la ligne « Wave · Orange Money · Free Money ».
- **Bureau** — deux colonnes de la maquette :
  - **gauche** : la carte du loyer, puis **« Derniers paiements »** (date · période · moyen · montant · « Payé » · « Quittance », et « Tous les paiements ») ; « Votre entrée dans les lieux » tant que la check-list n'est pas finie ;
  - **droite** : la **carte du logement** (photo de 160 px, adresse, « Bail jusqu'au … », « Géré par Dakar Immo », l'agent avec avatar, « Dakar Immo · votre agent » et le bouton **« Écrire »**), puis **« Interventions en cours »** (liste, ou « Aucune intervention en cours dans votre logement. ») avec « Signaler un problème ».
- Les blocs ajoutés par le produit (« Échéances des 30 jours », « Ce qui m'attend », « Documents récents ») ne passent jamais avant les blocs de la maquette.

## Contraintes strictes (métier)

- Pas d'agent (`lease.agent = null`) : la carte dit « Géré par {agence} » et « Écrire » écrit à l'agence (ou disparaît si l'agence n'a pas de canal), jamais un bouton qui échoue.
- « Quittance » seulement pour un paiement soldé qui en a une.
- « Wave · Orange Money · Free Money » ne cite que les moyens réellement ouverts.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] « Mon logement » téléphone : photo, fin de bail ; « À finir » sous le logement ; ligne des moyens.
- [ ] Bureau : « Derniers paiements », carte du logement avec l'agent et « Écrire », « Interventions en cours », « Votre entrée dans les lieux », disposition en deux colonnes.
- [ ] Tests : fin de bail affichée ; 3 derniers paiements avec quittance ; « Écrire » ouvre un fil avec l'agent ; état vide des interventions ; check-list sous le logement au téléphone.

## Critères d'acceptation

- [ ] AC1 — À 390 : « Mon logement » montre une image et « Bail jusqu'au 31 août 2027 » ; « À finir » est rendu après « Mon logement » dans l'ordre du document, et aucun bandeau de check-list n'est en tête.
- [ ] AC2 — À 1440, locataire avec 3 paiements soldés : « Derniers paiements » liste 3 rangées portant chacune « Payé » et un lien « Quittance », et « Tous les paiements » mène à `/app/payments`.
- [ ] AC3 — À 1440 : la carte du logement nomme l'agent du bail ; « Écrire » ouvre `/app/messages` sur un fil direct avec lui.
- [ ] AC4 — À 1440, sans intervention ouverte : « Interventions en cours » rend « Aucune intervention en cours dans votre logement. » ; avec une intervention ouverte, sa rangée et son statut.
- [ ] AC5 — Agence sans Free Money ouvert : la ligne ne cite pas « Free Money ».

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2852.json` : app-accueil e3 et app-coque e10 (bureau jamais relevé : vérifier aussi la place de la colonne droite), téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; « Derniers paiements », la carte du logement et « Interventions en cours » ne peuvent plus être rangés en « donnée ».
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- Les champs d'API : TCK-2851.

## Notes d'implémentation

_(à remplir par implementing-specs)_
