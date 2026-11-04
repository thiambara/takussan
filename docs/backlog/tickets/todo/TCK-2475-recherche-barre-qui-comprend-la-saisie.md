---
id: TCK-2475
title: "Recherche : la barre de recherche suggère au fil de la frappe — la saisie comprise, les recherches populaires, les lieux, trois biens, et l'alerte quand rien ne correspond"
status: todo
phase: P2
family: front
estimate: L
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2474]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  models: []
tags: [front, search, suggestion, adr-0088]
---

## Objectif utilisateur

Le visiteur trouve ce qu'il cherche en tapant trois mots : la barre comprend, propose, montre déjà des biens, et lui
offre d'être alerté quand rien ne correspond encore.

## Contrat de données

`GET /api/search/suggest` de TCK-2474 (clés `interpretation`, `completions`, `popular`, `places`, `previews`, et les
clés existantes). L'URL de la liste se construit par la table des clés de recherche existante (`SEARCH_FILTER_KEYS`,
`parametreDe`, `urlDeSuggestion`) : une suggestion comprise mène à la liste filtrée par ses critères. L'alerte sans
compte et la recherche sauvegardée existent (TCK-599) : les réutiliser.

## Direction UX / Artistique

- **Champ vide au focus** : « Récentes » (les dernières recherches de l'appareil, effaçables, stockage local enveloppé de
  `try/catch`), « Populaires » (`popular`), et deux raccourcis Louer / Acheter.
- **Pendant la frappe**, dans cet ordre : la saisie comprise en première ligne, sous forme de puces lisibles (« Appartement ·
  3 chambres · Almadies · ≤ 500 000 F ») avec son nombre de biens — c'est la suggestion par défaut d'Entrée ; puis les
  complétions populaires (le texte tapé en surbrillance), les lieux et types, puis trois biens en aperçu (vignette, prix,
  quartier) qui ouvrent la fiche.
- **Rien ne clignote** : les résultats précédents restent affichés pendant le chargement ; une réponse périmée n'écrase
  jamais une plus récente ; anti-rebond court (≈ 100 ms).
- **Zéro résultat** : une ligne « Être alerté quand un bien correspond » qui ouvre l'alerte existante pré-remplie des
  critères compris.
- Clavier complet (flèches, Entrée, Échap, Tab), lecteurs d'écran (rôle combobox, annonce du nombre de suggestions),
  cibles tactiles confortables à 360 px, mêmes comportements dans la barre de l'accueil, la navbar et la barre de l'app.
- Charte « Ancrage Local Contemporain » (`docs/design-guidelines.md`) ; textes par next-intl (fr, en ; wo = français tel
  quel, wolof en pause). Les libellés des puces viennent des traductions existantes des filtres, jamais de l'API.

## Contraintes strictes (métier)

- Les tests ARIA et de rendu existants (`SearchAutocomplete.aria.test.tsx`, `SearchAutocomplete.test.tsx`,
  `rendu-serveur.test.tsx`) restent verts ou sont mis à jour pour le nouveau comportement, jamais supprimés.
- `useApiQuery` : le préfixe `/api` s'écrit par l'appelant.
- Aucune recherche n'est envoyée au journal depuis la barre (le serveur journalise la recherche validée).

## Critères d'acceptation

- [ ] AC1 — Taper « appart 3ch almadies » montre la saisie comprise en tête ; Entrée ouvre la liste filtrée par ces critères.
- [ ] AC2 — Focus sur le champ vide : récentes et populaires ; une recherche faite apparaît dans les récentes.
- [ ] AC3 — Une saisie sans résultat propose l'alerte, pré-remplie.
- [ ] AC4 — Tests Vitest de ces trois parcours ; `npm run lint`, `npx tsc --noEmit`, `npm run check:*` verts.

## Hors périmètre

- La compréhension elle-même (serveur, TCK-2473/2474).

## Notes d'implémentation

### Re-mesures (2026-11-04, arbre de `feat/radar-2-et-suggestions` après `e93adad04`)

- **Une seule barre, déjà** : `SearchAutocomplete` est posée par la `Navbar` publique (pilule de bureau dès `lg`, et
  saisie mobile dans sa feuille — c'est elle, la « barre de l'accueil » : l'accueil n'a pas d'autre champ de
  recherche) et par `AppTopbar` (`/app`, variante `navbar`). Rien n'était à fusionner : le travail est dans le
  composant, les trois usages en héritent.
- Lecteurs des anciennes clés avant le ticket : `SearchAutocomplete` et `SearchEmpty` (`cities`, `neighborhoods`,
  `property_types`). Après : **plus rien ne lit `cities` ni `neighborhoods`** ; `property_types` reste lu (les types
  seuls, quand la saisie comprise n'en porte pas). Les clés ne sont PAS retirées de l'API (hors périmètre).
- L'API locale rendait 500 pendant le travail (`search_aliases` absente : migration de TCK-2476 non jouée) : tous les
  tests doublent `apiRequest`, aucun ne lit l'API locale. Pas de relevé au navigateur.

### Décisions

1. **`count: 0` n'est pas une impasse** (décision de la session) : la ligne comprise reste cliquable, son compte
   devient « Voir des biens proches », et « Être alerté quand un bien correspond » s'ajoute sous elle. L'alerte n'est
   proposée **que** sur une compréhension à 0 : sans compréhension, le panneau ne connaît pas le nombre de biens.
2. **Entrée** : l'option active si l'on a navigué aux flèches ; sinon la compréhension **si elle répond à la saisie
   courante** (`pour` de `useSuggest`, faux pendant l'anti-rebond et sur une donnée gardée de la saisie
   précédente) ; sinon le texte libre (`q`), comme avant. La compréhension périmée reste AFFICHÉE (rien ne
   clignote) mais n'est jamais validée. Un repère « ↵ Entrée » (dès `sm`) marque la ligne que valide Entrée.
3. **URL** : `@/lib/suggestions-de-recherche` relit les `criteria` par les lecteurs de `SEARCH_FILTER_KEYS` et les
   réécrit par ses écrivains (clé inconnue ou de contrôle écartée). Le terme d'avant est remplacé (résidu en `q`),
   une ville comprise retire quartier et région d'avant, les autres filtres de l'URL et ce qu'impose l'appelant
   (« Acheter | Louer ») restent ; un critère compris l'emporte sur l'imposé. Un **lieu** passe toujours par
   `urlDeSuggestion` (il garde `q`, comportement de TCK-439 inchangé).
4. **Puces** : libellés de `puceDeChaqueFiltreActif` (aucun libellé de l'API), dans l'ordre TAPÉ (`parts[].from`),
   puis ce qu'implique la saisie (la ville d'un quartier), puis le texte restant. Types seuls traduits par
   `property.types` (repli sur le libellé de l'API pour une valeur inconnue du dictionnaire).
5. **Récentes** : `@/lib/recherches-recentes` — `localStorage` enveloppé de `try/catch`, 6 au plus (au stockage, pas
   seulement à la lecture), dédoublonnées par destination, effaçables par une option « Effacer les récentes ».
   Retenues : toute navigation de la barre vers la liste, et la loupe de la `Navbar`. Pas l'ouverture d'un aperçu.
   Elles ne partent jamais au serveur (le journal reste celui de la recherche validée, ADR-0088).
6. **Alerte** : `SaveSearchDialog` existant (TCK-599), chargé par `next/dynamic` (zod hors des pages publiques),
   avec une prop neuve `alerteCochee` : la case « m'alerter » part cochée depuis ce geste, décochée partout ailleurs.
   Le visiteur sans compte y trouve le formulaire « Me prévenir » ; critères = ceux de l'URL que la ligne comprise
   ouvrirait.
7. **Accessibilité** : combobox ARIA 1.2 inchangé (rôle sur l'`input`), `listbox` > `group` (titré) > `option` ; les
   lignes d'action (texte libre, alerte, effacer, raccourcis) sont des options, donc atteignables aux flèches ;
   flèches en boucle, Entrée, Échap, Tab (referme), clic dans un champ déjà focalisé (rouvre) ; annonce
   `role="status"` du nombre de suggestions une fois la réponse arrivée. Cibles de 44 px (`min-h-11`), panneau
   `min-w-[320px]` puis 400 px dès `sm`, défilant (`max-h-[min(70dvh,34rem)]`), option active ramenée en vue.
8. **Anti-rebond 100 ms** (150 avant), saisie rognée avant l'envoi ; `keepPreviousData` ; chaque saisie a sa clé de
   cache, donc une réponse arrivée après une plus récente ne l'écrase pas (épinglé par un test).

### Gardes touchées

- `surface-publique.contraste.test.ts` : `ENCRES_INVERSES` 264 → 270, cause datée dans le fichier (6 entrées
  `text-muted-foreground` neuves de `SearchAutocomplete.tsx`, sur le fond du panneau).
- `src/i18n/namespaces.json` régénéré (`--update`) : `property` monte à la frontière `(dashboard)/app` (la barre de
  l'app traduit types et périodes) et quitte les 9 sous-frontières qui le déclaraient ; `(dashboard)/app` à 32,4 %
  (plafond 38 %).

### À reporter dans les specs (`docs/features.md`, `/sync-specs`)

- Ligne « Suggestions d'autocomplétion » : la barre de recherche (navbar publique, saisie mobile, barre de l'app) —
  champ vide : récentes de l'appareil (6, effaçables, locales), populaires, raccourcis Louer / Acheter ; pendant la
  frappe : saisie comprise en tête (puces, nombre de biens, Entrée la valide), recherches fréquentes, lieux, types,
  trois biens en aperçu ; compte nul : « Voir des biens proches » et « Être alerté quand un bien correspond »
  (alerte de TCK-599 pré-remplie, case cochée).
- Règle de gestion : Entrée ne valide une compréhension que si elle répond à la saisie courante ; sinon texte libre.
- Règle de gestion : les recherches récentes ne quittent pas l'appareil ; la barre n'envoie rien au journal.
