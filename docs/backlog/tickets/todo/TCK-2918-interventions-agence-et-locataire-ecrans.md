---
id: TCK-2918
title: "Interventions de l'agence et du locataire : le kanban qu'on manipule au bureau, appeler le demandeur, annuler avec un motif, les créneaux dépassés au carnet ; « Écrire à l'agence », « Changer le créneau » et le délai de réponse chez le locataire"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2917]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [front, interventions, agence, locataire, kanban, prestataires, audit-ux, app]
---

## Objectif utilisateur

Au bureau, l'agent glisse une demande vers « En cours » pour la confier à un prestataire, appelle le locataire d'un toucher, annule en disant pourquoi ; le locataire écrit à l'agence ou demande un autre créneau depuis sa demande en cours.

## Contrat de données

- Motif d'annulation, `requester.phone`, demandes de changement de créneau, `overdue_slots_count` et facettes par métier, `maintenance_response_minutes` : TCK-2917.
- Déjà servis : transitions de statut, `conversation_id` de l'intervention (dès l'assignation), files et filtres de la liste, suggestions de prestataires.

Audit (`audit-f4-patrimoine.md`, app-interventions) :

- **e0** (bureau) : le kanban n'est pas manipulable — ni poignée, ni glisser-déposer, ni zones « Glissez une carte vers « En cours » pour choisir un prestataire » / « Déposez une carte ici » (TCK-2653 Hors périmètre l. 127, **absent de la fiche de fidélité**, aucun ticket).
- **e1** : numéro du locataire + Appeler / WhatsApp du demandeur.
- **e2** : « Annuler la demande » sans motif.
- **e4** : « répond d'ordinaire dans l'heure » non rendu.
- **e5** : carte « En cours » sans « Écrire à l'agence » ni « Changer le créneau » ; note « prises en charge selon votre bail » absente.
- **e8** : « ⋯ » de ligne absent ; « 1 créneau dépassé » non servi ; pastilles de métier non comptées (téléphone).

## Direction UX / Artistique

**Référence de fidélité** : page `app-interventions`, approche `a` :

- **e0 « Agence — files »**, **bureau** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-interventions-agence.tsx` (`CarteKanban` l. 190-230, `BureauListeAgence` l. 240-300) : poignée `GripVertical` sur chaque carte ; au pied de chaque colonne, la zone pointillée « Glissez une carte vers « En cours » pour choisir un prestataire » (colonne à dispatcher) ou « Déposez une carte ici » ; déposer une carte dans « En cours » ouvre le choix du prestataire ; un dépôt vers une colonne que la transition n'autorise pas est refusé visiblement. Téléphone : conforme (aucun glisser).
- **e1 « Fiche — à dispatcher »**, téléphone et bureau (`Demandeur`, l. 386-410) : le numéro du locataire, « Appeler » et « WhatsApp » ; la raison de suggestion « Plomberie · Hann, Patte d'Oie · 1 créneau dépassé » (l. 335).
- **e2 « Fiche — Autre action »**, téléphone (feuille) et bureau (menu) (`ListeAutresActions`, l. 431-453) : « Annuler la demande — Le locataire est prévenu, avec votre motif » ouvre la saisie du motif.
- **e4 « Locataire — demande envoyée »** — `app-interventions-autres.tsx` l. 224 : « Pour une urgence, l'agence répond d'ordinaire dans l'heure » (formulé depuis la médiane servie).
- **e5 « Locataire — mes demandes »** — même fichier, `CarteEnCours` l. 296-323 : « Écrire à l'agence » et « Changer le créneau » ; l. 395 : « Les réparations de votre logement sont prises en charge selon votre bail : aucun montant ne vous est demandé ici. » — téléphone et bureau.
- **e8 « Agence — carnet des prestataires »** (`MobileCarnet` l. 597, `BureauCarnet` l. 663) : « 1 créneau dépassé » sur la ligne du prestataire ; pastilles de métier comptées au téléphone ; « ⋯ » de ligne au bureau (Voir la fiche, Renvoyer l'invitation, Révoquer).

## Contraintes strictes (métier)

- Le glisser-déposer n'invente aucune transition : il n'offre que celles que l'API sert pour la carte ; un dépôt vers « En cours » passe par le choix du prestataire (même parcours que « Choisir » de la fiche) ; accessible au clavier (poignée focalisable, flèches) comme les épingles du menu (`@dnd-kit/core`, déjà au dépôt).
- Annuler exige un motif (l'API le refuse sans) ; le motif est montré au locataire.
- « Écrire à l'agence » ouvre la conversation de l'intervention (`conversation_id`) ; sans conversation (pas encore assignée), le bouton n'est pas rendu.
- « Changer le créneau » envoie une demande de créneau, et l'écran dit qu'elle attend la réponse de l'agence — il ne promet pas un créneau changé.
- Le délai de réponse n'est affiché que s'il est servi ; formulation par tranche (« dans l'heure », « dans la journée »).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Kanban du bureau manipulable (poignée, zones de dépôt, transitions servies, choix du prestataire au dépôt dans « En cours »).
- [ ] Fiche : numéro, Appeler, WhatsApp du demandeur ; raison de suggestion avec créneaux dépassés ; annulation avec motif.
- [ ] Locataire : délai de réponse, « Écrire à l'agence », « Changer le créneau », note « selon votre bail ».
- [ ] Carnet : créneaux dépassés, pastilles comptées, « ⋯ » de ligne.
- [ ] Fiches de fidélité `TCK-2653.json` (y écrire puis lever l'écart du kanban) et `TCK-2654.json`.
- [ ] Tests : dépôt dans « En cours » ouvre le choix du prestataire ; dépôt interdit refusé sans requête ; clavier ; `tel:` du demandeur ; motif envoyé ; « Changer le créneau » → `POST …/reschedule-requests` ; « Écrire à l'agence » vers la conversation ; « 1 créneau dépassé ».

## Critères d'acceptation

- [ ] AC1 — À 1440, chaque carte du kanban porte une poignée ; déposer une carte « à dispatcher » dans « En cours » ouvre le choix du prestataire, et confirmer envoie l'assignation ; annuler le choix laisse la carte dans sa colonne.
- [ ] AC2 — Déposer une carte dans une colonne dont la transition n'est pas servie n'envoie aucune requête et la carte revient à sa place.
- [ ] AC3 — Au clavier seul, une carte se déplace d'une colonne à l'autre (poignée + flèches + Entrée).
- [ ] AC4 — La fiche d'une demande dont le détail porte `requester.phone` rend le numéro, « Appeler » (`tel:`) et « WhatsApp » ; sans `phone`, aucun des trois.
- [ ] AC5 — « Annuler la demande » ouvre la saisie d'un motif ; confirmer sans motif est impossible ; avec motif, `PUT …/status` porte `reason`.
- [ ] AC6 — La carte « En cours » du locataire rend « Écrire à l'agence » (vers `/app/messages?conversation={conversation_id}`) et « Changer le créneau » (qui envoie `POST …/reschedule-requests`) ; la note « … selon votre bail … » est rendue sous les demandes.
- [ ] AC7 — La confirmation d'envoi rend « l'agence répond d'ordinaire dans l'heure » quand `maintenance_response_minutes ≤ 60`, et aucune phrase de délai quand il est nul.
- [ ] AC8 — Le carnet rend « 1 créneau dépassé » pour `overdue_slots_count = 1` ; à 390 les pastilles de métier portent leur compte ; à 1440 chaque ligne a un menu « ⋯ ».
- [ ] AC9 — Vérifier au navigateur les photos et la galerie d'une demande semée avec médias (la démo n'en a pas) ; corriger si absentes.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiches : `docs/qa/audit-ux-2026-11/fidelite/TCK-2653.json` et `TCK-2654.json` :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2653.json` et `TCK-2654.json` liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La note vocale (TCK-2902).
- Le bailleur et le prestataire (TCK-2919).

## Notes d'implémentation

Implémenté le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), sur l'API de TCK-2917 (ADR-0118).

**Priorité — l'annulation sans motif (422).** Deux appels l'envoyaient (`AutreAction.tsx`, `MaintenanceDetail.tsx`) ; le prestataire (`AccueilDuPrestataire`) n'envoie que `in_progress`. Une saisie unique, `components/maintenance/MotifDAnnulation.tsx` (motif requis, rogné, ≤ 500), sert les deux fiches — `MaintenanceDetail` est aussi celle du bailleur. Le TYPE de l'appel l'impose désormais : `MaintenanceStatusInput` = `{status: Exclude<…,'cancelled'>} | {status:'cancelled'; reason: string}` (`lib/schemas/maintenance.ts`), et `autresActions().transitions` est typé sans `cancelled` : `tsc` refuse toute annulation sans motif. Le motif est relu sur une demande annulée (`cancellation_reason` : « Motif : … » dans `MaintenanceDetail`, ligne « Motif de l'annulation » dans la fiche de l'agence). Libellé « Le locataire est prévenu, avec votre motif » posé ; les clés de l'ancienne confirmation (`fiche.autre.annuler.confirmer*`, `garder`) retirées.

**Livré :**
- e0 — `files/KanbanDesFiles.tsx` (remplace la `Colonne` d'`InterventionsDeLAgence`) : poignée (bouton, `setActivatorNodeRef` : la carte est un lien étiré), zone de dépôt au pied de chaque colonne (« Glissez… » sous « À dispatcher », « Déposez une carte ici » ailleurs ; elle tient lieu de « file vide »), `DragOverlay`, annonces, clavier par `versLaColonneVoisine` du pipeline (non modifié). Règle pure `lib/maintenance/depot.ts` : seul « À dispatcher » / « En retard » → « En cours » ouvre le choix du prestataire (feuille, `ChoixDuPrestataire` sur la fiche lue, gardé par `can_assign` servi au détail) ; tout autre dépôt est refusé visiblement, sans requête ; la carte ne bouge qu'après le PATCH.
- e1 — fiche : numéro du demandeur (`requester.phone`), « Appeler » (`tel:`) et « WhatsApp » ; « · 1 créneau dépassé » dans la raison d'une suggestion.
- e4 — « L'agence répond d'ordinaire dans l'heure / dans la journée / sous N jours » (`trancheDeReponse`, `lib/maintenance/mes-demandes.ts`), rien quand `maintenance_response_minutes` est nul.
- e5 — `acteurs/GestesDeLaDemandeEnCours.tsx` : la carte « En cours » lit la fiche de sa demande (`conversation_id`, `can_request_reschedule`, `pending_reschedule_request` ne sont servis qu'au détail) ; « Écrire à l'agence » → `/app/messages?conversation=…` ; « Changer le créneau » → feuille de 1 à 3 créneaux + mot → `POST …/reschedule-requests` (`useDemanderUnAutreCreneau`), puis « … votre demande attend la réponse de l'agence » ; note « … selon votre bail … » sous les demandes (rendue même sans demande close).
- e8 — carnet (`ServiceProvidersList`) : « N créneau(x) dépassé(s) » (colonne Délai au bureau, carte au téléphone), pastilles comptées par `meta.trade_counts`, « ⋯ » de ligne au bureau.

**Décisions (mineures, tranchées) :**
- Le délai de réponse est dit « L'agence répond d'ordinaire … » et non « Pour une urgence, … » (maquette) : la médiane servie porte sur toutes les demandes, pas sur les urgences.
- « ⋯ » : sans « Voir la fiche » — aucune fiche de prestataire n'existe (aucune route) ; il porte Appeler / WhatsApp, ou Renvoyer l'invitation / Révoquer. Pastille « Invités » non rendue (elle mêlerait un filtre de statut aux pastilles de métier).
- Un créneau proposé déjà passé n'est pas envoyé : l'écran le dit et bloque l'envoi (l'API rend 422, `after:now`).
- Message WhatsApp au demandeur : « Bonjour {nom}, ici votre agence, au sujet de votre demande « {titre} ». » (une 1re rédaction « je vous écris » faisait rougir `check:vouvoiement`).

**Mesures :** tests neufs — `kanban-des-files.tck-2918` (9 : poignées et zones, dépôt → choix → PATCH, fermer sans requête, sans `can_assign`, 3 dépôts refusés, lâchée hors colonne, parcours clavier Espace → ×3 → Entrée sur une géométrie posée), `mes-demandes-du-locataire.tck-2918` (4), `ServiceProvidersList.creneaux-pastilles-menu.tck-2918` (3) ; ajouts dans `fiche-d-intervention.tck-2653` (motif ×2 mis à jour, joindre ×2, créneau dépassé), `MaintenanceDetail.test` (2), `demande-envoyee.tck-2654` (5). 46 fichiers de test du périmètre verts (234 tests). 6 ablations rouges puis restaurées (md5) : motif vidé, `issueDuDepot` toujours `choisir`, téléphone ignoré, gestes jamais rendus, créneaux dépassés à 0, tranche « heure » retirée. `tsc`, ESLint, `check:i18n`, `check:vouvoiement` et `scripts/check-*.mjs` du front verts ; racine : seule `check-inline-validation` rouge, côté API, hors de ce ticket.

**Non mesuré (navigateur interdit par le brief du lot) :** AC9 (photos d'une demande semée avec médias) et AC-F2 à AC-F6 (`fidelite compare`, rideau, largeurs intermédiaires). Fiches `TCK-2653.json` / `TCK-2654.json` : écarts levés retirés (téléphone du demandeur, motif, créneau dépassé, « ⋯ », pastilles, délai de réponse, gestes et note du locataire), trois écarts motivés ajoutés (« Voir la fiche », « Invités », dépôts hors « En cours »).
