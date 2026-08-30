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

- [x] Recenser les consommateurs de chacune des trois animations.
- [x] Ajouter la garde `@media (prefers-reduced-motion: reduce)` correspondante dans `globals.css`.
- [x] Vérifier au navigateur, préférence système activée, sur au moins une page publique et une
      page du tableau de bord.

## Critères d'acceptation

- [x] AC1 — préférence « mouvement réduit » activée, aucune des trois animations ne produit de
      déplacement.
- [x] AC2 — préférence désactivée, le comportement est inchangé par rapport à aujourd'hui.
- [x] AC3 — les animations du parcours de publication restent gardées comme avant.

## Hors périmètre

- Les transitions portées par des classes Tailwind au cas par cas.

## Notes d'implémentation

Manquement nommé et **délibérément laissé** par la tâche 6 de TCK-464 : y toucher depuis un ticket
sur la publication aurait changé le produit entier sans que personne ne l'ait instruit.

## Vérification au navigateur — prise le 2026-08-30

Chrome 151 headless, deux instances côte à côte, **la seule différence étant
`--force-prefers-reduced-motion`** sur l'une. Pilotées par CDP direct (WebSocket natif de Node 24) :
le serveur MCP parle à Chrome par tube, `Emulation.setEmulatedMedia` n'était donc pas atteignable —
et *un réglage système bricolé sur la machine de quelqu'un n'est pas une mesure, c'est un effet de
bord*. Chaque page lit `matchMedia('(prefers-reduced-motion: reduce)').matches` avant de mesurer,
pour que le relevé porte sa propre preuve d'avoir mesuré ce qu'il prétend.

| Page | `reduce` | fade / card / section | `animation-name` calculé | déplacés |
|---|---|---|---|---|
| publique — `/fr` | **true** | 0 / 48 / 5 | `none`, `transform: none`, `opacity: 1`, `transition: opacity .12s` | 0 / 53 |
| publique — `/fr/properties` | **true** | 4 / 0 / 0 | idem | 0 / 4 |
| tableau de bord — `/app/properties` | **true** | 0 / 0 / 0 | — | 0 / 0 |
| tableau de bord — `/app` | **true** | 0 / 0 / 0 | — | 0 / 0 |
| **contrôle** `/fr` | false | 0 / 48 / 5 | **`cardEnter`**, **`sectionEnter`** | 0 / 53 |
| **contrôle** `/fr/properties` | false | 4 / 0 / 0 | **`fadeInUp`** | 0 / 4 |

Le CSSOM servi porte bien **trois** blocs `prefers-reduced-motion` disjoints — `.shimmer`, les trois
`.animate-*`, les quatre `.wizard-*` — et aucun sélecteur n'apparaît dans deux d'entre eux : AC3
tient, la borne de TCK-464 est intacte et non absorbée.

⚠ **Ce n'est PAS la colonne « déplacés » qui discrimine, et il faut le dire** : elle vaut 0 des deux
côtés. L'échantillon de rectangles est pris ~3,5 s après le chargement, quand des animations de
quelques centaines de millisecondes sont finies depuis longtemps ; il prouve l'absence de mouvement
résiduel, pas l'absence de mouvement. **Le discriminant réel est `animation-name`** : `cardEnter` /
`sectionEnter` / `fadeInUp` d'un côté, `none` de l'autre, sur exactement les mêmes éléments.
*Une mesure qui rend le même chiffre dans les deux branches ne sépare rien — la nommer plutôt que la
laisser cocher la case.*

### Ce que la mesure a démenti

La contrainte du ticket disait des trois animations qu'elles « s'appliquent sur **tout le produit**,
y compris des pages publiques ». **C'est l'inverse.** Les deux pages du tableau de bord ont bien
rendu — 1275 nœuds et « Mes biens » pour l'une, « Bonjour Demo » pour l'autre, session d'un agent de
démonstration — et **ne portent aucune des trois classes** ; les 57 occurrences relevées sont
publiques ou dans le gabarit d'authentification.

Ça ne change pas la règle, qui est juste et le reste. Ça change ce qu'on peut en dire : la garde
protège les pages publiques et le gabarit d'authentification, et le tableau de bord n'anime rien de
ce que ces trois noms recouvrent. *Une case cochée sur une page qui ne porte pas le motif aurait
attesté d'un vide.*
