---
id: TCK-122
title: Biens similaires — câblage frontend sur la fiche bien
status: done
phase: P2
family: bug
estimate: S
wave: 13
created: 2026-04-29
updated: 2026-04-29
depends_on: [TCK-099]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [front, bug, p2, property, similar]
---

## Objectif utilisateur

Le visiteur voit des suggestions de biens similaires en bas de la fiche bien, lui permettant de poursuivre sa recherche sans revenir à la liste.

## Contrat de données

TCK-099 (en Review) expose l'endpoint `GET /api/properties/{id}/similar` retournant une liste de biens avec les champs habituels. Consommer cet endpoint depuis la page de détail.

## Direction UX / Artistique

Section horizontale scrollable de 4-6 cartes propriété, sous le contenu principal de la fiche. Réutiliser le composant carte de bien existant. Label "Biens similaires" ou "Vous pourriez aussi aimer".

## Contraintes strictes (métier)

La section ne doit pas bloquer le rendu de la fiche : affichage conditionnel si la requête retourne des résultats, absent si vide ou erreur.

## Delta à produire

- [x] Dans la page `src/app/(public)/properties/[slug]/page.tsx` (ou son Client Component), appeler `GET /api/properties/{id}/similar`
- [x] Afficher les biens retournés dans une section dédiée sous le contenu principal
- [x] Gérer l'état vide (aucun résultat → section absente, pas de message d'erreur)

## Critères d'acceptation

- [x] La section "Biens similaires" apparaît sur la fiche bien quand l'endpoint retourne des résultats
- [x] Les cartes sont cliquables et naviguent vers la fiche du bien correspondant
- [x] La section est absente si l'API retourne un tableau vide
- [x] Aucune régression sur le reste de la fiche bien

## Hors périmètre

- Algorithme de similarité (géré côté backend dans TCK-099)
- Personnalisation par historique utilisateur

## Notes d'implémentation

Implémentation déjà en place avant la création du ticket. Trois fichiers concernés :
- `src/hooks/useSimilarProperties.ts` — `apiFetch` vers `/api/public/properties/{slug}/similar`
- `src/app/(public)/properties/[slug]/components/PropertySimilar.tsx` — carrousel Embla avec `PropertyCard`, squelette de chargement, `null` si tableau vide
- `src/app/(public)/properties/[slug]/page.tsx:150` — `<PropertySimilar slug={property.slug} />`

Build vérifié sans erreur (`npm run build`).
