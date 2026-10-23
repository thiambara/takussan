---
id: TCK-1762
title: "Un avis envoyé retire le formulaire d'avis de la fiche"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-172--lectures-du-navigateur-faites-par-fetch-dans-un-useeffect-hors-de-tanstack-query"
tags: [front, avis, fiche-publique, pistes]
---

## Contexte

Réf : **P172.02** du fichier de pistes, `retenu · autonome` (A1).

Après un envoi réussi, `PropertyReviews` ne relisait que la liste publique des avis, qui ne montre
pas un avis en attente de modération, et jamais l'éligibilité : le formulaire vidé restait
affiché, sans rien dire, et un second envoi rendait 422 `review.property_already_reviewed`.
TCK-180 écrit qu'un utilisateur qui a déjà publié un avis, modéré ou non, ne voit plus le
formulaire.

## Objectif utilisateur

L'auteur d'un avis voit, sitôt l'envoi réussi, que son avis est laissé, et ne peut plus en
renvoyer un second.

## Contrat de données

Aucun changement d'API : `POST /api/properties/{id}/reviews` (201) établit que l'avis existe.

## Contraintes strictes (métier)

- Un envoi en échec garde le formulaire et son message d'erreur.
- Aucun texte neuf : le message affiché est la clé existante `property.reviews.alreadyReviewed`.

## Delta à produire

- [x] `PropertyReviews` : après un envoi réussi, l'éligibilité active passe à « déjà laissé »
  pour ce bien et cet utilisateur.
- [x] Test vitest : envoi réussi → formulaire retiré, message « déjà laissé » ; envoi en échec →
  formulaire gardé.

## Critères d'acceptation

- [x] AC1 — un envoi réussi retire le formulaire et affiche `property.reviews.alreadyReviewed`.
- [x] AC2 — un envoi en échec garde le formulaire.

## Hors périmètre

- Un message « votre avis attend la modération » : texte neuf (V7), laissé au porteur.
- La relecture de l'éligibilité à chaque `refreshUser()` (P172.04, TCK-1764).

## Notes d'implémentation

- Hypothèse (mode sans humain) : la réponse 201 suffit à établir « déjà laissé » ; aucune
  relecture de l'éligibilité, qui coûterait un aller-retour pour la même réponse.
- Ablation : `PropertyReviews.tsx` rendu à `HEAD` → 1 rouge sur 2 (formulaire toujours là, aucun
  « déjà laissé ») ; correctif remis → 2/2 verts.
