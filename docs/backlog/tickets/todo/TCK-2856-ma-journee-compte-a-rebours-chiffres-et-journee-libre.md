---
id: TCK-2856
title: "Ma journée de l'agent : « dans 45 min » au bureau, « 3 sans photo » et « 310 000 F à venir » sous les chiffres, une journée libre qui nomme qui relancer et quels biens proposer, deux colonnes dès 1024"
status: todo
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2855]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, journee, agent, audit-ux, app]
---

## Objectif utilisateur

L'agent voit combien de temps il lui reste avant sa prochaine visite, ce que ses chiffres cachent, et, quand sa journée est vide, à qui consacrer son temps — par son nom.

## Contrat de données

- `properties_without_photo`, `commissions_upcoming`, `suggestions.follow_up`, `suggestions.matches` : **livrés par TCK-2855**.
- Le reste est déjà lu (`MaJournee`, `Chronologie`, `MesChiffres`, `JourneeLibre`).

Relevé : audit-f3-coque.md, app-aujourdhui e0 et e4, app-accueil e0 (écran jamais relevé) — chronologie au bureau qui dit la durée (« 45 min ») et non « dans 45 min » ; `MesChiffres.tsx:54, 57` contexte `null` ; `JourneeLibre.tsx:43-61` sans suggestion « biens à proposer » et `relancerDetail` fixe ; deux colonnes dès `xl` au lieu de `lg` (écart accepté par décision, repris ici à la demande du porteur).

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-aujourdhui.tsx`, approche a, **e0 « Ma journée »** et **e4 « Journée libre »**, téléphone et bureau ; et `app-accueil.tsx` **e0 « Agent : sa journée »** (`AccueilAgentMobile`, `AccueilAgentBureau` dans `app-accueil-contenu.tsx`).

- **Bureau** : sur la chronologie, la prochaine visite dit « dans 45 min » (compte à rebours relatif à maintenant), comme le téléphone.
- **Les deux formats** — « Mes chiffres » : « Biens gérés » porte « 3 sans photo » (mène à la liste des biens filtrée sur les sans photo si le filtre existe, sinon à la liste), « Commissions » porte « 310 000 F à venir ».
- **Journée libre** (e4) : la première suggestion nomme le client (« Relancer Ibrahima Sarr » / « attend depuis 9 jours ») ; une suggestion « 3 biens à proposer à Mariama » / « Studios à Mermoz et à Ouakam » qui ouvre la fiche du client sur ses biens rapprochés.
- **Largeur** : deux colonnes dès 1024 (`lg`), comme la maquette.

## Contraintes strictes (métier)

- Une sous-ligne à zéro ne s'affiche pas (« 0 sans photo » : non).
- Pas de suggestion `matches` ni `follow_up` servie → la suggestion correspondante ne se rend pas ; les suggestions fixes (« Planifier une visite », « Ajouter un client ») restent.
- Le compte à rebours se met à jour sans recharger (au moins à la minute) et bascule sur l'heure quand la visite est passée.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] « dans N min » au bureau.
- [ ] Deux sous-lignes de « Mes chiffres ».
- [ ] Suggestions nominatives de « Journée libre ».
- [ ] Deux colonnes dès `lg`.
- [ ] Tests : « dans 45 min » à 1440 (horloge simulée) ; sous-lignes et leur absence à 0 ; suggestions nominatives et leur absence.

## Critères d'acceptation

- [ ] AC1 — À 1440, horloge à 09:15, visite à 10:00 : la carte dit « dans 45 min ».
- [ ] AC2 — `properties_without_photo = 3`, `commissions_upcoming = 310000` : « 3 sans photo » sous « Biens gérés » et « 310 000 F à venir » sous « Commissions » ; à 0, aucune sous-ligne.
- [ ] AC3 — Journée libre avec les deux suggestions servies : « Ibrahima Sarr » et « attend depuis 9 jours » ; « 3 biens à proposer à Mariama » qui mène à `/app/customers/{id}`.
- [ ] AC4 — À 1024, « Ma journée » est en deux colonnes.
- [ ] AC5 — Vérifier au navigateur (audit, non vérifiables) : la ligne « demande qui attend » de « À régler » avec une demande de plus de 24 h ; une tâche du jour à heure fixe dans la chronologie ; Appeler / WhatsApp d'une tâche rattachée à un client joignable ; « Journée libre » d'un agent sans rien (et « Mes chiffres » à droite à 1280) — corriger si absents.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2856.json` : app-aujourdhui e0 et e4, app-accueil e0 (jamais relevé), téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; les sous-lignes ne sont plus en `hors_perimetre`.
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- La page « Tâches » : TCK-2857.

## Notes d'implémentation

_(à remplir par implementing-specs)_
