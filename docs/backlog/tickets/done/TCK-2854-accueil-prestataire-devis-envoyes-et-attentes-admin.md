---
id: TCK-2854
title: "Accueil : les devis envoyés « en attente du bailleur » du prestataire au bureau, et l'attente dessinée de l'admin (squelette de « Ce mois », groupes à rangées au bureau)"
status: done
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, accueil, prestataire, admin, chargement, audit-ux, app]
---

## Objectif utilisateur

Le prestataire voit, à côté des devis à chiffrer, ceux qu'il a envoyés et qui attendent le bailleur ; l'admin voit chaque bloc de son accueil se dessiner pendant qu'il charge, à sa forme.

## Contrat de données

Aucun endpoint neuf :

- `GET /api/maintenance-requests?filter[assigned_to]={moi}&filter[status]=quote_submitted` (et `awaiting_owner`) — filtres servis (`MaintenanceRequest::$requestFilterable`, statuts `MaintenanceStatus`), champs `quote_amount`, `quote_currency`, `quote_submitted_at`. Aujourd'hui seul `quote_requested` est lu (`lib/queries/accueil-prestataire.ts`, `useAChiffrer`).
- « Ce mois » de l'admin est lu par le serveur (`CeMois.tsx`) ; seul le `RouteSkeleton` générique couvre l'attente (`(accueil)/loading.tsx`).

Relevé : audit-f3-coque.md, app-accueil e4 (prestataire, bureau Partiel) et e7 (chargement et erreur), app-coque e11 ; fiches TCK-2625 (HP a-4) et TCK-2622 (HP a-7 renvoyé à TCK-2624, jamais fait).

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-accueil-contenu.tsx` et `app-accueil.tsx`, approche a :

- **e4 « Prestataire »**, **bureau** (`AccueilPrestataireBureau` l. 1184) : « Mes devis en attente » liste les devis **à chiffrer** et les devis **envoyés** (« 85 000 F · Envoyé le 8 nov. · en attente du bailleur ») ; même contenu en app-coque e11 (bureau jamais relevé). Le téléphone est conforme.
- **e7 « Chargement et erreur (admin) »**, **les deux formats** (`AccueilEtatsMobile`, `AccueilEtatsBureau`) : « Ce mois » a son **squelette** propre (puces au téléphone, tuiles au bureau) pendant sa lecture ; au **bureau**, les squelettes de « À faire » sont des **groupes à rangées** (titre de groupe + rangées), pas des cartes.

## Contraintes strictes (métier)

- Un devis envoyé n'offre aucun geste au prestataire (il attend le bailleur) ; la rangée mène à l'intervention.
- Le squelette de « Ce mois » ne bloque pas le reste de l'accueil (lecture en flux, `Suspense` ou équivalent) ; une erreur de « Ce mois » garde `ErreurDeBloc` + « Réessayer ».
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Devis envoyés dans « Mes devis en attente » (bureau ; et au téléphone si la maquette téléphone les montre).
- [ ] Squelette de « Ce mois » ; squelettes de « À faire » en groupes au bureau.
- [ ] Tests : rangée « Envoyé le 8 nov. · en attente du bailleur » ; squelette de « Ce mois » pendant une lecture retardée ; forme des squelettes au bureau.

## Critères d'acceptation

- [ ] AC1 — Prestataire avec un devis `quote_submitted` de 85 000 F envoyé le 8 novembre : à 1440, « Mes devis en attente » contient « 85 000 F », « Envoyé le 8 nov. » et « en attente du bailleur », sans bouton d'action.
- [ ] AC2 — Lecture de « Ce mois » retardée : un squelette marqué `aria-busy` occupe la place de « Ce mois » pendant que « À faire » est déjà rendu.
- [ ] AC3 — À 1440, pendant le chargement de « À faire », les squelettes ont la forme de groupes à rangées (titre de groupe + au moins deux rangées), pas de cartes.
- [ ] AC4 — Vérifier au navigateur (audit, non vérifiables) une intervention du prestataire planifiée le jour même (« Itinéraire », « Commencer », statut) ; corriger si absents.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2854.json` : app-accueil e4 (bureau) et e7 (deux formats), app-coque e11 (bureau jamais relevé).
- [ ] AC-F2 — Zéro écart non expliqué.

## Hors périmètre

- Rien de l'API.

## Notes d'implémentation

**Re-mesure (2026-11-15).** Prémisses confirmées : `useAChiffrer` ne lisait que `quote_requested` ; « Ce mois » était
calculé par la page (`await lireLeTableau()` puis `fetchKpisActifs()`) avant tout rendu, sous le seul
`RouteSkeleton` ; `AFaireAdmin` (et `AFaireBailleur`, même défaut) dessinait deux `SqueletteDeCarte` à toutes les
largeurs, dans un `<ul>` à enfants `div`. `SqueletteDesChiffres` existait (TCK-2622) mais n'était monté nulle part.
`MaintenanceRequestResource` sert `quote_amount`/`quote_currency`/`quote_submitted_at` au prestataire assigné (seul le
demandeur locataire en est privé, TCK-592) ; `filter[status]` accepte une liste.

**Livré.**
- **AC1** — `useDevisEnvoyes` (`lib/queries/accueil-prestataire.ts`) : `filter[assigned_to]=moi`,
  `filter[status]=quote_submitted,awaiting_owner`, + `quote_submitted_at` dans les champs (le montant y était déjà).
  `AChiffrer` : au téléphone, « À chiffrer » inchangé (la maquette téléphone ne montre pas l'envoyé) ; au bureau, une
  carte « Mes devis en attente » à rangées (à chiffrer avec « Chiffrer », puis envoyés : titre, montant, « Envoyé le
  8 nov. · en attente du bailleur », la rangée est un lien vers l'intervention, aucun bouton).
  Libellé unique pour les deux statuts (AC1 le fixe pour `quote_submitted`) — sous le plafond, c'est l'agence qui
  valide (ADR-0037) ; noté en écart accepté de la fiche.
- **AC2** — la page de l'admin d'agence n'attend plus `/dashboard/me` : la lecture part tout de suite, `lireCeMois`
  (promesse qui ne rejette jamais) est passée à `CeMoisEnFlux` (`use()`) sous `<Suspense fallback={<SqueletteDeCeMois/>}>`
  (`aria-busy`, puces + intertitre au téléphone, tuiles au bureau). Échec → `ErreurDeBloc` + « Réessayer » inchangés.
  Les autres personas gardent la lecture attendue (leurs blocs lisent le payload). Pourquoi l'admin ne peut pas
  être l'agent sur ce chemin : sans profil actif, `TYPE_DOMINANT` met `agent` avant `agency_admin` (un compte
  admin + agent est donc le persona agent) ; côté API, `DashboardRoleResolver::resolve` juge `isAgencyAdminAt`
  avant `isAgentAt` (`journee-de-l-agent.tck-2596` vert). Au bureau, le squelette garde l'intertitre « Ce mois »
  de l'écran chargé (a-2) : les tuiles ne descendent pas en fin de lecture. Cas limite accepté : une API qui
  répond 404 à `/dashboard/me` (rien à compter) laisse chez l'admin une cellule « Ce mois » vide — l'API actuelle
  rend toujours une vue (TCK-595), et l'admin a toujours ses chiffres (`chiffresDeLAgence`).
- **AC3** — `SqueletteDeGroupes` (`EtatsDeBloc`) : groupes à en-tête + rangées (4 puis 3, maquette e7). `AFaireAdmin`
  ET `AFaireBailleur` (même défaut, mêmes groupes au bureau) : cartes sous `md`, groupes dès `md`, `aria-busy` sur
  l'enveloppe, texte `sr-only`.
- **AC4** — non mesuré au navigateur (consigne du lot) ; assertions « Itinéraire » + « Commencer » + statut ajoutées
  au test de la rangée du bureau (`AccueilDuPrestataire.tck-2625`), vert : rien à corriger.
- **AC-F1/F2** — fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2854.json` (relevé `null` : pas de navigateur dans ce
  lot), quatre écarts expliqués (donneur d'ordre non servi, libellé unique, ordre « Ce mois » / équipe au bureau
  aligné sur l'écran chargé a-2, textes `sr-only`).

**Tests et ablations.** AC1 (deux tests), AC2 (lecture retardée + échec), AC3 (admin ET bailleur) : chacun rouge
sans le correctif (envoyés retirés ; page qui attend la lecture → délai dépassé ; groupes remplacés par une carte,
dans chacun des deux composants), restauré, md5 vérifié. Tests ajustés : `socle.tck-2622` (`monter` sous `act` asynchrone), `mise-en-service` (`withIntl`, `act`
asynchrone et routeur doublé : « Ce mois » de l'admin se rend en flux).

**Hors de ma zone.** `check:i18n` rouge sur `lib/documents/lecture-mrz/moteur.ts` (coffre, TCK-2899) ; `scripts/check-models-spec.mjs`, rouge un temps sur `MaintenanceRescheduleRequest` (modèle d'un autre
agent en cours, API des interventions).
