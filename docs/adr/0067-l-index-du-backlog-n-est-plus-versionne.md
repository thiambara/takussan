# ADR-0067 — L'index du backlog n'est plus versionné ; le fusionneur essaie chaque fusion avant de la faire

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Tickets** : aucun (outillage du porteur)
- **Amende** : [ADR-0012](0012-index-du-backlog-genere.md) (l'index reste généré, il n'est plus
  commité ; `gen-index.mjs --check` ne compare plus, il valide la source) et
  [ADR-0066](0066-trois-agents-sur-les-pistes-d-amelioration.md) § 4 (la fusion dans `pre-dev`)

## Contexte

Relevé le 2026-10-16 à 09 h 15, une demi-journée après qu'ADR-0066 a laissé l'implémenteur tenir
jusqu'à `PR_MAX_IMPLEMENTEUR` PR ouvertes (10 dans `config.env`) :

- **Les quatre PR ouvertes de l'implémenteur (#469, #470, #472, #474) étaient en conflit, et le seul
  fichier en conflit était `docs/backlog/INDEX.md`.** Chaque ticket ajoute une ligne voisine de
  celle des autres et change les compteurs d'en-tête : deux PR ouvertes ensemble ne peuvent pas
  fusionner proprement toutes les deux. Le fichier de pistes, touché par les mêmes PR, fusionnait.
- **`pre-dev` elle-même était rouge** (`gen-index.mjs --check` : « INDEX.md est périmé »). Le
  fusionneur avait fusionné #473 puis #467, chacune verte sur sa propre base. La fusion textuelle
  d'`INDEX.md` passait **sans conflit** et laissait un index faux. Aucune vérification ne tournait
  entre deux fusions.
- Toute PR partant de `pre-dev` héritait du rouge : #464 (explorateur), qui n'y pouvait rien depuis
  son périmètre, et la synchronisation #471.

`reconcilier_index` (ADR-0066 § 4) réglait le conflit, mais seulement pendant un passage de
l'implémenteur, une PR à la fois, et ne voyait pas le cas « fusion propre, index faux ».

## Décision

**1. `docs/backlog/INDEX.md` n'est plus versionné.** Il est dans `.gitignore`, et
`node docs/backlog/gen-index.mjs` l'écrit à la demande. ADR-0012 tient toujours sur le fond : l'index
est dérivé des frontmatters et ne s'édite jamais à la main. Une vue dérivée n'a simplement rien à
faire dans git — sa fraîcheur y est une dette, et sa présence une source de conflits.

- `gen-index.mjs --check` ne compare plus rien : il **valide la source** (id dupliqué, statut,
  phase, famille ou vague inconnus) et n'écrit rien. La CI le garde sous ce sens.
- `check-doc-links.mjs` connaît les fichiers générés (`GENERES`) : les citer revient à citer leur
  générateur, pas un fichier mort.
- La liste des tickets ouverts se prend par `node docs/backlog/check-backlog.mjs --report`, ou par
  l'index généré en local.

**2. Le fusionneur essaie chaque fusion avant de la faire** (`essai_de_fusion`, dans
`scripts/agents/pistes.sh`). Avant tout `gh pr merge` vers `pre-dev` — le fusionneur, un passage
qui fusionne sa propre PR, la synchronisation `dev → pre-dev` — la PR est fusionnée avec la base
**courante** dans un arbre à part, et les gardes du dépôt (`scripts/check-*.mjs`,
`gen-index --check`, `check-backlog`) tournent sur le résultat.

- Vert : la fusion a lieu.
- Rouge : elle n'a pas lieu, le refus est journalisé (`refuse` dans `journal.tsv`) et le rapport est
  écrit dans `sorties/essais/<n°>.txt`. Une PR d'agent est mise à jour avec la base
  (`gh pr update-branch`) : sa CI rejoue l'arbre fusionné, rougit, et l'agent la répare comme toute
  PR rouge. La PR de synchronisation, dont la tête est `dev`, n'est jamais mise à jour : le porteur
  tranche.
- Un refus ne se redit pas tant que ni la base ni la tête n'ont bougé.

**3. Transition.** Une PR ouverte avant que sa base ait retiré l'index entre en conflit
« modifié / supprimé » sur `INDEX.md` : `reconcilier_index` la règle en le retirant à son tour.

## Conséquences

**Le conflit disparaît, il n'est pas mieux géré.** Dix PR ouvertes ensemble ne se gênent plus sur
l'index, et aucune n'a à rejouer sa CI parce qu'une autre a été fusionnée avant elle.

**Ce qu'on perd : l'index lisible sur GitHub.** Il faut le générer pour le lire. Le ticket, lui,
reste lisible partout, et c'est lui la source.

**Ce que l'essai attrape, et ce qu'il n'attrape pas.** Il attrape ce que les gardes documentaires
voient sur un arbre fusionné : deux tickets au même numéro, un fichier de pistes que deux PR rendent
incohérent, un lien que l'une casse et que l'autre cite. Il ne joue **aucune suite de tests** : deux
correctifs de code verts chacun et rouges ensemble passent l'essai, et c'est la CI du push sur
`pre-dev` qui les montre. Le faire aurait remis les CI en série — exactement ce qu'ADR-0066 venait
de lever.

**Coût** : un essai prend une quinzaine de secondes (les gardes, sans dépendance), sans modèle.

## Application

- `.gitignore`, `docs/backlog/gen-index.mjs` (`--check`), `.github/workflows/repo-ci.yml`.
- `scripts/check-doc-links.mjs` (`GENERES`).
- `scripts/agents/pistes.sh` : `essai_de_fusion`, appelé par `fusionner`, `etat_des_pr` et
  `synchroniser_pre_dev` ; `avec_verrou_git` devient réentrant (`recuperer`, appelé sous le verrou,
  fusionne la synchronisation après un essai qui le reprend) ; `reconcilier_index` (transition).
- Instructions : `CLAUDE.md`, `.agent/skills/writing-specs`, `.agent/skills/implementing-specs`,
  `.agent/agents/pistes/implementeur.md`.
- Vérifié sur un dépôt jetable, en rejouant le cas réel (#467 sur `pre-dev` après #473 : refusée,
  mise à jour demandée, journalisée une seule fois), plus une PR saine (acceptée), deux tickets au
  même numéro (refusés), la synchronisation (jamais mise à jour) et l'essai sous le verrou git
  (pas d'attente sur lui-même).
