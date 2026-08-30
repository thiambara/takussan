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

- [x] Décider du régime — aligner les primitives, ou assumer deux tailles et documenter laquelle
      s'emploie quand.
- [x] Traiter le cas de `date-picker.tsx`, qui n'accepte pas la personnalisation aujourd'hui.
- [x] Passer en revue les écrans denses, où un gain de hauteur se paie en défilement.

## Critères d'acceptation

- [x] AC1 — sur la page de publication et sur la page d'édition d'un bien, champs et pastilles ont
      des cibles tactiles cohérentes entre elles.
- [x] AC2 — `FormDatePicker` accepte la même personnalisation que les autres champs.
- [x] AC3 — aucune page dense ne gagne de défilement vertical inattendu ; vérifié au navigateur.

## Hors périmètre

- Refonte de la densité générale du tableau de bord.

## AC3 — le défilement, mesuré au navigateur le 2026-08-29

`next dev` sur `127.0.0.1:3000`, Chrome à 1440×900, session d'administrateur d'agence, jeton émis
pour la mesure puis **révoqué**. Chaque chiffre est un `getBoundingClientRect()` ou un
`scrollHeight` lu sur l'écran servi.

### La question ne se pose que sur DEUX écrans, et c'est vérifiable

```
$ grep -rn 'fieldDensityScope\|data-field-density' src --include='*.tsx' | grep -v __tests__
  property-form/PropertyForm.tsx:239    ← l'édition
  property-form/PropertyWizard.tsx:478  ← la publication
```

Aucun autre fichier n'ouvre la portée. Hors d'elle, la classe `in-data-[…]:h-11` est **inerte** :
les ~110 autres pages du parc ne peuvent pas gagner un pixel, et il n'y a donc rien à rouvrir chez
elles. *C'est la propriété que l'arbitrage a achetée, et c'est elle qui rend cet AC vérifiable.*

### Le relevé — par ABLATION, pas par arithmétique

La portée retirée, `next dev` recompilé, le MÊME script rejoué. L'arithmétique naïve
(19 champs × 12 px + 7 pastilles × 14 px = 326 px) est fausse : les champs vivent en grille, donc
seul le nombre de RANGÉES compte.

**Édition — `/app/properties/2?tab=edit`** (le scroller est le `<main>`, `overflow-y-auto`) :

| | champs | pastilles | `<form>` | `main.scrollHeight` | page déborde |
|---|---|---|---|---|---|
| sans portée | 19 × **32** + 1 × 64 | 7 × **30** | 1943 | 2167 | **non** |
| avec portée | 19 × **44** + 1 × 64 | 7 × **44** | 2065 | 2289 | **non** |
| **delta** | | | **+122 px** | **+122 px** | — |

Distance de défilement : 1523 px → 1645 px sur un viewport de 644, soit **+8,0 %**.

**Publication — `/app/properties/new`, étape 2** (six champs, le scroller est le
`min-h-0 flex-1 overflow-y-auto` du parcours) :

| | champs | `scrollHeight` | `clientHeight` | page déborde |
|---|---|---|---|---|
| sans portée | 6 × **32** | 829 | 403 | **non** |
| avec portée | 6 × **44** | 865 | 403 | **non** |
| **delta** | | **+36 px** | — | — |

### Le verdict, et ce qu'il ne dit pas

**Aucun défilement INATTENDU.** Les deux écrans défilaient déjà avant ce ticket, dans des
conteneurs qui déclarent `overflow-y-auto` — c'est leur mise en page, pas un effet de bord. Et
`document.documentElement` ne déborde dans **aucun** des quatre états mesurés : la coquille du
tableau de bord tient la hauteur du viewport et le défilement vit dans le `<main>`, avant comme
après.

Ce qui augmente est la **distance** de défilement, de 8 % environ des deux côtés. C'est le prix
assumé de la cible tactile — et il est ici chiffré plutôt que qualifié.

⚠ **Ce qui n'a PAS été mesuré, et qu'il ne faut pas lire comme mesuré** : les étapes 4 à 6 du
parcours (dont celle qui porte le `FormDatePicker`) et le rendu mobile. La navigation entre étapes
exige de remplir les champs requis ; l'étape 2 a été retenue parce qu'elle est la plus dense en
champs. Un viewport étroit change les grilles en colonne unique, donc le delta y serait plus grand
— proche de l'arithmétique naïve. À rouvrir si un écran mobile se plaint.

## Notes d'implémentation

Relevé par l'implémenteur puis confirmé par la revue de la tâche 8 de TCK-464, et laissé hors
périmètre à ce moment-là : corriger globalement touchait tout le parc, corriger localement
dupliquait quinze fois et restait incomplet.
