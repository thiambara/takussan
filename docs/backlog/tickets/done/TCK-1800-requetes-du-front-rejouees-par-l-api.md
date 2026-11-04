---
id: TCK-1800
title: "Les requêtes de lecture du front, dérivées de `src/lib/queries` et rejouées par l'API : aucune ne rend 400"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-150--sort-filter-et-include-du-front-face-aux-listes-blanches-de-lapi"
tags: [api, web, queries, query-builder, contrat, garde, pistes]
---

## Contexte

Réf : **P150.04** du fichier de pistes.

Décision du porteur : « validé — porteur (2026-10-22) : un fichier dérivé, généré depuis les hooks
de `src/lib/queries` et versionné, avec un mode `--check`, que rejoue un test Feature de l'API
(aucune requête ne rend 400) »

Le critère accordé est V6 (mécanisme neuf qui relie les deux applications). Quatre écarts entre
les paramètres écrits par le front et les listes blanches de l'API (P150.01 à P150.03, P118.01)
ont vécu de 15 jours à deux mois sans qu'aucun test ne rougisse.

## Hypothèses (mode sans humain)

- **Lieu du fichier** : `takussan-api/tests/fixtures/requetes-du-front.json`. Dans l'API, une PR qui
  le change déclenche API CI, qui le rejoue ; `web-ci` lit déjà tout `takussan-api/` dans sa clé
  d'attestation. Précédent : `cout-d-entree.json`, lu par les deux suites.
- **Aucun chemin fermé** : le `--check` est le test vitest lui-même, que `web-ci` joue avec la suite
  du front ; le test Feature est joué par `api-ci`. Ni `.github/`, ni `package.json` ne changent.
- **Dérivé, et tenu** : la chaîne de requête est captée (`fetch` simulé), jamais recopiée ; la liste
  des appels et leurs arguments (le tri d'une colonne, par exemple) est tenue dans le test.
- **Acteurs** : l'administrateur d'une agence pour `/api/*`, un super-admin pour `/api/admin/*`
  (relais `/api/super-admin/*`). Les relais qui renomment le chemin (`/api/admin-users` →
  `/api/users`) sont traduits par une table de deux lignes.
- **Couverture de départ** : treize requêtes de liste, sans identifiant dans le chemin, dont celles
  des trois défauts de l'angle. Le reste des lectures de `src/lib/queries` est écrit ci-dessous.

## Delta à produire

- [x] `takussan-web/src/lib/queries/__tests__/requetes-du-front.tck-1800.test.tsx` : capte l'URL de
  chaque invocation, la traduit en `{chemin, parametres}` côté API, et compare au fichier versionné
  (l'écrit sous `ECRIRE_REQUETES_DU_FRONT=1`).
- [x] `takussan-web/scripts/gen-requetes-du-front.mjs [--check]` : lance ce test, en écriture ou non.
- [x] `takussan-api/tests/fixtures/requetes-du-front.json` : généré.
- [x] `takussan-api/tests/Feature/Contrat/RequetesDuFrontTest.php` : rejoue chaque requête par son
  acteur, refuse le 400 (message : l'URL et le corps), puis exige 200.

## Critères d'acceptation

- [x] AC1 — Les treize requêtes du fichier rendent 200 sur l'arbre courant.
- [x] AC2 — `sort=last_login_at` retiré de `User::$requestSortable` → la requête de la colonne
  « Dernière connexion » rougit en 400, et elle seule.
- [x] AC3 — Un hook dont le `sort` change sans régénération → la suite du front rougit, diff du
  fichier à l'appui.

## Reste à faire

Étendre `INVOCATIONS` aux autres lectures de `src/lib/queries` : celles dont le chemin porte un
identifiant (une fiche, `/api/agencies/{id}/…`), qui demandent une donnée créée par le test API, et
les listes non encore citées (visites, versements, journal, propriétaires, file de modération…).

## Hors périmètre

- Un ADR pour ce mécanisme : `docs/adr/` est fermé à l'implémenteur.
- Les paramètres que l'API **ignore** sans erreur (angle 186).

## Notes d'implémentation

- Ablation API : `last_login_at` retiré de `User::$requestSortable` → 1 rouge sur 14 (« → 400 :
  http.bad_request » sur `sort=-last_login_at`), remis → 14 verts.
- Ablation front : `useLeases` trié par `-start_date` sans régénérer → `--check` rouge, diff du
  `sort` à l'appui ; remis → vert.
- Le fichier dit ses paramètres en objet : un paramètre répété dans une URL fait échouer la capture
  plutôt que de perdre une valeur.
