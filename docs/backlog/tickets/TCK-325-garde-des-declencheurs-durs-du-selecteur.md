---
id: TCK-325
title: "Garder la liste des déclencheurs durs du sélecteur d'impact — elle est recopiée à la main et avait dérivé le jour de son écriture"
status: done
phase: P2
family: technique
estimate: S
wave: 41
created: 2026-08-17
updated: 2026-08-17
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, outillage, ci, dette]
---

## Objectif utilisateur

Qu'un agent qui lit `takussan-api/CLAUDE.md` pour savoir quels fichiers imposent la suite entière
lise la vérité — et non une liste qui a cessé de suivre le code sans que rien ne le signale.

## Contrat de données

Aucune donnée applicative. Deux sources qui doivent s'accorder :

| Source de vérité | Copie |
|---|---|
| `takussan-api/tests/Support/ImpactSelector.php` — `HARD_PREFIXES`, `HARD_FILES`, `INERT_PREFIXES` | l'énumération en prose de `takussan-api/CLAUDE.md`, § *« Ne lancer que les tests que le diff touche »* |

## Contexte

[TCK-320](TCK-320-selection-des-tests-par-impact.md) a livré `bin/impacted-tests.php` : le sélecteur
répond soit une liste de classes, soit `SUITE ENTIÈRE` quand le fichier touché sort de la portée de
la carte. La liste des chemins qui imposent ce repli est **définie en code** et **recopiée à la main**
dans `takussan-api/CLAUDE.md`.

**Elle avait déjà dérivé le jour où elle a été écrite** — `composer.json` manquait à la copie — et
c'est une **revue de code** qui l'a vu, pas une garde. Le fichier porte aujourd'hui l'avertissement
« cette liste est recopiée à la main et rien ne la garde », ce qui est honnête mais ne répare rien :
le prochain déclencheur ajouté au code ne se propagera pas davantage.

C'est mot pour mot la famille de défaut que les treize `scripts/check-*.mjs` de ce dépôt existent pour
attraper — *un document dérivé qui cesse de suivre sa source* — et elle vit dans le document qui
explique comment lancer les tests. Le coût n'est pas théorique : un agent qui croit qu'un fichier est
inerte alors que le code escalade perd du temps ; l'inverse — croire qu'un fichier escalade alors
qu'il est inerte — produit **un vert qui ne prouve rien**, la panne exacte que TCK-320 existe pour
rendre impossible.

Ce ticket vivait jusqu'ici **uniquement dans la section « Suites » de TCK-320**. Le solder sans
déposer celui-ci aurait effacé la suite avec le ticket.

## Contraintes strictes (métier)

- **La source de vérité est le code**, jamais la prose. La garde échoue quand ils divergent ; elle ne
  réécrit pas la documentation.
- Elle lit les constantes **sans exécuter PHP** — Repo CI ne monte pas de PHP (job Node seul). Un
  parseur de `const X = [...]` par expression régulière suffit, à condition d'**échouer bruyamment**
  s'il ne trouve pas la constante au lieu de rendre un tableau vide qui s'accorderait avec tout.
- Elle couvre les **trois** constantes, pas seulement les deux nommées dans TCK-320 :
  `INERT_PREFIXES` est celle dont l'oubli fabrique le faux vert.
- Vérifiée **par ablation dans les deux sens** : retirer une entrée du code doit rougir, en ajouter
  une non documentée doit rougir.

## Delta à produire

- [x] `scripts/check-impact-triggers.mjs` — compare les trois constantes d'`ImpactSelector` à ce que
      `takussan-api/CLAUDE.md` énumère, dans les deux sens.
- [x] Échec explicite si une constante est introuvable dans le source (le cas « la garde ne garde
      plus rien » doit être rouge, pas vert).
- [x] Step dans `.github/workflows/repo-ci.yml`, avec le motif en commentaire comme ses voisines.
- [x] Retirer de `takussan-api/CLAUDE.md` l'avertissement « rien ne la garde » — devenu faux.

## Critères d'acceptation

- [x] AC1 — La garde passe sur l'état courant du dépôt.
- [x] AC2 — Ablation : ajouter une entrée à `HARD_FILES` sans toucher la doc → rouge, avec le nom de
      l'entrée manquante.
- [x] AC3 — Ablation inverse : citer dans la doc un chemin absent du code → rouge.
- [x] AC4 — Ablation de la garde elle-même : renommer `HARD_PREFIXES` dans le source → rouge
      (« constante introuvable »), et non vert par tableau vide.
- [x] AC5 — `INERT_PREFIXES` est couverte au même titre que les deux autres.
- [x] AC6 — Repo CI rejoue la garde, et l'énumération des déclencheurs de son bloc `paths` couvre
      **les deux** fichiers comparés.

## Hors périmètre

- Toute modification du sélecteur lui-même ou de la carte d'impact.
- Générer la section de `CLAUDE.md` depuis le code : la garde compare, elle ne rédige pas. Une prose
  engendrée perdrait le raisonnement qui fait la valeur de ce fichier.

## Notes d'implémentation

**Les zones comparées sont DÉLIMITÉES dans la doc par des marqueurs HTML**
(`<!-- garde:déclencheurs-durs -->`, `<!-- garde:chemins-inertes -->`), et ce n'est pas un détail de
mise en œuvre : sans eux, le sens « doc → code » n'était pas implémentable sans heuristique. La
section cite des dizaines d'autres empans de code — `app/`, `tests/BaseTestCase.php`,
`.env.example`, `git diff --name-only` — dont aucun n'est un déclencheur. Une garde qui les aurait
pris pour tels aurait rougi sur du texte juste, et on l'aurait désarmée au troisième faux positif.
Les marqueurs sont **inline**, pas sur leur propre ligne : une ligne qui commence par `<!--`
interrompt le paragraphe en CommonMark, et la prose se serait affichée en trois blocs dont un
commençant par « : une migration change le schéma ».

**`*.md` a été SORTI de la liste inerte en prose.** Le code ne le porte pas dans `INERT_PREFIXES` —
il l'exclut séparément par `str_ends_with($relative, '.md')`, ce que le docblock de la classe disait
déjà. La doc l'énumérait avec les cinq préfixes ; le garder dans la zone aurait exigé une exception
codée en dur dans la garde, c'est-à-dire une seconde liste à la main pour garder la première. La
prose dit désormais ce que le code fait.

**Cinq ablations, toutes rouges, source et doc restaurées après chacune** : entrée ajoutée à
`HARD_FILES` seule (AC2), chemin ajouté à la doc seule (AC3), `HARD_PREFIXES` renommée dans le
source → « constante INTROUVABLE » et non un vert par tableau vide (AC4), entrée retirée
d'`INERT_PREFIXES` (AC5), marqueurs de zone effacés de la doc → « zone INTROUVABLE ».
