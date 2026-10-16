---
id: TCK-660
title: "La note d'un avis sur la fiche d'un bien se lit au lecteur d'écran"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#111-avis--réputation
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa
tags: [front, accessibilite, contraste, i18n, pistes]
---

## Contexte

Réf : **P07.04** du fichier de pistes (classement A4 : un nom accessible qui reprend un libellé
déjà traduit, et une encre ramenée sur son jeton plein, sans texte de produit neuf).

Sur la fiche publique d'un bien, chaque avis affiche sa note par cinq `<Star>` de lucide, que
lucide marque `aria-hidden` dès qu'aucun attribut `aria-*` ne lui est passé. Aucun texte ne porte
la note : un lecteur d'écran lit l'auteur et le commentaire, jamais la note. Les étoiles vides,
en `text-muted-foreground/40`, rendent 1,78:1 sur `--card` en thème clair et 2,28:1 en sombre,
sous les 3:1 d'un objet graphique (WCAG 2.2 §1.1.1 et §1.4.11).

## Objectif

La note de chaque avis a un nom accessible dans la langue de l'utilisateur, et ses étoiles vides
tiennent 3:1.

## Delta à produire

- [x] `PropertyReviews.tsx` (`ReviewItem`) : le groupe d'étoiles reçoit `role="img"` et
      `aria-label` = `publicProfile.reviews.ratingAria` (« {rating} étoiles sur 5 », traduit en
      `en` et `wo`), le libellé qu'emploie déjà `ReviewsSection` pour la même chose.
- [x] Étoiles vides : `text-muted-foreground` plein au lieu de `/40`.
- [x] `encre-sans-alpha.contraste.test.ts` : `PropertyReviews.tsx` sort de `RESTANTS`.
- [x] Test : `PropertyReviews.note.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un avis noté 4 expose un élément `img` nommé « 4 étoiles sur 5 » (« 4 stars out of
      5 » en anglais).
- [x] AC2 — L'étoile vide tient ≥ 3:1 sur `--card` et `--background`, dans les deux thèmes.

## Hypothèses (mode sans humain)

- La `Piste` propose `role="img" aria-label` ou un `sr-only`. `role="img"` est retenu : un seul
  nom pour le groupe, les étoiles restant décoratives, sans dupliquer de texte dans le DOM.
- La clé est réutilisée depuis `publicProfile.reviews` plutôt que dupliquée sous
  `property.reviews` : même texte, déjà traduit dans les trois langues.

## Hors périmètre

- `ReviewsSection.tsx` porte son `aria-label` sur un `div` sans rôle (nom ignoré par une partie
  des lecteurs d'écran) et ses étoiles vides en `text-border` (1,26:1, dette consignée dans
  `surface-publique.contraste.test.ts`). Non traités ici.

## Notes d'implémentation

- Rouge avant correctif : 4 tests — aucun `img` nommé (fr, en) ; étoile vide à 1,78:1 (clair) et
  2,28:1 (sombre) sur `--card`.
- Ablation (`PropertyReviews.tsx` remis, tests gardés) : les 4 mêmes rouges, plus le cliquet
  `RESTANTS` (12 fichiers au lieu de 11) ; correctif remis : vert.
- Les étoiles se retrouvent par `svg.lucide-star` dans l'avis, et non par le rôle `img` : sans
  cela, le test de contraste échouerait sur l'absence de nom et non sur le contraste.
