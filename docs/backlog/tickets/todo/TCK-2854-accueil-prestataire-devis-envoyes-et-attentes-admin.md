---
id: TCK-2854
title: "Accueil : les devis envoyés « en attente du bailleur » du prestataire au bureau, et l'attente dessinée de l'admin (squelette de « Ce mois », groupes à rangées au bureau)"
status: todo
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_
