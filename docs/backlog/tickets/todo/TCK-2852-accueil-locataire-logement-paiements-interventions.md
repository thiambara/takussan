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

Livré le 2026-11-15 (arbre `feat/audit-manques-2026-11-15`), sur les champs de TCK-2851.

**Re-mesure de la prémisse**
- Interventions : la page du locataire ne lit PAS `filter[requester_id]` mais `useDemandesDuLocataire`
  (portée `visibleTo` de l'API, sans colonne de coût) et `repartirDemandes`. Le bloc reprend cette
  lecture (même clé, même cache) : « en cours » = terminées à confirmer + en cours.
- Écrire : la conversation directe naît au premier envoi (`initial_message`, TCK-2632) ; le geste est
  `EcrireA` (fil existant → `/app/messages?conversation=…`, sinon le brouillon, puis la même URL).
- Moyens en ligne : `online_means` (TCK-2851). **Free Money n'a pas de pilote** : l'API ne le sert
  jamais, la ligne ne le cite donc jamais aujourd'hui (la maquette le cite).

**Ce qui est livré**
- `MonLogement` (téléphone) : photo 64 px, « Bail jusqu'au … » à la place du loyer (le loyer reste sans
  date de fin), tête cliquable vers `/app/leases/{id}` (le chevron de la maquette), « Contacter
  l'agence » détaillé « agence · agent ».
- `EntreeDansLesLieux` (neuf) : « Votre entrée dans les lieux » + « N étapes restantes », étapes
  cochées / à faire, sur le bail du résumé du loyer ; au téléphone sous l'intertitre « À finir », après
  « Mon logement » ; au bureau à gauche. Disparaît (intertitre compris) quand la check-list est finie.
  Les étapes et liens viennent de `TenantOnboardingChecklistWidget` (exports `ITEM_ORDER`,
  `isItemDone`, `lienDeLEtape`).
- Bandeau de tête : retiré pour le persona locataire ; GARDÉ pour un non-locataire qui a le rôle
  `tenant` (bailleur qui loue aussi, TCK-492).
- `CarteDuLoyer` : ligne des moyens sous « Payer » (`online_means` → `payments.methods.*`, code
  inconnu ignoré, vide → pas de ligne).
- `DerniersPaiements` (neuf, bureau) : 3 derniers paiements réglés, date · période · moyen (dès `lg`) ·
  montant · « Payé » · « Quittance », « Tous les paiements » → `/app/payments`. Même lecture que
  « Mon logement » (une requête). « Quittance » = loyer ou charges soldés ; c'est un bouton
  (téléchargement authentifié), pas un `<a>`.
- `CarteDuLogement` (neuf, bureau, droite) : photo 160 px, titre, « quartier, ville », « Bail jusqu'au
  … · loyer par mois », agent (avatar ou initiales, « agence · votre agent », « Écrire »). Sans agent :
  « Géré par {agence} » et « Appeler » si le téléphone est joignable, sinon aucun geste.
- `InterventionsEnCours` (neuf, bureau, droite) : liste (3 + « Voir les N interventions ») avec statut,
  ou « Aucune intervention en cours dans votre logement. », et « Signaler un problème ».
- Disposition : formes téléphone `md:hidden`, bureau `max-md:hidden` ; les blocs du produit (échéances,
  ce qui m'attend, documents) restent après ceux de la maquette.

**Écarts à la maquette (donnée)**
- L'adresse avec la rue (« Villa 9042, … ») : l'API ne sert que quartier et ville (TCK-2851).
- Les étapes de la check-list servie diffèrent de celles dessinées.
- La ligne d'en-tête « …, 2 étapes d'entrée à finir » n'est pas reprise (`ResumeDuLocataire` inchangé).
- « Free Money » : jamais servi (pas de pilote).
- Avec un agent, la carte du bureau ne répète pas « Géré par {agence} » (la maquette non plus) : l'agence
  est dans « {agence} · votre agent ».
- Une seule check-list, celle du bail du résumé du loyer : un locataire de plusieurs baux en cours en
  voyait une par bail dans l'ancien bandeau.
- Une demande terminée qui attend la confirmation du locataire figure dans « Interventions en cours »,
  avec le statut « Terminée » (le partage de la page Interventions).
- L'avatar de l'agent passe par la primitive `Avatar` (comme la messagerie), pas `next/image`.

**Mesures**
- `accueil-locataire.tck-2852.test.tsx` (15), `marqueur-accueil-agence.tck-1766`, `socle.tck-2622` et `gating-du-widget-locataire` mis à
  jour, tests du widget, `parametre-de-bail`, `routes-atteignables`, tests `payments/locataire` : verts.
- Ablations (une à une, restaurées par `cp`, md5 vérifié) : fin de bail masquée → AC1 rouge ; quittance
  sans condition → test « caution, pénalité » rouge ; moyens écrits en dur → AC5 rouge ; closes
  incluses → AC4 rouge ; `EcrireA` sur l'agence → AC3 rouge ; bandeau rendu au locataire → socle rouge ;
  « À finir » retiré de la page → socle rouge.
- eslint, `tsc --noEmit`, `check:i18n`, `check-i18n-namespaces`, `npm run check:*`, gardes racine verts
  (sauf `check-models-spec`, rouge sur `BookingDossierItem`, hors de ce ticket).
- **Non mesuré** : AC-F1 à AC-F3 (fidélité au navigateur, débordement à 1024 / 768) — pas de relevé au
  navigateur dans ce lot ; la fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2852.json` n'est pas écrite.
