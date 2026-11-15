---
id: TCK-2908
title: "Biens : « Tous les bailleurs » au bureau, « vues · contacts · visites (30 j) » et « Offre Pro » sur les annonces, et la fiche Location complète (Validé, révision, avis d'échéance, moyen de paiement, collaborateur, intervention en cours)"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2905, TCK-2906, TCK-2915]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#15-leasepayment-"
tags: [front, biens, annonces, fiche, audit-ux, app]
---

## Objectif utilisateur

L'agent filtre son portefeuille par bailleur, juge une annonce sur ses 30 derniers jours, et lit sur la fiche d'un bien loué tout ce qui l'attend : révision, prochain avis, intervention en cours.

## Contrat de données

- `filter[owner_profile_id]`, `stats_30d` : TCK-2905 (`filter[user_id]` existe déjà pour un bailleur qui a un compte) ; liste des bailleurs : `GET /api/owners` (existant).
- `maintenance_summary` du bien, `next_revision_date` du bail : TCK-2906.
- Date du prochain avis d'échéance : TCK-2915.
- Déjà servis (vérifié à l'écriture) : `approved_at` du bien (`PropertyResource.php:334-345`) pour la pastille « Validé » ; `payment_method` de chaque échéance (`LeasePaymentResource.php:27`) ; les collaborateurs du bien (`include=collaborators`) ; le nom de l'offre de l'agence (`GET /api/me/subscription`, TCK-2669) pour « Offre Pro ».

Audit (`audit-f4-patrimoine.md`) : app-biens **e0** (bureau, filtre par bailleur), **e1** (chiffres de la carte, « Offre Pro »), **e2** (« Validé », « Révision possible le … », « avis d'échéance le … », moyen de paiement dans l'historique, « 1 collaborateur », carte « 1 intervention en cours » — **aucun code ne la rend**) ; fiches `TCK-2638.json` a-0-bureau, `TCK-2639.json` a-2.

## Direction UX / Artistique

**Référence de fidélité** : page `app-biens`, approche `a`, fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-biens.tsx` :

- **e0 « Liste — mode Gestion »** — **bureau seulement** : la liste déroulante « Tous les bailleurs » dans le panneau de filtres (l. 245). Téléphone : conforme.
- **e1 « Liste — mode Annonces »** — **téléphone et bureau** : la ligne de chiffres de la carte « 312 vues · 9 contacts · 3 visites (30 j) » (l. 415) ; « Offre Pro » à droite du quota (téléphone : bas de liste, l. 477-485 ; bureau : en-tête, l. 508-518).
- **e2 « Fiche — onglet Location »** — `MobileAFiche` / `BureauAFiche` (l. 595-815) :
  - téléphone et bureau : pastille « Validé » (l. 643, 706) à côté du statut ; ligne « Prochain loyer le 5 déc. — 2 150 000 F · avis d'échéance le 28 nov. » (l. 601) ; ligne « Révision possible le 1 juil. 2027 — Clause d'indexation annuelle » (l. 602) ; ligne de l'agent « Moussa Diallo — Agent principal · 1 collaborateur » (l. 674, 809) ; moyen de paiement dans chaque ligne d'historique des loyers (« Reçu le 29 oct. · Wave · quittance envoyée », l. 749-751) ;
  - **bureau** : la carte « 1 intervention en cours — Rideau métallique · devis attendu » dans la colonne de droite (l. 810), qui mène à l'intervention ; sans intervention ouverte, la carte n'est pas rendue.

## Contraintes strictes (métier)

- Filtrer côté serveur : la liste déroulante envoie `filter[owner_profile_id]` (jamais un filtre sur la page reçue).
- « Validé » se lit sur `approved_at` et reste distinct du statut « En ligne » (décision 2 de la maquette).
- « Offre Pro » n'est rendu qu'au personnel qui lit l'abonnement (403 `agency.staff_only` sinon : rien n'est affiché, aucune erreur).
- Sans `next_revision_date`, la ligne « Révision possible » n'est pas rendue ; sans date d'avis, la ligne du prochain loyer garde sa forme actuelle.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Liste (bureau) : « Tous les bailleurs ».
- [ ] Carte d'annonce : chiffres 30 j ; quota : « Offre Pro ».
- [ ] Fiche Location : « Validé », avis d'échéance, révision, moyen de paiement, collaborateurs, carte d'intervention en cours (bureau).
- [ ] Mettre à jour les fiches de fidélité `TCK-2638.json` et `TCK-2639.json` (écarts levés).
- [ ] Tests : paramètre `filter[owner_profile_id]` ; libellé « 9 contacts » / « 1 contact » ; carte d'intervention présente avec `open ≥ 1`, absente sinon ; « Validé » avec `approved_at` ; moyen de paiement dans l'historique.

## Critères d'acceptation

- [ ] AC1 — À 1440, choisir un bailleur dans « Tous les bailleurs » envoie `filter[owner_profile_id]={id}` et la table ne montre que ses biens.
- [ ] AC2 — Une annonce dont `stats_30d = {views: 312, contacts: 9, visits: 3}` rend « 312 vues · 9 contacts · 3 visites (30 j) » au téléphone comme au bureau ; « favoris » n'apparaît plus sur la carte.
- [ ] AC3 — Avec une offre nommée « Pro », la jauge du quota porte « Offre Pro » (téléphone : bas de liste ; bureau : en-tête).
- [ ] AC4 — La fiche d'un bien approuvé rend la pastille « Validé » ; un bien en attente de modération ne la rend pas.
- [ ] AC5 — La fiche d'un bien dont le bail a `next_revision_date = 2027-07-01` rend « Révision possible le 1 juil. 2027 » ; et la ligne du prochain loyer rend « avis d'échéance le … » quand la date est servie.
- [ ] AC6 — L'historique des loyers rend le moyen de paiement de chaque échéance payée (« Wave », « virement »).
- [ ] AC7 — La ligne de l'agent rend « Agent principal · 1 collaborateur » quand le bien a un collaborateur.
- [ ] AC8 — À 1440, un bien avec `maintenance_summary.open = 1` rend la carte « 1 intervention en cours » avec le titre de la demande, liée à `/app/maintenance/{id}` ; avec `open = 0`, aucune carte.
- [ ] AC9 — Vérifier au navigateur, sur un bien qui a une intervention ouverte, que la carte apparaît au bureau ; corriger si absente.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiches : `docs/qa/audit-ux-2026-11/fidelite/TCK-2638.json` et `TCK-2639.json` :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2638.json` et `TCK-2639.json` liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La visibilité « Réseau » (TCK-2907).

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, vague 92, worktree `feat/audit-manques-2026-11-15`). Aucune mesure au
navigateur (consigne du lot : l'API et le front servis tournent sur un autre arbre) : AC9 et AC-F2 à AC-F6 restent
**non mesurés** ; la fidélité est jugée à la lecture de la maquette (e0, e1, e2, téléphone et bureau).

**Prémisses re-mesurées — ce qui différait**
- `stats_30d` n'était PAS déclaré côté front (seuls `maintenance_summary`, `next_revision_date`,
  `next_due_notice_date` l'étaient) : ajouté à `PropertyListItem` ; `'stats30d'` ajouté à `InclusionDeGestion`.
- `published` se dit déjà « Validé » par `PropertyStatusBadge` (TCK-2638) : la pastille neuve n'est pas rendue
  pour ce statut (sinon « Validé » deux fois).
- `approved_at` n'est remis à nul qu'au refus (`PropertyModerationService::reject`) : la pastille se garde aussi
  sur le statut (`pending_review`, `rejected`, `draft` exclus) — un bien revenu en modération ne la porte pas.
- Le moyen de paiement de l'historique vient de `GET /api/payments/history` (`PaymentHistory`, `payment_method`
  des lignes de bail), pas de `LeasePaymentResource`.
- `show` sert déjà `collaborators` (`PrimaryPropertyContact::eagerLoads()`), avec l'agent principal (`is_primary`).

**Décisions mineures (tranchées ici)**
- « Tous les bailleurs » : lu au serveur (`lib/biens/bailleurs-du-filtre.ts`, `GET /api/owners` toutes pages,
  `filter[agency_id]`, SANS filtre de statut ni exclusion des invités : la valeur est le PROFIL, invités compris —
  pas `useBailleursActifs`, qui ne rend que les actifs inscrits, par compte). Personnel seulement ; une lecture
  refusée (agent sans carnet) n'affiche pas la liste et le groupe garde son nom « Agent et portée ». Panneau du
  mode Gestion seulement (maquette e0, bureau) ; le filtre vaut dans les deux modes, et la puce « Bailleur : … »
  le nomme et le retire partout (téléphone et mode Annonces compris).
  La page ne relaie qu'un identifiant numérique. Les comptes du panneau et des tuiles (`portfolio-summary`) ne
  suivent pas le bailleur choisi (même règle qu'avant : seuls `user_id` et `include_archived` les bornent).
- Carte d'annonce : sans `stats_30d`, AUCUNE ligne de chiffres (jamais `views_count` sous « (30 j) »).
  `views_count` et `favorites_count` quittent `DASHBOARD_PROPERTY_FIELDS` (plus aucun lecteur de la liste ; le tri
  `sort=views_count` n'en a pas besoin) ; plancher de `property-fields.coverage.test.ts` : 13 → 11 colonnes lues.
- « Offre {nom} » lit `plan.label` (`fetchAbonnement`, include=plan) ; tout échec (403 `agency.staff_only`,
  panne) rend `null` : rien d'affiché. À droite du texte de la jauge, téléphone et bureau. Le texte de la jauge
  reste « N annonces actives sur M » (le quota compte les ACTIVES, ADR-0097 § 6), pas « en ligne ».
- Avis d'échéance : `next_due_notice_date` vise la PREMIÈRE échéance non avisée, qui peut être celle du mois
  (voire passée) : il ne s'accole au prochain loyer que s'il tombe après l'échéance du mois et au plus tard le
  jour du prochain loyer (`avisDuProchainLoyer`) ; sinon la ligne garde sa forme.
- Révision : « Révision possible le 1 juil. 2027 » + « Clause d'indexation annuelle » (une date n'est servie que
  pour un plafond non figé à 0, règle de 12 mois) ; rien sans date.
- « Agent principal » remplace « Agent responsable » sous le nom de l'agent (libellé de la maquette a-2) ;
  « · N collaborateur(s) » = collaborateurs ni `is_primary`, ni le responsable affiché.
- Carte « N interventions en cours » : colonne de droite du bureau, sur tous les onglets et pour tout bien (pas
  seulement loué), carte à part sous celle de l'agent (celle-ci n'existe que pour un bien loué dont l'API dit
  l'agent) ; détail = titre · état (`maintenance.status`) de la dernière ouverte ; lien `/app/maintenance/{id}`.
- Historique des loyers : « Reçu le 29 oct. · Wave » — libellés de `payments.methods` (« Virement bancaire »
  pour « virement ») ; « · quittance envoyée » non rendu (aucune donnée servie).

**Mesures** — tests neufs : `ListeDesBiens.tck-2908` (10), `FicheDuBien.tck-2908` (8, horloge figée en 2026),
`valide-et-interventions.tck-2908` (5, `published` compris), `bailleur-et-offre.tck-2908` (8),
`lib/biens/__tests__/bailleurs-du-filtre.tck-2908` (1), `properties.test.ts` (+1) ; tests mis
à jour : `CarteAnnonce.tck-2638` (chiffres), `PropertyList.test` (anglais), `FicheDuBien.tck-2639` (« Agent
principal »), `gestion.tck-2638` (les deux lectures neuves bouchonnées : elles ne comptent pas parmi les appels
de la liste), `property-fields.coverage` (plancher). 15 ablations une à une, toutes rouges, restaurées au md5.
Joués verts : `components/property-dashboard/**/__tests__` (39 fichiers), les 17 fichiers de tests des pages
`/app/properties`, `properties.test.ts`, `property-fields.coverage.test.ts`, `show-sans-fields.garde`, `fields-demandables.tck-1184`,
`ressource-de-detail.partage.tck-1384` ; ESLint, `tsc --noEmit` (seules
erreurs : `components/messages/VoiceNoteRecorder.tsx`, hors zone, en cours ailleurs), `check:i18n`, gardes racine
et front toutes vertes. Fiches de fidélité : `TCK-2638.json` — retirés « Tous les bailleurs », « Offre Pro » et « 312 vues · 9 contacts · 3 visites
(30 j) » ; `TCK-2639.json` — retirés « Validé » et les lignes levées (restent « quittance envoyée » et le préavis de la
démo), alias « virement » / « devis attendu », carte d'intervention à part motivée.
⚠ Les clés i18n de ce ticket (et la suppression de `annonces.chiffres`, `fiche.responsable.detail`) sont déjà dans
le commit d522921dc (TCK-2854) : tant que TCK-2908 n'est pas commité, HEAD appelle deux clés absentes — à commiter
avant tout push.
