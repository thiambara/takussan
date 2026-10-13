---
id: TCK-636
title: "CI — un arbre déjà éprouvé vert ne rejoue pas sa suite (PR → dev, push sur dev, promotion), et la carte d'impact se régénère la nuit"
status: doing
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-13
updated: 2026-10-13
depends_on: []
blocks: [TCK-637]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, github, ci, adr-0063]
---

## Objectif utilisateur

- **Le porteur, qui livre** : une fonctionnalité fusionnée sur `dev` arrive sur `preview` sans
  rejouer trois fois la même suite sur le même arbre — de « jusqu'à des heures » à la durée d'une
  seule suite, plus les images.

## Contrat de données

Aucune donnée applicative. Décision : [ADR-0063](../../adr/0063-attestation-de-ci-par-arbre.md).

Relevé du 2026-10-13 : PR → `dev` 17-23 min, push sur `dev` 19-24 min, promotion 28-42 min,
`images.yml` 4-5 min. La promotion rejoue les trois CI sans filtre (`promotion-ci.yml`, TCK-524) ;
le push sur `dev` rejoue l'arbre que la PR vient d'éprouver, puis pousse un commit de carte
d'impact qui change l'arbre de la promotion.

## Contraintes strictes (métier)

- **Ne jamais sauter une suite qu'aucun run n'a vue verte sur cet arbre.** Toute erreur de la
  recherche d'attestation rejoue la suite.
- La clé couvre ce que la suite **lit**, pas ses `paths:` — mesuré : deux tests du front lisent des
  fichiers de l'API hors des `paths` de web-ci, un test de l'API lit `takussan-web/src/messages/`.
- Les six checks requis de `preview` et `master` restent les mêmes noms ; aucun ne disparaît.
- `dev` reste non protégée ; l'anti-boucle `[carte-impact]` reste lue aux deux endroits
  (`scripts/check-skip-ci-marker.mjs`).

## Delta à produire

- [x] ADR-0063, indexé dans `docs/adr/README.md`.
- [x] `scripts/ci-attestation.mjs` : clé par suite (`api`, `web`), recherche de l'artefact
      `ci-vert-<suite>-<clé>` (non expiré, run de ce dépôt, workflow attestant), sorties `cle`,
      `deja-vert`, `carte-courante` ; résumé du run ; toute erreur → `deja-vert=false`.
- [x] api-ci : job `attestation` ; `lint-and-test` en `needs` avec `!cancelled()` et
      `deja-vert != 'true'` ; dépôt de l'attestation à la fin ; `schedule` + `workflow_dispatch` ;
      `cov.php` et la carte passent du push sur `dev` à la nuit.
- [x] web-ci : job `attestation` ; `quality` en `needs`, même condition ; dépôt à la fin.
- [x] promotion-ci : `actions: read` à l'appel de l'API (sans lui, la recherche rend 403 et tout
      rejoue).
- [x] `scripts/check-ci-attestation.mjs` (forme des deux workflows, périmètre de l'API), branché
      dans repo-ci ; ablations.
- [x] TCK-637 créé en `todo`.

## Critères d'acceptation

- [x] AC1 — Sur la PR de ce ticket vers `dev`, les deux jobs lourds **tournent** (aucune
      attestation n'existe pour cet arbre, les fichiers de clé changent) et déposent chacun leur
      artefact.
- [x] AC2 — Au push sur `dev` qui suit la fusion, sans autre fusion entre-temps : `lint-and-test`
      et `quality` sont **sautés**, et le résumé du job `attestation` nomme le run de la PR.
- [x] AC3 — Sur la promotion `dev` → `preview` qui suit : mêmes sauts, et la PR est
      `MERGEABLE CLEAN` avec les six checks requis — **mesuré**, la documentation de GitHub sur les
      jobs sautés n'étant pas une mesure. Durée de la promotion relevée dans ce ticket.
- [ ] AC4 — La recherche en échec rejoue : prouvé par une exécution où la recherche ne peut pas
      répondre (permission retirée ou jeton absent, sur une branche d'essai) → le job lourd tourne.
- [ ] AC5 — Une exécution `workflow_dispatch` sur `dev` régénère la carte et pousse un commit
      `[carte-impact]` ; le push qui en résulte ne relance ni `lint-and-test` ni
      `migrations-pgsql`.
- [ ] AC6 — `check-ci-attestation.mjs` rougit par ablation sur : `!cancelled()` retiré, `needs`
      retiré, dépôt de l'artefact retiré, `actions: read` retiré de promotion-ci, une référence
      `takussan-web/` hors périmètre ajoutée à un test de l'API.

### Mesures du 2026-10-13

| Étape | Avant (TCK-633, TCK-635) | Avec l'attestation | Ce qui a tourné |
|---|---|---|---|
| PR #368 → `dev` | 17-23 min | `lint-and-test` 31 min 14 s, Web 14 min 57 s | tout — arbre neuf ; deux artefacts `ci-vert-*` déposés (AC1) |
| push du merge sur `dev` (`68d16cbc`) | 19-24 min | **52 s** au total | attestations, rollback, gardes ; `lint-and-test` et `quality` sautés (AC2) |
| promotion #369 (run `38330342739`) | 28-42 min | **2 min 31 s** | attestations, images, rollback, gardes ; les deux suites sautées, PR `MERGEABLE CLEAN` (AC3) |
| `images.yml` sur `preview` | 4-5 min | 4 min 36 s | inchangé ; `X-Build-Sha: ed6f0dd8` sur `preview.api.takussan.com/up` |

La promotion a d'abord échoué au démarrage (`startup_failure`, run `38329772517`) : voir les notes
d'implémentation, et la PR #370 qui l'a corrigée. AC4 et AC5 restent à éprouver en CI : le repli
« recherche en échec → la suite tourne » n'est prouvé qu'en local (jeton absent → `deja-vert=false`),
et aucune régénération nocturne n'a encore tourné.

## Hors périmètre

- `--parallel` en CI et le découplage de la couverture : TCK-637.
- Les `paths:` incomplets de web-ci : la clé du front couvre tout `takussan-api/`, la promotion
  les rattrape donc encore. Les compléter n'économiserait du temps que sur une PR vers `dev`.

## Notes d'implémentation

- Un job sauté par `if:` compte comme réussi pour un check requis ; un job sauté parce qu'une
  dépendance a échoué, aussi — d'où `!cancelled()` : sans lui, un job `attestation` rouge ferait
  sauter la suite **et** passer le check.
- Le `GITHUB_TOKEN` d'un workflow appelé ne peut pas dépasser les permissions de l'appelant :
  `promotion-ci` donne `contents: write` seul à l'API, ce qui retire `actions: read`.
- ⚠ **Payé sur la première promotion (#369, 2026-10-13) : `startup_failure`.** L'appel du front ne
  déclarait aucune permission, et j'en avais déduit « tout en lecture ». Faux : le réglage du dépôt
  (`default_workflow_permissions: read`) borne le jeton à `contents` et `packages`, et le job
  `attestation` qui demande `actions: read` fait refuser le run entier au démarrage — sans un job,
  sans un journal, la PR seulement `BLOCKED`. Corrigé : `actions: read` dans un bloc `permissions`
  sur chaque appel, et la garde l'exige désormais même quand l'appel n'en déclare aucun.
