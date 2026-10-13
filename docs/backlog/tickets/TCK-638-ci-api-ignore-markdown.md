---
id: TCK-638
title: "CI — une PR qui ne touche que de la documentation sous `takussan-api/` ne rejoue plus la suite backend"
status: review
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-13
updated: 2026-10-13
depends_on: [TCK-636]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, github, ci, adr-0063]
---

## Objectif utilisateur

- **Le porteur, qui livre** : retoucher `takussan-api/CLAUDE.md` ou un README de l'API ne coûte plus
  un passage complet de la suite backend (470 à 610 s au repos, davantage en CI) pour un arbre dont
  aucun fichier lu par les tests n'a changé.

## Contrat de données

Aucune donnée applicative. Le mécanisme amendé est celui d'[ADR-0063](../../adr/0063-attestation-de-ci-par-arbre.md)
§1 (périmètre de la clé) et le déclencheur d'`api-ci.yml`.

Relevé du 2026-10-13, sur la PR #372 (qui ne touche que trois `.md`, dont `takussan-api/CLAUDE.md`) :
`lint-and-test` a rejoué la suite entière. **Deux causes, qui se cumulent :**

1. `.github/workflows/api-ci.yml` se déclenche sur `paths: takussan-api/**` (PR et push) — un `.md`
   suffit.
2. `scripts/ci-attestation.mjs` calcule la clé sur **tout** `takussan-api` (`PERIMETRES.api`, et
   `PERIMETRES.web` de même) : le `.md` change la clé, aucun artefact `ci-vert-api-<clé>` ne
   correspond, l'attestation ne saute rien.

Le dépôt a déjà tranché qu'un `.md` n'impacte aucun test : `takussan-api/tests/Support/ImpactSelector.php:238`
les écarte de la sélection locale. Relevé le même jour : les seules mentions de `CLAUDE.md` /
`README.md` dans `takussan-api/app` et `takussan-api/tests` sont des commentaires — à l'exception
de `ImpactSelectorTest`, qui les passe en **données** (chaînes), pas en lecture de fichier.

## Contraintes strictes (métier)

- **Toute incertitude rejoue** (ADR-0063) : l'exclusion ne vaut que pour un fichier dont on a
  **mesuré** qu'aucune suite ne le lit. Un `.md` lu par un test reste dans la clé.
- ⚠ **`takussan-api/tests/fixtures/` est suspect par construction.** `tests/fixtures/ProseLitterale/README.md`
  vit dans un dossier qu'un scanner de test (`Tests\Support\ProseLitteraleScanner`) parcourt. Mesurer
  s'il énumère le dossier sans filtrer l'extension ; dans le doute, **ne pas exclure** les `.md` de
  `tests/fixtures/`.
- ⚠ **`git ls-tree` refuse la magie d'exclusion** — mesuré : `git ls-tree -r HEAD -- takussan-api
  ':(exclude)takussan-api/**/*.md'` → `fatal: … pathspec magic not supported by this command:
  'exclude'`. Le filtre se fait donc **en JS**, sur la sortie de `ls-tree`, dans `cleDe()`.
- **Le déclencheur et la clé doivent exclure exactement la même chose.** Un fichier exclu du
  déclencheur mais présent dans la clé rejoue quand même au push suivant ; l'inverse fait sauter
  le workflow sur un fichier que la clé jugerait pertinent.
- La clé `web` contient tout `takussan-api` parce que les tests du front y lisent des sources : la
  même mesure (« aucun test vitest ne lit un `.md` de l'API ») est exigée avant d'y appliquer
  l'exclusion.
- `scripts/check-ci-attestation.mjs` tient la forme des workflows et le périmètre de l'API : il doit
  continuer de rougir sur ses ablations actuelles, et il ne doit pas accepter qu'un dossier de code
  (`app`, `bin`, `config`, `database`, `routes`, `tests`) sorte de la clé.

## Delta à produire

- [x] `.github/workflows/api-ci.yml` : exclure les `.md` retenus des `paths` de `pull_request` **et**
      de `push` (motif de négation `'!…'` après `'takussan-api/**'`).
- [x] `scripts/ci-attestation.mjs` : une liste d'exclusions par suite (exportée, comme `PERIMETRES`),
      appliquée aux lignes de `ls-tree` dans `cleDe()` — clés `api` et `web`.
- [x] `scripts/check-ci-attestation.mjs` : garde que les exclusions du workflow et du script
      coïncident, et qu'aucune n'avale un fichier de code.
- [x] ADR-0063 §1 : une ligne au tableau du périmètre — ce qui en sort, et la mesure qui l'autorise.
- [x] Ligne correspondante dans le commentaire d'en-tête d'`api-ci.yml` si la règle y est décrite.

## Critères d'acceptation

- [x] AC1 — Une PR vers `dev` qui ne modifie que `takussan-api/CLAUDE.md` ne déclenche **pas**
      API CI (aucun run `api-ci.yml` pour son SHA). Prouvé par une PR réelle, numéro cité.
- [x] AC2 — Une PR qui modifie un `.php` de `takussan-api/app` déclenche toujours API CI et
      `lint-and-test` joue la suite (pas d'attestation trouvée). Prouvé par une PR réelle.
- [x] AC3 — `node scripts/ci-attestation.mjs api --cle` rend **la même clé** avant et après une
      modification de `takussan-api/CLAUDE.md`, et une clé **différente** après modification d'un
      fichier de `takussan-api/tests/`. Idem pour `web`.
- [x] AC4 — Si un `.md` de `tests/fixtures/` est lu par un test, il reste dans la clé : AC3 rejoué sur
      `tests/fixtures/ProseLitterale/README.md` rend une clé **différente** — ou la mesure qui prouve
      qu'aucun test ne le lit est citée dans les notes.
- [x] AC5 — `check-ci-attestation.mjs` rougit par ablation : (a) exclusion ajoutée au workflow sans
      le script, (b) exclusion qui couvrirait `takussan-api/app/**`. Les deux rouges cités.

## Hors périmètre

- Les autres extensions non lues (images de doc, `.txt`) : seulement les `.md`, mesurés.
- Le déclencheur de `web-ci.yml` : il ne liste que des fichiers de l'API précis, aucun `.md`.
- `repo-ci.yml` : les gardes documentaires **doivent** continuer de tourner sur ces fichiers.
- `promotion-ci.yml` : il appelle les workflows sans filtre de chemins, la clé suffit à le faire sauter.

## Reste sur dev

Le code est sur `dev` depuis la PR #372 (2026-10-13), et les cinq AC sont prouvés (#373, #374). Il ne
reste **aucun code** : le ticket attend seulement que TCK-636, dont il dépend, passe `done` — la
règle n°2 interdit qu'un ticket soit `done` avant ses dépendances. Il passe `done` dans le même
mouvement que TCK-636.

## Notes d'implémentation

- **Le périmètre exclu est plus étroit que « les `.md` de l'API », et c'est la mesure qui l'a
  imposé** : `HORS_CLE` = `takussan-api/*.md` (racine : `CLAUDE.md`, `README.md`) et
  `takussan-api/docs/**`. `CourtierAbsentTest::filesUnder()` lit **tous** les fichiers d'`app/`,
  `config/`, `routes/`, `database/factories/` et `database/seeders/`, sans filtre d'extension : un
  `.md` posé là est lu (il y en a zéro aujourd'hui). Les autres itérateurs récursifs relevés
  (`ProseLitteraleScanner`, `CapabilityStringLiteralsTest`, `TranslationUsage`,
  `NoLegacyUserTypeTest`, `LangGroupParityTest`) filtrent sur `.php`. Aucun test vitest ne lit
  `takussan-api/*.md` ni `takussan-api/docs/`.
- **Dépendance** : TCK-636 est encore `doing` (AC4-AC6, des preuves) ; son code — que ce ticket
  amende — est sur `dev`. Implémenté sur demande explicite du porteur, le 2026-10-13.
- **AC3 et AC4** — clés calculées sur des arbres construits par un index temporaire
  (`GIT_INDEX_FILE`, `write-tree`), sans commit : `CLAUDE.md` et `docs/infra/watermark.md`
  modifiés → **même clé** `api` et `web` ; `tests/fixtures/ProseLitterale/README.md`,
  `app/Nouveau.md` et `tests/TestCase.php` → **clé différente**, pour les deux suites.
- **AC5** — trois ablations, trois rouges de `check-ci-attestation.mjs` : négation retirée du seul
  `push` (« le déclencheur exclut [takussan-api/*.md], la clé exclut [… , takussan-api/docs/**] ») ;
  `takussan-api/app/**` ajouté à `HORS_CLE` (« retire takussan-api/app/a/b.php ») ;
  `takussan-api/**/*.md` (« retire takussan-api/routes/a.md », `tests/`, `lang/`…).
- **AC1 et AC2 ne se prouvent qu'APRÈS fusion** : un `pull_request` lit les `paths` de l'arbre
  fusionné, et toute PR ouverte avant la fusion porte la modification d'`api-ci.yml`, qui déclenche.
  Prises après la fusion de #372 :
  - **AC1** — PR #373, qui ne modifie que `takussan-api/CLAUDE.md` (puis ce ticket) : **seul
    Repo CI** s'est déclenché pour son SHA, aucun run d'API CI.
  - **AC2** — PR jetable #374, un commentaire ajouté à `app/Support/CaseInsensitive.php` : API CI
    déclenché (run 38431140474), `attestation` sans artefact, `lint-and-test` lancé. Run annulé,
    PR fermée sans fusion.
  - En prime, ADR-0063 vérifié sur la fusion de #372 : le push sur `dev` (run 38431019023) a
    **sauté** `lint-and-test` — l'arbre avait été attesté vert sur la PR.
- Toutes les clés existantes changent au premier passage (le contenu hashé change) : le premier
  run de chaque suite après fusion rejoue, une fois.
- PR #372 (implémentation), #373 (preuve AC1). **Les cinq AC sont prouvés** ; le ticket reste en
  `review` parce que TCK-636, dont il dépend, est encore `doing` (règle n°2, `check-backlog.mjs`).
  Il passe `done` en même temps que TCK-636.
