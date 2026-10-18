---
id: TCK-869
title: "Champs nommés autrement que par leur placeholder, sélecteur de taille de page nommé"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#11-gestion-des-biens"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa"
tags: [front, accessibilite, pistes]
---

## Contexte

Réf : **P07.08** du fichier de pistes, `retenu · autonome` (classement A4). Des champs ne sont
nommés que par leur placeholder (bornes numériques du panneau de filtres, avis, message du contact
authentifié), et le sélecteur de taille de page de `PropertyPagination` n'a aucun nom.

## Objectif utilisateur

Un visiteur au lecteur d'écran entend ce que demande chaque champ, même une fois rempli, et le
nom du sélecteur de taille de page de la liste des biens.

## Contraintes strictes

- Aucun texte neuf : les noms viennent de clés existantes (titre de section, `min`/`max`,
  `titlePlaceholder`, `contentPlaceholder`, `messagePlaceholder`, `search.toolbar.perPageAria`).
- **Hypothèse** : le sélecteur prend `search.toolbar.perPageAria` (« Résultats par page »), déjà
  employé par la barre de recherche, plutôt que `perPagePlaceholder` (« 20 / page »), qui dirait
  une valeur fausse dès qu'on en choisit une autre.
- **Mesuré** : des 14 fichiers qui combinent une taille de page et un `SelectTrigger`, seul
  `PropertyPagination` laisse son sélecteur sans nom (les autres portent `aria-label` ou un `id`
  relié à un `<label>`) ; le constat de « 8 listes » ne tient plus.

## Delta à produire

- [x] `FilterSidebar` : le titre de `Section` porte un `id`, et chaque borne de `RangeInputs` se
      nomme par `aria-labelledby` = titre + borne (`hidden`).
- [x] `PropertyReviewForm`, `PropertyContactMessageDialog` : `aria-label` du texte du placeholder.
- [x] `PropertyPagination` : `aria-label` sur le `SelectTrigger`.
- [x] Un cas par composant dans les tests existants.

## Critères d'acceptation

- [x] AC1 — Les bornes du budget se nomment « Budget (FCFA) Min » et « Budget (FCFA) Max ».
- [x] AC2 — Les deux champs de l'avis et le message du contact authentifié portent un `aria-label`.
- [x] AC3 — Le sélecteur de taille de page est un `combobox` nommé « Résultats par page ».

## Hors périmètre

- Le recompte des « 21 champs » du constat d'origine, que la mesure n'a pas refait.

## Notes d'implémentation

- **Ablation** : sources d'avant remises, tests gardés → 4 rouges sur 4 cas neufs ; correctif
  remis → verts.
- Les tests de l'avis et du contact vérifient l'attribut `aria-label`, et non le nom calculé :
  un nom tiré du placeholder par repli les laisserait verts sans correctif.
- Le titre de `Section` passe par un contexte (`TitreDeSection`) : `RangeInputs` est rendu en
  enfant de la section, sans prop pour le relier.
