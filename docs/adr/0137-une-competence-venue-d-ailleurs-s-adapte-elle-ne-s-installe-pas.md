# ADR-0137 — Une compétence venue d'ailleurs s'adapte dans `.agent/skills/`, elle ne s'installe pas

- **Statut** : Accepté le 2026-11-26 (« je valide toutes tes recommandations » du porteur, après l'étude du
  pack `mattpocock/skills`)
- **Date** : 2026-11-26
- **Tickets** : TCK-3002
- **S'appuie sur** : [J-08](../journal-des-corrections.md#j-08) (le répertoire mort qui absorbe les corrections),
  `scripts/check-skills-dir.mjs` (TCK-303)

## Contexte

Le porteur a demandé s'il fallait adopter le pack [`mattpocock/skills`](https://github.com/mattpocock/skills)
(v1.3.2, MIT, 27 compétences). Relevé du 2026-11-26, d'après le dépôt lui-même et les essais publiés :

- **Le pack se pose de deux façons, et aucune ne convient telle quelle.**
  - Le **greffon** (`mattpocock-skills@claude-plugins-official`) livre les 27 compétences à tous les projets du
    poste. Il se met à jour seul, sur un épinglage que le dépôt ne voit pas.
  - L'**installateur** (`npx skills add`) copie des `SKILL.md` sans préfixe hors de `.agent/skills/`, ce que
    `check-skills-dir.mjs` refuse.
- **La moitié du pack contredit des règles payées.**
  - `implement` lance la suite entière en local, alors que les suites passent par la CI.
  - `implement-spec` ouvre un worktree par ticket, en parallélisme maximal. Il porte aussi le nom de notre
    `/implement-spec`.
  - `setup-matt-pocock-skills` écrit un `GLOSSARY.md` à la racine (« jamais à la racine »).
  - `domain-modeling` propose les ADR « avec parcimonie », alors qu'ici toute décision structurelle en exige un.
- **La moitié du pack fait doublon** avec superpowers (TDD, débogage) et avec nos propres compétences
  (`writing-specs`, `implementing-specs`, `syncing-specs`, le backlog `TCK`).
- **Ce qui manque ici, le pack l'a.**
  - **L'interrogatoire par vagues** (`grilling`) : des questions numérotées, chacune avec sa recommandation,
    posées en texte. C'est la forme de décision que le porteur demande déjà.
  - **Un glossaire du domaine** : le dépôt n'en avait aucun, pour un domaine parlé en français et codé en
    anglais. Exemples : « bailleur » s'écrit `OwnerProfile` et `landlord_id`, et `tenant` désigne le locataire,
    pas l'agence.
  - **La rétrospective** qui transforme une erreur en garde.
  - **Le relevé d'architecture** en lecture seule.
- **Le coût d'un pack suivi en amont est mesuré.**
  - Les noms changent (`to-prd` devenu `to-spec`, `CONTEXT.md` devenu `GLOSSARY.md`).
  - Une compétence qui en appelle une autre par référence se dégrade : 0 appel de `/tdd` sur 17 `/implement`
    ([issue #479](https://github.com/mattpocock/skills/issues/479)).
  - Le flux complet coûte 2,04 $ par fonctionnalité, contre 0,34 $ sans lui, pour le même 5/5 (aidive.dev,
    2026-10-17).

## Décision

**Une compétence écrite ailleurs entre dans ce dépôt par une copie adaptée sous `.agent/skills/`, relayée par
`.claude/commands/` puis `.agent/workflows/`. Aucun pack de compétences ne s'installe pour ce dépôt.**

1. **Quatre compétences sont adaptées de `mattpocock/skills`** (licence MIT, source citée en tête de chaque
   fichier) : `grilling`, `domain-modeling`, `retro` et `improve-codebase-architecture`.
   - Le vocabulaire de conception (`codebase-design`) et le guide d'écriture pour les agents
     (`writing-for-agents`) en deviennent des **références internes**, pas des compétences.
   - Les quatre commandes sont `/grill-me`, `/grill-with-docs`, `/retro` et `/improve-codebase-architecture`.
2. **L'adaptation est une réécriture, pas une traduction.** Chaque compétence parle les conventions du dépôt :
   - le format d'ADR de `docs/adr/README.md` et la règle « ADR avant l'implémentation » ;
   - le backlog `TCK` ;
   - les gardes `scripts/check-*.mjs` ;
   - la séparation règle (`CLAUDE.md`) et récit (`docs/journal-des-corrections.md`) ;
   - les suites passées par la CI.
3. **Le glossaire du domaine vit dans `docs/glossaire.md`, en français.** Chaque terme porte une ligne
   *À éviter*.
   - **Un écart délibéré au modèle d'origine :** un terme peut aussi porter une ligne *Dans le code*, qui nomme
     l'identifiant anglais.
   - Pourquoi : le modèle d'origine veut un glossaire sans détail d'implémentation. Mais ici, la dérive naît
     précisément au passage du français à l'anglais.
4. **On ne suit pas l'amont.** Une évolution du pack s'importe à la main, lue, quand une observation la
   justifie. Elle n'arrive jamais par une mise à jour automatique.
5. **Un critère pour reconnaître une décision structurelle.** `domain-modeling` reprend les trois critères
   d'origine : difficile à défaire, surprenante sans contexte, fruit d'un vrai arbitrage.
   - Ils servent à **reconnaître** une décision structurelle, jamais à se dispenser d'un ADR qu'elle exige.
   - Quand les trois tiennent, l'ADR s'écrit avant l'implémentation, comme le demande `CLAUDE.md`.

## Conséquences

**Ce que ça rend possible.** On garde les quatre idées utiles sans les deux coûts du pack : les compétences en
doublon et la dérive des mises à jour. Le glossaire existe enfin et a un mécanisme pour grandir :
`/grill-with-docs` l'écrit au moment où un terme se tranche.

**Ce que ça coûte.**
- Les corrections de l'amont n'arrivent plus seules : il faut aller les chercher.
- Les compétences adaptées ne se déclenchent pas d'elles-mêmes. D'abord, Claude Code ne découvre pas
  `.agent/skills/`. Ensuite, les quatre commandes portent `disable-model-invocation: true` : un modèle les voit
  sans pouvoir les invoquer. On les tape, comme `/write-spec`.
  - C'est voulu : superpowers impose déjà ses compétences à chaque tour, et une seconde couche déclenchée par
    le modèle se serait empilée sur la première.

**Ce que ça interdit.**
- `claude plugin install mattpocock-skills` et `npx skills add` pour ce dépôt.
- Un `GLOSSARY.md` à la racine.

## Application

- **Les compétences** : `.agent/skills/{grilling,domain-modeling,retro,improve-codebase-architecture}/`.
- **Les relais** : `.agent/workflows/{grill-me,grill-with-docs,retro,improve-codebase-architecture}.md` et
  `.claude/commands/` du même nom. Les commandes portent `disable-model-invocation: true`.
- **La CI** : `repo-ci.yml` se déclenche aussi sur `.claude/commands/**` et `.agent/workflows/**`, en
  `pull_request` comme en `push`. La garde lit ces deux étages, et un relais peut se casser sans toucher un seul
  `SKILL.md`.
- **Le glossaire** : `docs/glossaire.md`, désigné par le `CLAUDE.md` racine (§ Specs & backlog).
- **La garde** : `scripts/check-skills-dir.mjs`.
  - Elle refuse toute compétence sans préfixe hors de `.agent/skills/`.
  - Depuis TCK-3002, elle **suit chaque commande de `.claude/commands/`** jusqu'au workflow et à la compétence
    qu'elle désigne, et rougit sur un relais cassé.
  - Avant, la liste des compétences exigées était écrite à la main ; elle aurait ignoré les quatre commandes
    ajoutées ici.
