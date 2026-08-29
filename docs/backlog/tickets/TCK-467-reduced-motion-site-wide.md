---
id: TCK-467
title: "Les animations du site s'exécutent quelle que soit la préférence système de mouvement réduit"
status: todo
phase: P1
family: front
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, accessibilite, design, css]
---

## Objectif utilisateur

Quelqu'un qui a demandé à son système de réduire les animations — parce qu'elles lui donnent le
vertige ou déclenchent une migraine — voit ce choix respecté sur tout le site, pas seulement sur
l'écran de publication d'un bien.

## Contrat de données

Aucun. Changement purement CSS, dans `takussan-web/src/app/globals.css`.

## Direction UX / Artistique

Respecter `prefers-reduced-motion: reduce` ne veut pas dire supprimer tout retour visuel : une
transition d'opacité courte reste acceptable et souvent préférable à une apparition brutale. C'est
le **déplacement** qui pose problème, pas le changement d'état. Le parcours de publication a déjà
tranché en ce sens — s'en inspirer plutôt que de tout mettre à `animation: none`.

## Contraintes strictes (métier)

- Trois animations sont concernées : `fadeInUp`, `cardEnter`, `sectionEnter`. Elles s'appliquent sur
  **tout le produit**, y compris des pages publiques.
- Les animations du parcours de publication (`.wizard-*`) sont **déjà** gardées ; ne pas les
  redéfinir, seulement vérifier qu'aucune règle nouvelle ne les contredit.
- ⚠ **Mesurer l'étendue avant d'écrire la règle.** Poser un `@media` universel change le
  comportement de pages que personne n'a rouvertes ; c'est précisément pourquoi TCK-464 s'est
  interdit de le faire depuis un ticket sur la publication.

## Delta à produire

- [ ] Recenser les consommateurs de chacune des trois animations.
- [ ] Ajouter la garde `@media (prefers-reduced-motion: reduce)` correspondante dans `globals.css`.
- [ ] Vérifier au navigateur, préférence système activée, sur au moins une page publique et une
      page du tableau de bord.

## Critères d'acceptation

- [ ] AC1 — préférence « mouvement réduit » activée, aucune des trois animations ne produit de
      déplacement.
- [ ] AC2 — préférence désactivée, le comportement est inchangé par rapport à aujourd'hui.
- [ ] AC3 — les animations du parcours de publication restent gardées comme avant.

## Hors périmètre

- Les transitions portées par des classes Tailwind au cas par cas.

## Notes d'implémentation

Manquement nommé et **délibérément laissé** par la tâche 6 de TCK-464 : y toucher depuis un ticket
sur la publication aurait changé le produit entier sans que personne ne l'ait instruit.
