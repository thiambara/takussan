---
id: TCK-2869
title: "Accueil du bailleur : « Autre créneau » et « Confirmer » sur une visite à confirmer quand l'agence le lui confie, et l'interrupteur de l'agence (ADR-0112)"
status: todo
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2849]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, accueil, bailleur, visites, audit-ux, app]
---

## Objectif utilisateur

Le bailleur à qui l'agence confie ses visites les confirme, ou propose un autre créneau, sans quitter son accueil.

## Contrat de données

- Réglage d'agence et confirmation par le bailleur : **livrés par TCK-2849** (ADR-0112, à valider par le porteur).
- La confirmation avec `scheduled_at` existe (TCK-2624) ; l'accueil de l'admin s'en sert déjà (`LigneDeVisite.tsx:76-96`, « Autre créneau » / « Confirmer »).

Relevé (audit-f3-coque.md, app-accueil e2, app-coque e9) : le bailleur voit « Voir » seul (décision 7 de TCK-2624) ; la maquette dessine « Autre créneau » + « Confirmer ».

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-accueil-contenu.tsx` (`AccueilBailleurMobile` l. 745-746 : `CarteAFaire` « Visite à confirmer » avec « Autre créneau » / « Confirmer » ; `AccueilBailleurBureau` l. 801-802 : `RangeeAFaire` « Proposée par Sokhna Sène · visiteur : Pape Gueye »), écran **e2 « Bailleur »** d'`app-accueil.tsx`, approche a, **téléphone et bureau** ; même contenu en app-coque e9.

- Mêmes gestes, mêmes feuilles (téléphone) et dialogues (bureau) que l'accueil de l'admin : une seule implémentation du choix de créneau.
- La ligne dit qui a proposé la visite (« proposée par Sokhna Sène ») et, au bureau, le visiteur.
- **Réglages de l'agence** : un interrupteur « Les bailleurs confirment les visites de leurs biens », pour l'administrateur, là où vivent les réglages de l'agence (sans autre maquette : la forme d'un interrupteur de réglage existant).

## Contraintes strictes (métier)

- Les gestes n'apparaissent que si l'API les permet (capacité rendue avec la visite) ; sinon « Voir », comme aujourd'hui (TCK-2624, « Chaque geste n'apparaît que s'il est permis »).
- Un 403 au moment du geste retire le geste et garde la ligne (pas d'erreur bloquante).
- Succès : la ligne quitte la liste, le compte baisse.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Gestes « Autre créneau » / « Confirmer » sur les visites du bailleur, conditionnés à l'API.
- [ ] Interrupteur dans les réglages de l'agence.
- [ ] Tests : réglage faux → « Voir » seul ; vrai → deux gestes ; « Confirmer » → la ligne disparaît ; 403 → geste retiré.

## Critères d'acceptation

- [ ] AC1 — Agence au réglage faux : la visite à confirmer du bailleur porte « Voir » et ni « Confirmer » ni « Autre créneau ».
- [ ] AC2 — Réglage vrai : à 390 la carte porte « Autre créneau » et « Confirmer » ; à 1440 la rangée aussi ; « Confirmer » envoie la confirmation et retire la ligne.
- [ ] AC3 — « Autre créneau » → choix d'une heure → la confirmation part avec `scheduled_at`.
- [ ] AC4 — L'administrateur bascule l'interrupteur ; le bailleur voit les gestes au rechargement.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2869.json` : app-accueil e2, téléphone et bureau, réglage vrai.
- [ ] AC-F2 — Zéro écart non expliqué ; la décision 7 n'est plus un écart accepté quand le réglage est vrai.

## Hors périmètre

- « Démarrer », « Prochain reversement », relances : TCK-2850.

## Notes d'implémentation

_(à remplir par implementing-specs)_
