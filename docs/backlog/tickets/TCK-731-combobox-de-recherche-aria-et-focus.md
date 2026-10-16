---
id: TCK-731
title: "Champ de recherche : combobox ARIA 1.2 sans référence pendante, nommé, et focus visible"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-31--passage-axe-au-navigateur-sur-les-parcours-publics"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa"
tags: [front, search, a11y, pistes]
---

## Contexte

Réfs : **P31.01** (🔴, `retenu · autonome`, A4 et A5) et **P07.06** (🟠, `retenu · autonome`,
A4) du fichier de pistes. Même composant, même cause, même correctif : le mesureur de P31.01
renvoie l'anneau de focus et le motif ARIA à P07.06, « à traiter dans le même ticket ».

`SearchAutocomplete` (barre publique, saisie mobile, barre de la console) porte
`role="combobox"` sur un `div` (motif ARIA 1.1) et `role="searchbox"` sur l'`input`. Les deux
portent `aria-controls` vers la liste, qui n'est montée qu'ouverte : axe rend
`aria-valid-attr-value` (critique) sur chaque page publique à 1280 px. L'`input` n'a pas de nom
hors de son placeholder, il porte `outline-none`, et rien ne le remplace : au clavier, aucun style
calculé ne change au focus.

## Objectif utilisateur

Un visiteur au clavier ou au lecteur d'écran voit où est le focus dans le champ de recherche, et
entend un combobox nommé dont chaque référence mène à un élément présent.

## Contrat de données

Aucun : le composant et ses appels à `/api/public/search/suggest` ne changent pas.

## Direction UX / Artistique

Aucun design neuf. L'anneau reprend les jetons et motifs existants : `ring-2 ring-ring` sur fond
clair (comme les entrées de la `Navbar`), contour `outline-2 outline-offset-2` au jeton
`primary-foreground`, l'encre de la variante, sur la barre sombre de la console (le motif
d'`ANNEAU_FOCUS` d'`AppTopbar`, par jeton : `check-super-admin-tokens` refuse le blanc sous `/app`).

## Contraintes strictes (métier)

- Aucun texte neuf : le nom de l'`input` est le texte qu'il affiche déjà (le `placeholder` passé,
  sinon la clé existante `search.suggest.placeholder`).
- Le comportement clavier et les URL produites ne changent pas.
- Une référence ARIA (`aria-controls`, `aria-activedescendant`) ne vise que ce qui est rendu.

## Delta à produire

- [x] `role="combobox"`, `aria-expanded`, `aria-haspopup`, `aria-label` portés par l'`input` ;
      le `div` ne porte plus de rôle.
- [x] `aria-controls` seulement liste ouverte ; `aria-activedescendant` seulement si l'option
      est rendue (hors chargement).
- [x] Anneau de focus sur la pilule ; dans la barre publique de bureau, sur la pilule visible,
      celle du champ y étant aplatie.
- [x] Test de rendu qui vérifie qu'aucune référence ARIA du composant ne vise un `id` absent,
      fermé comme ouvert ; tests existants passés de `searchbox` à `combobox`.

## Critères d'acceptation

- [x] AC1 — fermé, prérempli, ouvert, en chargement après une flèche, refermé par Échap :
      aucune référence pendante.
- [x] AC2 — un seul combobox, l'`input`, nommé par son texte affiché, `aria-expanded` juste.
- [x] AC3 — la pilule porte un anneau de focus sur un jeton existant, dans les deux variantes.

## Hors périmètre

- Le focus des autres champs et l'opacité de l'anneau général des primitives : P07.09.
- Le rejeu d'axe au navigateur : aucun navigateur dans ce passage, la garde est le test de rendu.

## Notes d'implémentation

- Ablation : correctif retiré du seul `SearchAutocomplete.tsx`, le test neuf rend 9 rouges sur 9
  (`div[aria-controls]` et `input[aria-controls]` pendants, aucun combobox nommé, aucune classe
  de focus). Retrait du seul garde `optionActiveRendue` (retour à `activeIndex >= 0`) : le test
  « ouvert pendant un chargement » rougit sur `input[aria-activedescendant=…-item-0]`.
  `Navbar.tsx` remis à `pre-dev` : le test neuf de `Navbar.responsive.test.tsx` rougit (1 sur 7).
- Piège : la barre publique de bureau aplatit la pilule du champ par
  `[&>div:first-child]:…` ; un `focus-within:ring` y aurait dessiné un rectangle dans la pilule
  arrondie. L'anneau y passe sur la pilule extérieure, par `has-[input:focus-visible]` pour ne pas
  doubler celui du sélecteur Acheter | Louer et de la loupe.
