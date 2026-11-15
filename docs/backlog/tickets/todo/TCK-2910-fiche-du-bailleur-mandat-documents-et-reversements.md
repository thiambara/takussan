---
id: TCK-2910
title: "Fiche du bailleur : « Mandat de gestion signé » et « Ajouter » dans Documents, versement et dates du mandat, adresse et référent, encaissements, nature, moyen et reçu des reversements, et le « ⋯ » du téléphone"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2909]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#28-payout-"
tags: [front, bailleurs, mandat, reversements, audit-ux, app]
---

## Objectif utilisateur

L'agent ouvre la fiche d'un bailleur et y trouve son mandat entier — dates, versement, référent, PDF signé — et, pour chaque reversement, ce que c'était, comment il est parti, et le reçu à lui renvoyer.

## Contrat de données

- Mandat (dates, `payout_method`, `payout_day`, `referent_agent_id`), adresse, `collections_count`, pièce « mandat », dépôt sur `owner_profile`, `nature` et avis PDF d'un reversement : TCK-2909.
- Liste des bailleurs : déjà conforme, sauf le bouton « Filtres et tri » du téléphone.

Audit (`audit-f4-patrimoine.md`, app-bailleurs) :

- **e0 Liste** : bouton « Filtres et tri » (curseurs) à droite de la recherche absent au téléphone (écart accepté : « aucun filtre au-delà des trois vues »).
- **e1 Fiche** : ligne « Mandat de gestion signé » et « Ajouter » de la carte Documents ; « Versement : virement, avant le 10 » ; dates du mandat ; adresse et référent au bureau ; « 9 encaissements » sous Encaissé ; nature et moyen de chaque reversement + « Reçu » ; « ⋯ » d'en-tête au téléphone. Fiche `TCK-2641.json` a-1-bureau.
- La carte d'invitation en attente n'a jamais été vue au navigateur (aucune dans la démo).

## Direction UX / Artistique

**Référence de fidélité** : page `app-bailleurs`, approche `a`, fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-bailleurs.tsx` :

- **e0 « Liste »** — **téléphone** : le bouton rond « Filtres et tri » (`SlidersHorizontal`) à droite de la recherche, qui ouvre une feuille avec le tri (nom, reste à verser, dernier versement) et les trois vues.
- **e1 « Fiche du bailleur »** — `MobileAFiche` (l. 422-505) et `BureauAFiche` (l. 506-) :
  - téléphone et bureau : carte « Documents et identifiants » avec l'action « Ajouter » et la ligne « Mandat de gestion signé — 12 mars 2025 · PDF, 3 pages » (`LignesDocuments`, l. 206-216) ; réglages du mandat avec la ligne « Versement — Virement, avant le 10 du mois » (`ReglagesMandat`, l. 411-420) et les dates « 12 mars 2025 → 11 mars 2028 » ; sous « Encaissé », « 9 encaissements » ; chaque reversement : libellé de nature (« Acompte de novembre », « Solde d'octobre »), moyen (« Virement CBAO ») et le geste « Reçu » (l. 114-118) ;
  - **bureau** : l'adresse (icône `MapPin`) dans le bloc d'identité et « Particulier · suivi par Awa Diop » (l. 535) ;
  - **téléphone** : le « ⋯ » de l'en-tête (gestes secondaires : modifier le mandat, accès et départ).

## Contraintes strictes (métier)

- Modifier le mandat : même capacité que le plafond de travaux aujourd'hui ; un agent sans elle voit les valeurs sans « Modifier ».
- « Ajouter » dépose une pièce sur le profil du bailleur (cible `owner_profile`) par le parcours d'ajout du coffre (photo ou fichier, nommer et ranger) — aucun identifiant saisi.
- Aucun champ vide inventé : sans dates de mandat, la ligne dit « Dates du mandat à renseigner » au lecteur qui peut modifier, et n'est pas rendue aux autres.
- « Accès et départ » (ajout hors maquette, TCK-2753) reste.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Liste (téléphone) : « Filtres et tri ».
- [ ] Fiche : documents (mandat, Ajouter), réglages (versement, dates, modifiables), adresse et référent, encaissements, reversements (nature, moyen, Reçu), « ⋯ » au téléphone.
- [ ] Mettre à jour la fiche de fidélité `TCK-2641.json`.
- [ ] Tests : ligne du mandat rendue depuis la réponse ; « Ajouter » envoie la cible `owner_profile` ; enregistrement du versement et des dates ; « Reçu » vers `…/notice/pdf` ; « 9 encaissements ».

## Critères d'acceptation

- [ ] AC1 — La fiche d'un bailleur dont le détail porte une pièce « mandat » rend « Mandat de gestion signé » avec sa date, et l'ouvrir mène à la fiche du document.
- [ ] AC2 — « Ajouter » de la carte Documents ouvre l'ajout ; le document envoyé porte la cible `owner_profile:{id}`.
- [ ] AC3 — Les réglages du mandat rendent « Versement — Virement, avant le 10 du mois » et « 12 mars 2025 → 11 mars 2028 » quand l'API les sert ; les modifier envoie `PATCH /api/owners/{id}` avec les champs du mandat.
- [ ] AC4 — À 1440, le bloc d'identité rend l'adresse et « suivi par <référent> ».
- [ ] AC5 — Sous « Encaissé », « 9 encaissements » quand `collections_count = 9` (forme au singulier testée pour 1).
- [ ] AC6 — Chaque reversement rend sa nature, son moyen, et un bouton « Reçu » qui télécharge `GET /api/payouts/{id}/notice/pdf`.
- [ ] AC7 — À 390, l'en-tête de la fiche porte un bouton « Plus d'actions » ; la liste porte « Filtres et tri », dont le tri change le paramètre `sort` envoyé (tris acceptés par `GET /api/owners` ; un tri absent de l'API est ajouté à TCK-2909 avant ce ticket, jamais trié côté client).
- [ ] AC8 — Vérifier au navigateur une carte d'invitation en attente (Renvoyer · Révoquer) en créant une invitation de test ; corriger si absente.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2641.json` :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2641.json` liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les revenus vus par le bailleur (TCK-2916).

## Notes d'implémentation

**2026-11-15 — implémentation (agent, vague 92).** Prémisses re-mesurées : justes, sauf deux écarts. (1) Le tri « Dernier versement » n'existait pas dans `GET /api/owners` (seuls `name`, `remaining_to_pay`, `id`, `created_at`, `status`) : ajouté ici, côté API, `AllowedSort::custom('last_payout_at', OwnerLastPayoutSort)` — même sous-requête que la colonne de la ligne (`OwnerDirectory::lastPayoutAt()`, extraite), et comme le tri par reste, hors lecteur du relevé il ne range que par id (`OwnerLastPayoutSortTest`, 2 tests, 2 ablations rouges). (2) Défaut voisin corrigé : `documentTypeSchema` (zod) ne recevait pas `management_mandate`, que `DOCUMENT_TYPE_UPLOAD_ORDER` offre depuis TCK-2909 — le mandat choisi au coffre ne partait jamais ; `documentableTypeSchema` et `DocumentableType` reçoivent `owner_profile` (+ `documents.entities.owner_profile`).

**Fiche** (`FicheDuBailleur`, `PiecesDuBailleur`) — AC1 : « Mandat de gestion signé » depuis `mandate_document`, détail « 12 mars 2025 · PDF, 245 Ko » (date du dépôt ; la TAILLE, l'API ne compte pas les pages), lien vers `/app/documents/{id}` ; la pièce n'est pas répétée dans la liste du coffre. AC2 : « Ajouter » (en-tête de la carte, téléphone et bureau) ouvre `AjoutAuCoffre` en mode **rangement imposé** (`impose: { type: 'owner_profile', id }`, nouveau) : même parcours photo/fichier, nommer et ranger, « Rangé dans » le nom du bailleur sans « Changer », mandat coché par défaut, aucune pièce KYC proposée (l'API les refuse sur un profil, 422) ; après le dépôt, la liste et la page se relisent. AC3 : lignes « Versement » (« Virement, avant le 10 du mois » — nom court du moyen, `owners.fiche.moyens`) et « Mandat » (« 12 mars 2025 → 11 mars 2028 », ou « Depuis le… » / « Jusqu'au… ») ; sans moyen ni jour, pas de ligne ; sans dates, « Dates du mandat à renseigner » au seul lecteur qui peut modifier. « Modifier » (ou « Modifier le mandat » du « ⋯ ») ouvre un seul formulaire, remis aux valeurs de la fiche à CHAQUE ouverture (une saisie annulée ne revient pas), (plafond, moyen, jour 1-28, début, fin, référent parmi `GET /api/agencies/{id}/members?filter[assignable]=1`) qui n'envoie que les clés CHANGÉES (`changementsDuMandat`, `lib/owners/mandat.ts`) ; rien de changé → rien ne part (le corps vide serait un 422) ; `updateOwnerWorksThreshold` remplacé par `updateOwnerMandate`. AC4 : au bureau, l'adresse (MapPin) et « Particulier · suivi par Awa Diop » (« (plus dans l'agence) » si le référent n'est plus du personnel actif). AC5 : « 9 encaissements » sous Encaissé (bureau), singulier épinglé ; en plus, « le 5 nov., par virement » sous Déjà versé (moyen du dernier versement). AC6 : chaque reversement rend sa nature (« Acompte de novembre », « Solde d'octobre » avec élision, restitution, remboursement, facture ; « Reversement de {mois} » pour un reversement sans nature), son moyen (colonne dès 1440, sous le libellé avant), et « Reçu » (avis `GET /api/payouts/{id}/notice/pdf` par `fetch` porteur du jeton, partagé au téléphone / téléchargé) pour un reversement au bailleur TERMINÉ — les autres gardent leur statut ; `nature` ajouté à `PAYOUT_LIST_FIELDS`. AC7 : « ⋯ » de l'en-tête du téléphone par `DeclarerEnTete actions` (Modifier le mandat → ouvre l'édition et y défile ; Accès et départ → défile jusqu'à la section, après la fermeture de la feuille — défilement NON mesuré sur téléphone), absent sans geste.

**Liste** (`OwnersList`, `lib/owners/carnet.ts`) — AC7 : bouton rond « Filtres et tri » (SlidersHorizontal, 44 px) à droite de la recherche au téléphone, feuille du bas avec le tri (Nom, Reste à verser, Dernier versement ; tris d'argent au seul lecteur du relevé) et les trois vues ; `?tri=` dans l'URL (le tri par défaut ne s'y écrit pas), dans la clé de requête, et envoyé en `sort` (`name`, `-remaining_to_pay`, `-last_payout_at`) ; « Tri : … » au-dessus des cartes suit le choix.

**AC8 et fidélité (AC-F2 à F6) : non mesurés** — consigne du lot, aucun navigateur (l'API et le front servis tournent sur un autre arbre). La carte d'invitation reste épinglée par `OwnersList.carnet.tck-2641` et `OwnersList.invitation-en-attente.p237-01` (verts). Fiche de fidélité `TCK-2641.json` : quatre écarts levés retirés (référent/adresse/versement/mandat/encaissements/nature/Reçu, « Ajouter », « ⋯ », « Filtres et tri »), cinq ajoutés (taille au lieu des pages, « Virement » sans la banque CBAO, données absentes de la démo, statut au lieu de « Reçu » avant versement, contenu de la feuille).

Tests : front `FicheDuBailleur.mandat.tck-2910` (14), `OwnersList.filtres-et-tri.tck-2910` (3), `AjoutAuCoffre.profil.tck-2910` (3), `carnet.test` (+1) ; test périmé mis à jour (`FicheDuBailleur.tck-2641` : un reversement versé porte « Reçu », plus « Effectué »). Back `OwnerLastPayoutSortTest` (2), `OwnerProfileListFiguresTest` rejoué. 17 ablations (2 back, 15 front), toutes rouges puis restaurées (md5). Recensements `relais-bff.tck-968` et `code-mort.tck-917` joués (un `fetch` porteur de plus, une exportation retirée) : verts. Joués aussi : tout `components/owners`, `app/(dashboard)/app/owners`, `components/documents/coffre`, `components/documents/__tests__`, `lib/schemas/__tests__/document`, `lib/owners`, `en-tete-mobile.tck-2617` (240 verts) ; les trois gardes d'architecture ; `tsc`, ESLint, `check:i18n`, gardes racine et front vertes (seule `check-i18n-namespaces` rouge, sur la frontière `reports` d'un autre agent).
