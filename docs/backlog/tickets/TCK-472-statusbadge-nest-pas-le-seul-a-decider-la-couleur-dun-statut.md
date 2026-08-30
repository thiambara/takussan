---
id: TCK-472
title: "`StatusBadge` affirme être le seul à décider la couleur d'un statut ; ils sont quatre"
status: todo
phase: P2
family: technique
estimate: M
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: [TCK-450]
blocks: []
spec_refs:
  features:
    - docs/features.md#console
tags: [front, design-system, contraste, dette]
---

## Objectif utilisateur

Un même statut doit avoir la même couleur partout dans le produit. Aujourd'hui « disponible » est
vert dans la console et vert *d'une autre façon* dans le tableau de bord des biens, sans qu'aucune
décision ne l'ait voulu.

## Le défaut — une affirmation fausse, et ce qu'elle a coûté

Le docblock de `console/StatusBadge.tsx` ouvre sur :

> *« Les classes de chaque ton — **le seul endroit du dépôt où la couleur d'un statut est
> décidée**. »*

Relevé le 2026-08-29 : **ils sont quatre à en décider**, plus une enveloppe légitime.

| fichier | rôle | décide la couleur ? |
|---|---|---|
| `console/StatusBadge.tsx:80` | la table des cinq tons | ✓ **le vrai** |
| `kyc/kyc-components.tsx:268` | homonyme, mappe `KycDossierStatus` → ton et **délègue** | ✗ — **la forme juste** |
| `customer-dashboard/CustomerList.tsx:171` | homonyme LOCAL | ✓ en double |
| `property-dashboard/PropertyList.tsx:534` | homonyme LOCAL | ✓ en double |
| `property-dashboard/PropertyStatusBadge.tsx` | composant à part | ✓ en double |

⚠ **Trois composants portent le NOM `StatusBadge` sans être celui-là.** Dans un fichier qui définit
son propre `StatusBadge`, `<StatusBadge …>` résout vers le local — et rien, ni au typage ni au
lint, ne le signale. `kyc-components.tsx` montre la seule façon d'écrire un homonyme sans dupliquer
la décision : il importe le vrai sous alias (`ConsoleStatusBadge`) et ne fait que traduire un
statut métier en ton.

## Pourquoi c'est plus qu'un doublon : un des quatre porte un contraste que TCK-450 a mesuré sous AA

`property-dashboard/PropertyList.tsx:544` :

```tsx
status === 'sold' && 'bg-success/15 text-success',
```

`success/15` est exactement l'aplat que **TCK-450 a écarté sur mesure** : 4,29:1 en thème clair sur
`bg-muted` plein, sous le seuil AA de 4,5:1. La console est passée à `/10` pour cette raison ; ce
fichier-ci ne l'a pas suivie, puisqu'il ne lit pas la table.

⚠ **Ne pas conclure que ce site échoue** : ses propres surfaces sont `hover:bg-muted/30` et
`bg-primary/5` (l. 208-209), **pas** `bg-muted` plein, et elles n'ont PAS été mesurées à `/15`.
C'est le travail de ce ticket, pas une conclusion à recopier. *Le défaut établi est la
DUPLICATION ; le contraste est une hypothèse à éprouver.*

## Pourquoi l'AC3 de TCK-450 ne pouvait pas les voir

Sa commande de relevé part des fichiers qui **importent** `StatusBadge` du barrel `console`, puis
y cherche les formes qui résolvent un ton. Un homonyme local n'importe rien : il est invisible par
construction.

> *Un relevé qui part des importateurs ne voit jamais les doublons — il ne voit que les usages
> corrects.*

## Contrat de données

Aucun.

## Delta à produire

- [ ] Décider, pour chacun des trois doublons : **absorbé** par `StatusBadge` (avec un ton neuf si
      son vocabulaire l'exige), ou **conservé et justifié** par écrit.
- [ ] Corriger l'affirmation du docblock de `console/StatusBadge.tsx` — quelle que soit la décision.
      Une affirmation fausse en tête du fichier canonique est ce qui a permis aux doublons de vivre.
- [ ] Mesurer les surfaces réelles de `PropertyList` avant de toucher son `/15`.

## Critères d'acceptation

- [ ] **AC1** — le relevé des composants qui décident une couleur de statut est pris par une
      commande qui **ne part pas des importateurs** (chercher les définitions, ou les littéraux de
      classe de statut), et il est écrit dans le ticket avec sa date.
- [ ] **AC2** — chaque doublon est soit supprimé, soit accompagné d'une phrase disant ce que
      `StatusBadge` ne sait pas faire pour lui. *« C'est historique » n'est pas cette phrase.*
- [ ] **AC3** — le contraste des tons de chaque composant conservé est mesuré **sur ses propres
      surfaces**, dans les deux thèmes, par calcul.
- [ ] **AC4** — une garde refuse qu'un composant neuf redéfinisse un `StatusBadge` local, ou à
      défaut le déclare comme non gardé, nommément, dans l'en-tête du fichier canonique.
- [ ] **AC5** — ablation : rétablir l'un des doublons supprimé fait rougir AC1 ou AC4 — et le
      vérifier, car une garde qui ne cherche que les trois noms connus ne garde rien.

## Hors périmètre

- Les bannières et encarts qui emploient `bg-warning/10` ou `bg-destructive/10` pour un **message**
  et non pour un statut : ce n'est pas le même vocabulaire.
- `GlobalAnnouncementBanner.tsx`, déjà nommé dans le hors-périmètre de TCK-450, qui rend la même
  donnée en palette Tailwind brute et mérite son propre ticket.

## Notes d'implémentation

Relevé par la session pendant la vérification indépendante de TCK-450, en cherchant un écran qui
porterait à la fois le sage `--accent` et le vert `--success`.
