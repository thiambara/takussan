---
id: TCK-468
title: "Les champs de formulaire font 32 px de haut là où les pastilles en font 44"
status: todo
phase: P2
family: front
estimate: M
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, mobile, accessibilite, design-system]
---

## Objectif utilisateur

Sur un téléphone, atteindre un champ de formulaire du premier coup, sans viser.

## Contrat de données

Aucun. Changement de primitives du design system.

## Direction UX / Artistique

Une cible tactile confortable tourne autour de 44 px. Le dépôt a deux régimes qui cohabitent sans
l'avoir décidé : les pastilles de choix du parcours de publication tiennent 44 px, les champs
`Input` et `Select` en font 32. L'écart se voit à l'usage sur la même page.

## Contraintes strictes (métier)

- `takussan-web/src/components/ui/input.tsx` et `.../ui/select.tsx` posent `h-8`.
- **WCAG AA (2.5.8) est tenu** — le minimum normatif est 24 px. Les 44 px relèvent de l'AAA et des
  recommandations Apple. Ce ticket est donc un choix de confort, pas une mise en conformité : le
  formuler autrement induirait en erreur sur son urgence.
- ⚠ `date-picker.tsx` **ne transmet pas son `className`** à sa cible cliquable : une correction
  posée au cas par cas resterait incomplète là, et c'est ce qui rend l'approche locale illusoire.
- Ces primitives sont partagées par ~110 pages. Toute reprise se juge sur l'ensemble, pas sur un
  écran.

## Delta à produire

- [ ] Décider du régime — aligner les primitives, ou assumer deux tailles et documenter laquelle
      s'emploie quand.
- [ ] Traiter le cas de `date-picker.tsx`, qui n'accepte pas la personnalisation aujourd'hui.
- [ ] Passer en revue les écrans denses, où un gain de hauteur se paie en défilement.

## Critères d'acceptation

- [ ] AC1 — sur la page de publication et sur la page d'édition d'un bien, champs et pastilles ont
      des cibles tactiles cohérentes entre elles.
- [ ] AC2 — `FormDatePicker` accepte la même personnalisation que les autres champs.
- [ ] AC3 — aucune page dense ne gagne de défilement vertical inattendu ; vérifié au navigateur.

## Hors périmètre

- Refonte de la densité générale du tableau de bord.

## Notes d'implémentation

Relevé par l'implémenteur puis confirmé par la revue de la tâche 8 de TCK-464, et laissé hors
périmètre à ce moment-là : corriger globalement touchait tout le parc, corriger localement
dupliquait quinze fois et restait incomplet.
