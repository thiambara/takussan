---
id: TCK-118
title: Recherche homepage — texte de localisation ignoré et non préservé
status: done
phase: P1
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
tags: [front, bug, p1, search, homepage]
---

## Objectif utilisateur

Le visiteur tape une ville ou un quartier dans la barre de recherche de la page d'accueil et arrive sur `/properties` avec ce texte appliqué comme filtre de localisation.

## Contrat de données

Le backend accepte `filter[city]=Dakar` ou `filter[search]=Dakar` via Spatie Query Builder. La page `/properties` synchonise déjà les paramètres URL avec les filtres. L'enjeu est la transmission correcte depuis la homepage.

## Direction UX / Artistique

Le texte saisi doit apparaître pré-rempli dans le champ de recherche de la page de résultats après la redirection — cohérence visuelle attendue par l'utilisateur.

## Contraintes strictes (métier)

Le paramètre d'URL doit être compatible avec le format attendu par le composant de filtres de `/properties`. Voir le ticket TCK-061 (divergences `q=` / `city=` / `search=` — arbitrage à respecter).

## Delta à produire

- [ ] Localiser le handler de soumission de la barre de recherche sur la homepage (probablement dans `src/components/home/Hero.tsx` ou similaire)
- [ ] Corriger le paramètre URL passé à la redirection vers `/properties` : utiliser le paramètre de filtre localisation reconnu par la page de résultats
- [ ] S'assurer que le composant de filtre de `/properties` initialise le champ depuis ce paramètre URL (texte visible après redirection)
- [ ] Vérifier que la soumission sans texte de ville redirige vers `/properties` sans paramètre erroné

## Critères d'acceptation

- [ ] Taper "Dakar" dans la barre de recherche homepage + valider redirige vers `/properties?filter[city]=Dakar` (ou le paramètre canonique)
- [ ] La valeur "Dakar" est visible dans le champ de recherche de la page résultats après redirection
- [ ] Soumettre sans texte redirige vers `/properties` sans filtre parasite
- [ ] Aucune régression sur les autres filtres de la page de résultats

## Hors périmètre

- Autocomplétion de la recherche (couverte par TCK-107)
- Filtres autres que la localisation (type, prix…) sur la homepage

## Notes d'implémentation

Deux bugs distincts résolus :
1. `SearchAutocomplete` gérait son propre état `query` sans l'exposer au parent. La Navbar n'avait donc jamais de valeur dans `location` pour le chemin desktop → `city=` absent de l'URL. Fix : prop `onQueryChange` optionnel, branché via `setLocation(v)` dans la Navbar.
2. Le fallback Enter (sans sélection dropdown) poussait `q=<query>` au lieu de `city=<query>`, donc le champ Ville du FilterSidebar restait vide. Fix : remplacement direct dans `handleKeyDown`.

Le chemin mobile (input plain `<input>` → état `location`) fonctionnait déjà correctement et n'a pas été modifié.
