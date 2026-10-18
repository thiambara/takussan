# ADR-0066 — Trois agents planifiés traitent le fichier de pistes : l'explorateur relève, le mesureur re-mesure et classe, l'implémenteur corrige ce qui est classé autonome ; tout passe par une PR vers `pre-dev`, vérifiée avant le push par un script et non par l'agent

- **Statut** : Accepté (2026-10-15), amendé trois fois le 2026-10-17 (l'implémenteur livre par lot, puis par famille ; `impacted-tests` filtré et parallèle)
- **Date** : 2026-10-15
- **Tickets** : aucun (outillage du porteur)

## Contexte

[`docs/plans/2026-10-15-pistes-d-amelioration.md`](../plans/2026-10-15-pistes-d-amelioration.md)
porte 163 constats sur 16 angles explorés, et 37 angles restent à explorer. Aucun de ces constats
n'est un ticket. Le porteur veut que trois agents planifiés les traitent sans lui, à trois cadences :

1. **L'explorateur** prend un angle non exploré, le relève et propose de nouveaux angles.
2. **Le mesureur** re-mesure les constats non encore mesurés. Il dit lesquels tiennent, puis classe
   ceux qui tiennent en deux familles : implémentables sans le porteur, ou à valider par lui.
3. **L'implémenteur** re-mesure ce qui a été classé autonome et l'implémente.

Chaque agent ouvre une PR vers une branche `pre-dev`.

Trois propriétés du dépôt pèsent sur la forme :

- **Le fichier est le seul canal entre les agents**, et ce canal échoue en silence. Un statut mal
  écrit sort l'entrée de la liste du suivant. Une référence en double fait implémenter deux fois.
  Personne ne relit entre deux passages.
- **Un agent sans humain ne doit pas pouvoir élargir son propre périmètre.** Une consigne écrite
  dans son prompt est une intention. Un agent qui se trompe, ou qui « répare » un rouge en
  desserrant une garde, l'enfreint sans le savoir. Ce que l'agent peut modifier ne peut donc pas
  être ce qui le borne.
- **Les règles déjà payées s'appliquent** : mesurer plutôt que déduire, re-mesurer la prémisse
  avant d'implémenter, ne pas lancer les suites entières en local, ne jamais toucher l'arbre
  principal pendant qu'un autre travail tourne, ne jamais afficher un secret.

## Décision

**Trois agents, un format fermé, et une vérification hors de l'agent. L'agent propose, un script
vérifie puis publie.**

### 1. Les agents

Les définitions vivent sous `.agent/agents/pistes/`, et `.claude/agents/pistes-*.md` les relaie,
comme `.claude/commands/` relaie `.agent/workflows/`. Les règles communes sont dans `commun.md`,
que chaque agent lit en premier : elles sont écrites une seule fois.

| Agent | Lit | Écrit | Un passage |
|---|---|---|---|
| `pistes-explorateur` | le tableau des angles | une section `## Angle N` ; la ligne de l'angle passe à `fait` ; 0 à 3 angles proposés | un angle |
| `pistes-mesureur` | `--liste "à mesurer"` | `Statut` et `Mesure` des entrées traitées | 8 entrées au plus |
| `pistes-implementeur` | `--liste "validé"`, puis `--liste "retenu · autonome"` | un ticket par piste, le code, ses tests ; `Statut` et `Mesure` | un lot de 1 à 4 pistes d'une même famille, en une PR (amendements du 2026-10-17) |

### 2. Le format du fichier de pistes

Chaque entrée `###` d'une section `## Angle N — …` porte, dans cet ordre :

```
- Réf : P17.03                 ← angle sur 2 chiffres, rang ; attribuée une fois, jamais réutilisée
- Statut : à mesurer           ← vocabulaire ci-dessous
- Gravité : 🔴|🟠|🟢 …
- Où : …
- Constat : …                  ← chaque fait dit comment il est établi (lu, mesuré, déduit → « à vérifier »)
- Piste : …
- Mesure (2026-10-16, a1b2c3d, mesureur) : <ce qui a été lu ou lancé, ce que cela a rendu>. Classement : <critère et raison>.
```

Les lignes `Mesure` s'ajoutent à la fin de l'entrée. Elles ne se modifient ni ne se retirent, et
chacune est datée, rattachée au sha de `pre-dev` mesuré et signée de son rôle.

| Statut | Qui l'écrit | Sens |
|---|---|---|
| `à mesurer` | explorateur | constat relevé, jamais re-mesuré |
| `caduc` (`— raison`) | mesureur, implémenteur | ne tient plus sur l'arbre mesuré |
| `retenu · autonome` | mesureur | tient, et entre dans les critères A du § 3 |
| `retenu · à valider` (`— raison`) | mesureur, implémenteur | tient, et touche un critère V du § 3 |
| `validé` | **le porteur seul** | le porteur accorde l'implémentation |
| `refusé` | **le porteur seul** | le porteur l'écarte |
| `fait · TCK-NNN` (`— reste : …`) | implémenteur | implémenté par ce ticket ; le reste, s'il y en a, n'est pas fait |

Les transitions permises par rôle, les chemins qu'un rôle peut toucher et la forme sont tenus par
[`scripts/check-pistes.mjs`](../../scripts/check-pistes.mjs), qui fait foi. Pour valider une
piste, le porteur passe sa ligne `Statut` à `validé` sur `pre-dev`, par un commit direct ou une PR.

**Ce que `validé` accorde** (précisé le 2026-10-15, avant toute première validation) :
- **le critère V que cite le dernier classement de la piste**, et lui seul. L'implémenteur ne
  reclasse plus pour ce critère, mais il reclasse pour un autre ;
- **le choix que décrit la précision** `validé — …`. Le ticket la recopie mot pour mot, et
  `check-pistes.mjs` le vérifie au passage à `fait`. Sans précision, c'est l'option unique de la
  `Piste` qui est accordée ; si la `Piste` en propose plusieurs, la piste revient au porteur ;
- **aucun chemin** : une piste dont le correctif passe par un chemin fermé à l'implémenteur
  (V5, V6, V9) revient au porteur (`retenu · à valider — chemin fermé : …`), qui la traite
  lui-même.

Une piste `validé` ne revient jamais au porteur sans raison écrite : la garde le refuse.

**Ce qui reste d'une validation partielle** (ajouté le 2026-10-15). Le porteur peut ne valider
qu'une partie d'une `Piste`. Il écrit alors ce qu'il garde pour plus tard à la fin de la
précision, après `; reste :` : `validé — <décision> ; reste : <ce qui n'est pas confié>`.
L'implémenteur n'implémente pas le reste. Il le recopie dans le ticket, et l'entrée passe à
`fait · TCK-NNN — reste : <le même texte>`, que la garde compare à la précision. L'implémenteur
écrit aussi un reste quand il laisse lui-même de côté une partie de la `Piste`. Sans cela, une
fois l'entrée `fait`, ce qui n'a pas été fait ne serait plus suivi nulle part : seul
l'explorateur crée une entrée. `node scripts/check-pistes.mjs --restes` les liste, pour qu'on y
revienne.

### 3. Ce que le mesureur peut classer « autonome »

**Le doute classe « à valider ».** Une entrée est `retenu · autonome` seulement si elle relève
d'un critère A et ne touche aucun critère V.

**A — autonome possible** :

- **A1** — Défaut dont le comportement attendu est **déjà écrit** : spec, ADR accepté, ticket,
  test, ou contrat du code appelant. Corriger ne demande aucun choix de produit.
- **A2** — Performance sans changement de résultat : N+1, chargement anticipé, index (migration
  **neuve** d'ajout d'index, avec son `down()`).
- **A3** — Code mort mesuré sans appelant des deux côtés (front et API), retrait compris d'une
  route sans appelant.
- **A4** — i18n et accessibilité sans texte de produit neuf : clé manquante dans une des trois
  langues, attribut ARIA, contraste ramené sur un jeton existant.
- **A5** — Garde ou test ajouté, sans resserrer un seuil existant.
- **A6** — Document qui contredit le code mesuré, corrigé pour dire ce que fait le code.

**V — toujours « à valider »** :

- **V1** — Argent : calcul ou écriture d'un montant, d'une échéance, d'une facture, d'un paiement,
  d'un reversement, d'un crédit ou d'une pénalité.
- **V2** — Authentification, session, 2FA, step-up, impersonation, ou autorisation qu'un appelant
  légitime utilise aujourd'hui.
- **V3** — Données personnelles : ce qui est exposé, conservé ou supprimé (RGPD).
- **V4** — Schéma : toute migration autre qu'un ajout d'index, toute suppression ou réécriture de
  données.
- **V5** — Infrastructure et déploiement : `deploy/`, `.github/`, `docker-compose.yml`, `dev.sh`,
  variables d'environnement, Dokploy, DNS.
- **V6** — Décision structurelle (elle demande un ADR), ou dépendance ajoutée ou retirée.
- **V7** — Choix de produit : comportement visible neuf, texte métier neuf, retrait d'une fonction
  visible, design.
- **V8** — Estimation au-delà de M, ou plus d'un ticket.
- **V9** — Seuil d'une garde (couverture, budgets, plafonds) ou instructions et gardes des agents.

Le mesureur cite le critère dans sa ligne `Mesure` (« Classement : A2, … »). L'implémenteur
re-mesure avant de coder. S'il découvre un critère V (pour une piste `validé` : un critère autre
que celui accordé, § 2), il reclasse en `retenu · à valider` au lieu
d'implémenter.

### 4. Le passage : l'agent propose, `pistes.sh` vérifie et publie

[`scripts/agents/pistes.sh`](../../scripts/agents/pistes.sh) déroule chaque passage :

1. **Arrêts préalables**, sans dépense : le fichier `PAUSE`, un verrou par rôle (un passage à la
   fois), et la charge de la machine (au-delà de 1,5 × le nombre de cœurs, l'implémenteur et le
   mesureur ne démarrent pas).
2. **État de ses PR** : un agent a au plus `PR_MAX` PR ouvertes vers `pre-dev`, 1 pour
   l'explorateur et le mesureur, 3 pour l'implémenteur (`config.env`). Elles se lisent de la plus
   ancienne à la plus récente :
   - une PR verte est fusionnée seulement si le porteur l'a permis (§ « Décisions du porteur »,
     Q1). C'est d'ordinaire le fusionneur qui l'a déjà fusionnée (Q1 ci-dessous) ;
   - une PR verte n'est fusionnée qu'après un **essai de fusion** sur la base courante, gardes
     comprises ([ADR-0067](0067-l-index-du-backlog-n-est-plus-versionne.md)) ;
   - une PR en conflit sur le seul `docs/backlog/INDEX.md` est réconciliée **sans modèle** (depuis
     ADR-0067, l'index n'étant plus versionné, en le retirant) :
     `pre-dev` y est fusionnée, l'index régénéré, l'arbre vérifié comme avant toute publication,
     puis poussé. Deux PR de l'implémenteur ouvertes ensemble ajoutent chacune un ticket, et le
     compte « Done — N » de l'index change dans les deux : la seconde à fusionner entre toujours en
     conflit, sans rien à décider ;
   - la plus ancienne PR rouge, ou en conflit ailleurs, est réparée par le passage. Après trois
     réparations, elle est abandonnée, le passage le dit, et elle garde sa place ;
   - sinon, s'il reste une place, le passage prend du travail neuf ; s'il n'en reste pas, il
     s'arrête avant de lancer le modèle.

   Jusqu'au 2026-10-15, chaque agent n'avait qu'une PR ouverte, et l'implémenteur s'arrêtait tant
   que la CI de la sienne tournait (15 min environ pour le seul Web CI). Mesuré ce jour-là : 10
   pistes en 9 h 30, pour 237 min de travail du modèle, et 10 passages arrêtés en 5 s sur « CI en
   cours », alors que 138 pistes attendaient (107 validées, 31 autonomes).
3. **Un arbre de travail dédié par rôle**, remis à `origin/pre-dev` ou à la branche à réparer.
   Ces arbres sont des worktrees d'un **clone propre aux agents** (`~/.takussan-agents/depot`),
   pas de l'arbre principal. Mesuré le 2026-10-15, au premier passage lancé par `launchd` : macOS
   refuse à un job `launchd` la lecture de `~/Documents`, et la copie de `takussan-api/.env` a
   échoué en « Operation not permitted ». Le même script, lancé d'un terminal, passait. Les `.env`
   sont donc copiés par `installer`, depuis le terminal. Ce qu'un passage interrompu y a laissé est sauvé dans le journal avant
   la remise à zéro.
4. **L'agent tourne en `claude -p`** :
   - les réglages de l'utilisateur ne sont pas chargés, ni greffon ni MCP ;
   - un plafond de dépense et une durée bornée s'appliquent, et le groupe de processus est tué à
     l'échéance ;
   - un hook `PreToolUse` borne les outils (§ 5).
5. **Vérification avant tout push**, par la version de `check-pistes.mjs` prise sur
   `origin/pre-dev`, et non par celle de la branche de l'agent :
   - l'arbre est propre ;
   - `--role <rôle> --base origin/pre-dev` est vert ;
   - pour l'implémenteur, toutes les gardes `scripts/check-*.mjs`, l'index du backlog et Pint
     sont verts.

   Au moindre rouge, rien n'est poussé : le correctif est sauvé dans le journal.
6. **Publication** : push de la branche `agents/<rôle>/<horodatage>`, puis PR vers `pre-dev`
   étiquetée `agent:<rôle>`, dont le titre et le corps sont écrits par l'agent.
7. **Journal** : une ligne par passage (rôle, mode, issue, PR, durée, coût), dans
   `~/.takussan-agents/journal.tsv`.

`dev` avance sans `pre-dev` (le travail du porteur, la carte d'impact nocturne). Quand `dev` a
des commits que `pre-dev` n'a pas, le passage ouvre la PR `dev → pre-dev`. Il n'en ouvre jamais
une seconde.

### 5. La garde des outils

[`scripts/agents/garde.mjs`](../../scripts/agents/garde.mjs) est le hook `PreToolUse` des trois
agents. Ce qu'il refuse :

- **Écriture** hors de leur arbre et de leur dossier de sortie.
- **Publication** : `git push`, création, fusion ou commentaire de PR, appels d'API GitHub en
  écriture. Le script publie, l'agent non.
- **Arbre principal** : tout accès à l'arbre principal du porteur, et toute gestion de worktrees.
- **Services et données** :
  - arrêt, suppression ou reconstruction de conteneurs ;
  - `migrate*`, `db:*` et écritures SQL sur la base de développement ;
  - accès à `takussan.com`, ssh, Dokploy et Vercel.
- **Secrets** : lecture d'un `.env` ou du trousseau.
- **Machine et dépendances** : ajout de dépendance, `sudo`, `launchctl`, `crontab`.
- **Leurs propres bornes** : modification des instructions et des gardes des agents.

Le hook appliqué n'est **pas** celui de l'arbre de l'agent. C'est une copie figée à
l'installation, sous `~/.takussan-agents/outils/` : un agent ne desserre pas la garde qui le
borne, même par une PR fusionnée.

## Décisions du porteur (2026-10-15)

- **Q1 — Fusion dans `pre-dev` : (a).** Le script fusionne la PR d'un agent quand sa CI est
  verte (`FUSION=auto`). `pre-dev` est un tampon. La porte du porteur est la PR `pre-dev → dev`,
  ainsi que le statut `validé`.

  La fusion a lieu **dès que la CI est verte**, par un quatrième job `launchd`, le fusionneur
  (`pistes.sh fusionner`, toutes les 10 min) :
  - il ne lance aucun modèle, donc ne coûte rien ;
  - il ne fusionne que les PR ouvertes par le script : une branche `agents/*` étiquetée
    `agent:*`, ou la PR `dev → pre-dev` étiquetée `agents:synchro`, et jamais avec
    `--delete-branch` pour cette dernière ;
  - une PR du porteur vers `pre-dev` n'est jamais touchée ;
  - depuis le 2026-10-16, chaque fusion est d'abord **essayée** sur la base courante, gardes
    comprises, et refusée si l'arbre fusionné rougit
    ([ADR-0067](0067-l-index-du-backlog-n-est-plus-versionne.md)).

  Ajouté le 2026-10-15, après le premier cycle : sans lui, une PR verte attendait le passage
  suivant de son propre agent (jusqu'à 3 h pour l'explorateur). L'agent restait bloqué pendant ce
  temps, puisqu'il n'a qu'une PR ouverte à la fois, et l'agent suivant ne voyait pas son travail.
- **Q2 — Planification : `launchd` sur ce poste.**
  - Les cadences se règlent par `pistes.sh planifier <x> <y> <z>`, et se lisent par
    `pistes.sh etat`, jamais ici.
  - Posées à 180, 90 et 120 min le 2026-10-15, elles ont été ramenées le jour même à 60 min pour
    l'explorateur, 15 pour le mesureur et 15 pour l'implémenteur. Attendre ne coûte rien : un
    passage dont la PR est ouverte, ou qui n'a rien à faire, s'arrête avant de lancer le modèle.
    Le rythme réel est borné par le cycle passage → CI → fusionneur, pas par l'intervalle.
  - Le mesureur est passé à 30 min le même jour : ses tests, joués en même temps que ceux de
    l'implémenteur, portaient la charge à 18 sur 8 cœurs. Un passage de l'implémenteur a pris
    4 628 s sur un plafond de 5 400 s, alors que le mesureur avait déjà 28 pistes d'avance.
  - Le soir du 2026-10-15, l'implémenteur est passé à **5 min** et l'explorateur à **180 min**.
    L'implémenteur ne s'arrête plus sur la CI de sa PR (§ 4, étape 2) : à 5 min, il enchaîne
    les passages, et `launchd` ne relance pas un passage en cours. L'explorateur produit environ
    8,6 pistes par angle, bien plus que l'implémenteur n'en livre : l'espacer laisse le temps de
    valider ce qu'il a déjà relevé. Le plancher de `planifier` est passé de 10 à 5 min.
  - **L'implémenteur prend les 🔴 d'abord**, validées puis autonomes, puis les 🟠 validées, puis
    les 🟠 autonomes. Avant, il prenait toutes les validées dans l'ordre du fichier, et les défauts
    de sécurité validés passaient après des pistes d'ergonomie.
  - Une cadence seule se change sur le plist du job concerné, au repos. `planifier` retire et
    repose les trois jobs à la fois.
  - L'implémenteur a besoin de PostgreSQL et de Meilisearch locaux.
  - ⚠ **Les agents dorment avec le Mac.** Selon `man launchd.plist` (`StartInterval`), un
    lancement qui tombe pendant la veille est sauté. Capot fermé, rien ne tourne, et la reprise se
    fait au réveil.
  - Un passage surpris par la veille est sauvé par le passage suivant, sans rien publier à
    moitié.
  - Les faire tourner ordinateur fermé (GitHub Actions en `cron`, clé d'API à l'usage) serait un
    amendement de cet ADR.

## Amendement du 2026-10-17 — l'implémenteur livre par lot

**Mesuré ce jour-là**, sur `~/.takussan-agents/journal.tsv` : 76 passages de l'implémenteur ont
publié une PR, **une piste chacun**, en 16,6 min et 1,91 USD en moyenne. Les passages se suivent un
à la fois (verrou par rôle, § 4). Il restait **140 pistes** à implémenter (115 `validé`, 25
`retenu · autonome`) : environ 40 h de Mac éveillé à ce rythme. Le plafond de PR ouvertes ne
bornait pas le débit ; la durée du passage, si. Une part de chaque passage ne dépend pas de la
piste : la lecture des règles (`commun.md`, cet ADR, les `CLAUDE.md`), la préparation de l'arbre,
les gardes du dépôt, la PR et sa CI.

**Décision du porteur** : l'implémenteur livre **un lot** par passage, en une seule PR.

- **1 à 4 pistes**, prises dans l'ordre de gravité du § « Décisions du porteur ». La première
  entrée libre ouvre le lot et en fixe le côté (`takussan-api/` ou `takussan-web/`) ; les
  suivantes du même côté le complètent, celles de l'autre côté sont sautées.
- **Un lot ne mêle pas l'API et le front** *(remplacé le jour même par la règle de famille, ci-dessous)*. Une piste qui touche les deux côtés part seule, ou
  avec les entrées de même cause qui partagent son ticket.
- **Chaque piste garde son ticket, son test, son ablation et ses commits**, et elle est close
  avant que la suivante commence. Une piste re-mesurée caduque ou reclassée à valider compte dans
  le lot, et le passage continue avec la suivante.
- **Le temps** : au-delà de 100 min, l'agent ne commence plus de piste et publie ce qui est clos.
  Une piste commencée et non close est retirée de l'arbre.
- **La réparation** : une piste qui ne se répare pas sort du lot par `git revert`, et son entrée
  revient à son statut de départ. Les autres ne restent pas bloquées derrière elle.
- **Les réglages** (`config.env`) : `BUDGET_IMPLEMENTEUR` passe de 20 à 45 USD, et
  `DUREE_IMPLEMENTEUR` de 5 400 à 9 000 s.

**Ce que la garde vérifie** (`check-pistes --role implementeur`, joué par `pistes.sh` avant tout
push) : au plus 4 entrées changent de statut, et un lot de plusieurs tickets ne touche pas à la
fois `takussan-api/` et `takussan-web/`. Ablation sur le fichier de pistes réel : 6 cas, 4 permis
qui restent verts (1 piste, 4 pistes, une piste seule sur les deux côtés, 3 entrées d'un même
ticket sur les deux côtés) et 2 interdits (5 pistes, 2 tickets sur les deux côtés) qui rougissent ;
avec la garde d'avant l'amendement, les 2 interdits restaient verts.

**Ce qu'elle ne vérifie pas** : le classement par taille (une piste M compte double, et un lot ne
dépasse pas l'équivalent de 4 S), qui reste une consigne de l'agent ; ni la règle des 100 min.

**Ce que ça coûte** : une CI rouge sur une piste retient tout le lot jusqu'à sa réparation, et
la PR à relire est plus grosse. **Ce qui n'est pas mesuré** : le gain. Il est estimé à ×2 ou ×3,
puisque la part fixe se paie une fois par lot. Il se relève sur le journal (pistes closes par
heure de passage) après les premiers lots, et le plafond de 4 se rediscute sur ce chiffre.

### Second amendement du 2026-10-17 — le lot se compose par famille

**Relevé le même jour**, sur `pre-dev` = `4bf83b81` : 131 pistes à implémenter (74 🟠 et 30 🟢
validées, 23 🟠 et 4 🟢 autonomes, aucune 🔴). D'après les fichiers que cite leur `Où`, 74 ne
touchent que l'API, 21 que le front et 36 les deux. Lues une à une, elles forment environ 22
familles de 3 à 8 pistes (index manquants, requêtes par ligne, routeur SMS, jobs planifiés,
alertes, médias, Boost et crédits, rapprochement, PDF, autorisation, données personnelles,
recherche, adresses, équipements, accessibilité des champs, primitives d'interface, repères de
page…), et une douzaine de pistes isolées. Quatre paires ont la même cause (P02.11 et P19.05,
P05.05 et P11.09, P05.08 et P14.06, P22.02 et P22.04).

Deux défauts de la règle du premier amendement en sortaient :
- **les 34 🟢 n'étaient prises par aucun passage** : l'ordre de choix s'arrêtait aux 🟠 autonomes,
  et ce depuis l'origine de l'ADR ;
- **les 36 pistes qui touchent les deux côtés partaient seules**, alors que plusieurs sont de la
  même famille (crédits, médias, recherche).

**Décision du porteur** :
- **le lot se compose par famille** : la première entrée libre fixe la famille, et le lot se
  complète d'abord avec les entrées libres de la même famille, de toute gravité ; s'il reste de
  la place, avec les suivantes du même côté, si le lot ne touche qu'un côté ;
- **les 🟢 entrent dans l'ordre de choix**, après les 🟠 autonomes, et complètent avant cela un
  lot de leur famille ;
- **un lot qui touche l'API et le front est permis s'il est une seule famille.**

**Ce que la garde vérifie** : un lot de plusieurs tickets qui touche `takussan-api/` et
`takussan-web/` doit former une seule famille, au sens mécanique : ses pistes faites se relient
de proche en proche par un angle, un ticket ou un nom de fichier cité dans leur `Où` (le nom seul,
car les chemins y sont tantôt complets, tantôt abrégés). Ablation sur le fichier réel, 8 cas : 5
permis (même angle des deux côtés, fichier commun entre deux angles, chaîne de trois pistes, lot
sans lien d'un seul côté, 4 pistes 🟠 et 🟢 d'une famille) restent verts, et 3 interdits (deux
pistes sans lien des deux côtés, une piste sans lien ajoutée à une famille, 5 entrées) rougissent.
La garde du premier amendement refusait 4 des 5 cas permis.

**Ce qu'elle ne vérifie pas** : qu'un lot d'un seul côté soit une famille. Le remplissage par le
côté reste permis, et la priorité donnée à la famille est une consigne de l'agent.

### Troisième amendement du 2026-10-17 — `impacted-tests` dans un lot

**Mesuré** sur le lot #539 (3 pistes, 11 fichiers) : `impacted-tests` a pris 1 303 s des 1 925 s
du passage, pour 164 classes. **83 d'entre elles** n'avaient aucun lien avec le diff : ce sont les
tests écrits depuis la carte d'impact, que le script ajoutait tous d'office. La carte se régénère
la nuit sur `dev` et n'arrive sur `pre-dev` qu'après une promotion ; elle avait alors 531 commits
de retard, et chaque PR d'agent allonge la liste.

**Décision du porteur** :
- **les tests écrits depuis la carte ne sont rejoués que s'ils citent une classe de `app/` que le
  diff touche** (`ImpactSelector`), quand le diff n'est fait que de classes de `app/` et de tests ;
  sinon, tous, comme avant ;
- **`impacted-tests --parallel`** répartit la sélection sur 4 processus (paratest, par une copie de
  `phpunit.xml` écrite hors de l'arbre). L'implémenteur le lance une fois par lot.

**Mesuré au repos** (8 cœurs, charge entre 1,6 et 3,8), sur la plage exacte de #539 :

| Sélection | Classes | Tests | Durée |
|---|---|---|---|
| avant (tous les tests postérieurs à la carte), en série | 164 | 1 392 | 381 s |
| filtrée, en série | 92 | 835 | 277 s |
| filtrée, 4 processus | 92 | 835 | **80 s** |

Les trois exécutions sortent en 0. L'agent avait mesuré 1 303 s pour la première ligne, sous la
charge des autres agents. Ablation des tests du sélecteur : le filtre retiré rougit 2 tests, la
règle « hors de `app/`, on garde tout » retirée en rougit 1.

**Ce que ça ne garantit pas** : un test neuf qui couvre une classe touchée sans la nommer (un test
HTTP qui passe par la route d'un contrôleur modifié) n'est plus rejoué avant la PR. La CI joue la
suite entière ; `impacted-tests` reste une boucle de retour, pas une garde.

## Amendement du 2026-10-18 — pas de modèle pour une liste vide, les rôles s'enchaînent

**Constat** (journal `~/.takussan-agents/journal.tsv`, du 2026-10-17 au 2026-10-18) :

| Rôle | Cadence | Passages | Utiles | Vides | Passage utile (médiane) |
|---|---|---|---|---|---|
| explorateur | 180 min | 15 | 15 | 0 | 7 min |
| mesureur | 30 min | 89 | 14 | 74 (21,3 USD) | 3 min |
| implémenteur | 5 min | 117 | 61 | 37 (12,5 USD) | 28 min |

La chaîne était affamée en amont : l'explorateur, seul rôle sans passage vide, ne travaillait que
7 min sur 180, tandis que les deux autres lançaient le modèle pour lire une liste vide. La
décision Q2 ci-dessus écrivait déjà qu'un passage « qui n'a rien à faire, s'arrête avant de lancer
le modèle » : le code ne le faisait pas.

**Décision du porteur** :

1. **Rien à faire, rien à payer.** `pistes.sh lancer` lit lui-même, sur `BASE_REF`, la liste du rôle
   (`--angles-a-faire`, `--liste "à mesurer"`, `--liste "validé"` et `--liste "retenu · autonome"`)
   et s'arrête en `rien` si elle est vide. Pour l'implémenteur, une piste citée par une PR ouverte
   est prise : une liste où toutes le sont est vide aussi. **Le doute fait partir le modèle** :
   une lecture qui échoue, ou une garde qui n'a pas prouvé (`--report`) qu'elle a lu le fichier.
   Payé en l'écrivant : sous un chemin `/var`, la garde ne s'exécutait pas et rendait une liste
   vide, ce qui aurait arrêté le rôle pour toujours.
2. **Les rôles s'enchaînent.** Quand une PR de l'explorateur est fusionnée (par le fusionneur ou par
   l'explorateur lui-même), le mesureur part aussitôt (`launchctl kickstart`) ; quand c'est une PR
   du mesureur, l'implémenteur part. Les cadences restent, en filet.
3. **L'explorateur passe à 60 min.** Son passage dure 7 min : aucun chevauchement. Il restait 38
   angles sur 83, soit 5 jours à 180 min, 2 jours à 60.

## Conséquences

- **Ce que ça rend possible** :
  - les 37 angles et les 163 constats avancent sans le porteur ;
  - chaque classement laisse une trace datée et relisible ;
  - ce qui demande le porteur lui arrive déjà mesuré.
- **Ce que ça coûte** :
  - une dépense par passage, plafonnée et journalisée ;
  - une PR à relire par passage utile ;
  - `pre-dev` à tenir à jour avec `dev`.
- **Ce que ça interdit** :
  - à l'explorateur, de classer ;
  - au mesureur, de toucher autre chose que le fichier de pistes ;
  - à l'implémenteur, les chemins V5, V6 et V9, ainsi que la modification d'une migration
    existante ;
  - aux trois, de publier eux-mêmes.
- **Ce que ça ne garantit pas** :
  - qu'une mesure est vraie : la forme en garde la trace, la relecture en juge ;
  - qu'un classement « autonome » est juste : l'implémenteur re-mesure, et la PR se relit.
- **`pre-dev` n'est pas protégée** et ne déploie rien. `master` et `preview` restent hors
  d'atteinte : aucune PR des agents ne les vise.

## Application

- **Forme et périmètre** : `scripts/check-pistes.mjs`.
  - En mode garde, Repo CI le joue sur toute PR.
  - En mode rôle, `pistes.sh` le joue avant tout push.
  - Ablation du 2026-10-15 : 32 altérations, dont Réf en double, statut hors vocabulaire,
    `retenu` sans mesure, mesureur qui écrit `validé` ou retouche un constat, implémenteur qui
    touche `.github/` ou sa propre garde, explorateur qui explore deux angles. Les 26 altérations
    interdites rougissent, et les 6 permises restent vertes.
- **Outils** : `scripts/agents/garde.mjs`. Mesuré le 2026-10-15 sur `claude -p` en
  `bypassPermissions` : un hook `PreToolUse` qui sort en 2 empêche bien la commande. Un agent
  défini par lien symbolique sous `.claude/agents/` est bien chargé par `--agent`.
- **Orchestration et planification** : `scripts/agents/pistes.sh` (`installer`, `planifier`,
  `lancer`, `etat`, `pause`, `reprendre`, `deplanifier`). `lancer <rôle> --a-blanc` déroule un
  passage complet sans rien publier.
- **Passage à blanc du mesureur, le 2026-10-15** (base `a429039b`, charge entre 1,1 et 2,6 sur
  8 cœurs) :
  - 6 min 48 s, 3,18 USD, 68 tours ;
  - les huit premières entrées 🔴 ont été re-mesurées par des tests temporaires, retirés avant le
    commit ;
  - toutes tiennent : une est classée `retenu · autonome` (A1 + A5), sept `retenu · à valider`
    avec leur critère V ;
  - le périmètre du rôle est tenu.

  La garde a refusé quatre commandes légitimes :
  - `Request::create` dans `tinker` ;
  - une recherche Meilisearch locale en `POST` ;
  - deux écritures dont le texte citait un chemin protégé.

  Les quatre ont été corrigées et ajoutées aux cas d'ablation, qui sont 67 depuis.
