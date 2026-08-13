# ADR-0012 — L'index du backlog est généré, jamais maintenu à la main

- **Statut** : Accepté
- **Date** : 2026-08-12

## Contexte

`docs/backlog/INDEX.md` était une vue kanban maintenue à la main. Mesuré le 2026-08-12 :

- **213 de ses 266 entrées (80,1 %)** rangeaient un ticket dans une section que son frontmatter
  contredit ;
- il affichait **40 tickets à faire et 177 en review** là où les frontmatters en comptaient **3 et 2** ;
- sa colonne « Review » (177 entrées) ne correspondait à **aucune pull request ouverte** —
  `gh pr list --state open` rend `[]`, et les 39 numéros de PR qu'elle citait sont **tous mergés** ;
- le premier ticket de sa colonne « Todo » — la convention documentée pour *« implémente la tâche
  suivante »* — était `done` depuis trois mois.

**Trois encodages de statut se contredisaient dans le même document** : la section, un marqueur
inline `**[review]**`, et le frontmatter du ticket.

Le document se condamnait lui-même. Il déclarait en tête *« Vue kanban projetée depuis les
frontmatters des `tickets/*.md` »* puis, deux lignes plus bas, *« le maintenir à la main quand un
ticket change de `status` »*. L'écart n'était donc pas une convention divergente qu'on pourrait
défendre — c'était une projection annoncée, et cassée.

## Décision

**`INDEX.md` est généré par `node docs/backlog/gen-index.mjs` depuis les frontmatters et
`waves.json`. Il ne s'édite jamais à la main.**

La **vague** de livraison descend dans le frontmatter du ticket (champ `wave`) : le rattachement
appartient au ticket, le catalogue des titres à `waves.json`.

**Deux gardes distinctes**, et aucune ne peut voir ce que voit l'autre :

- `gen-index.mjs --check` — la **sortie** suit-elle la **source** ? Il compare deux fichiers ; il ne
  regarde jamais le dépôt.
- `check-backlog.mjs` — la **source** suit-elle la **réalité** ? Pointeur `spec_refs` disparu,
  dépendance incohérente, date impossible, et surtout : **un ticket `review`/`doing` dont un commit
  de `dev` cite l'id en touchant du code applicatif**.

Les deux tournent dans `repo-ci.yml`.

## Conséquences

**Le placement en colonne redevient de l'information.** 6 tickets ouverts, 258 livrés — mesuré, pas
déclaré.

**Un ticket partiellement livré doit ÉCRIRE ce qui reste.** La garde n'exige pas un statut, elle
exige une phrase : un ticket ouvert dont le code est sur `dev` doit porter une section
`## Reste sur dev`. « Partiellement implémenté » sans dire ce qui manque ne vaut pas mieux que
`todo` — c'est précisément ce qui a rempli la colonne Review pendant trois mois. TCK-278 est le
premier à l'utiliser, et son reste-à-faire est mesuré, pas supposé.

**Ce que les gardes ne peuvent pas faire.** Elles ne devinent pas qu'un ticket a été implémenté.
Elles attrapent le pointeur pourri, la dépendance incohérente et le statut que git contredit —
**jamais un ticket qu'on a codé sans le dire**. 25 tickets `done` n'ont aucun commit de `dev` citant
leur identifiant : le code existe, la traçabilité est perdue, et elle ne se rattrape pas après coup.

**Ce que la génération a coûté.** Les sections rédigées à la main — « Historique » (24 entrées, très
détaillées) et « Graphe de dépendances » (213 lignes) — ne sont pas reproductibles depuis des
frontmatters. Elles sont **archivées verbatim** dans
`_archive/INDEX-manuel-2026-08-12.md`, avec leurs défauts écrits en tête : l'historique s'arrête au
2026-04-25 (65 % du backlog absent) et le graphe ne couvre que 158 des 265 tickets.

Une tentative de récupérer automatiquement les notes narratives par vague a été **abandonnée** :
elle attribuait à la vague 11 un texte qui appartenait à une autre section. *Une note mal attribuée
est pire qu'une note absente.*

## Application

- `docs/backlog/gen-index.mjs` — casse sur une source incohérente plutôt que de générer un index faux.
- `docs/backlog/check-backlog.mjs` — garde de fraîcheur, **prouvée par mutation** (retrait de la
  section « Reste sur dev » → rouge ; pointeur `spec_refs` cassé → rouge ; restauration → vert).
- `docs/backlog/waves.json` — 30 vagues.
- `.github/workflows/repo-ci.yml` — `fetch-depth: 0`, sans quoi la confrontation à git ne peut pas
  avoir lieu (et la garde le dit en rouge plutôt qu'en silence).
