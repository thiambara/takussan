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
| `pistes-implementeur` | `--liste "validé"`, puis `--liste "retenu · autonome"` | un ticket par piste, le code, ses tests ; `Statut` et `Mesure` | un lot de 1 à 10 pistes d'une même famille, en une PR (amendements du 2026-10-17 et du 2026-10-21) |

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
  test, ou contrat du code appelant. Corriger ne demande aucun choix de produit. *Depuis le
  2026-10-18* : une piste V7 dont la seule option est déjà écrite dans une spec ou un ADR accepté
  relève de A1.
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
- ~~**V8** — Estimation au-delà de M, ou plus d'un ticket.~~ *Levé le 2026-10-18* : la taille ne
  fait plus soumettre une piste au porteur. L'implémenteur découpe en tickets, dans la borne de
  son lot (amendement du 2026-10-17).
- **V9** — Seuil d'une garde (couverture, budgets, plafonds) ou instructions et gardes des agents.

Le mesureur cite le critère dans sa ligne `Mesure` (« Classement : A2, … »). L'implémenteur
re-mesure avant de coder. S'il découvre un critère V (pour une piste `validé` : un critère autre
que celui accordé, § 2), il reclasse en `retenu · à valider` au lieu
d'implémenter.

### 4. Le passage : l'agent propose, `pistes.sh` vérifie et publie

[`scripts/agents/pistes.sh`](../../scripts/agents/pistes.sh) déroule chaque passage :

1. **Arrêts préalables**, sans dépense : le fichier `PAUSE`, un verrou par rôle (un passage à la
   fois ; par instance pour l'implémenteur, amendement du 2026-10-21 bis), et la charge de la machine (au-delà de 1,5 × le nombre de cœurs, l'implémenteur et le
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
     réparations, elle est abandonnée, le passage le dit, et elle garde sa place. Un job en échec
     rend la PR rouge même si d'autres tournent encore : avant le 2026-10-20, « en cours »
     l'emportait, et le passage prenait une piste neuve au lieu de réparer (#747, 40 minutes) ;
   - le conflit ne se lit pas seulement chez GitHub, qui rend `UNKNOWN` après chaque fusion dans
     `pre-dev` tant qu'on ne lui redemande pas : sans verdict, `git merge-tree` le calcule sur place.
     Une PR à la CI verte dont l'essai de fusion est rouge (conflit, ou garde rouge sur l'arbre
     fusionné) se répare aussi, et le message de réparation porte le rapport de l'essai. Avant le
     2026-10-19, ces deux PR étaient classées « CI en cours » à chaque passage (#739, deux heures). Le
     fusionneur de même : il n'écarte que `CONFLICTING`, et laisse l'essai trancher un `UNKNOWN`
     (#782, sautée deux tours le 2026-10-20) ;
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
    valider ce qu'il a déjà relevé. Le plancher de `planifier` est passé de 10 à 5 min, puis à
    1 min le 2026-10-21 (le porteur : « si l'un termine, un autre prend sa place immédiatement ») ;
    la cadence du fusionneur se règle depuis, en cinquième argument.
  - **L'implémenteur prend les 🔴 d'abord**, validées puis autonomes, puis les 🟠 validées, puis
    les 🟠 autonomes. Avant, il prenait toutes les validées dans l'ordre du fichier, et les défauts
    de sécurité validés passaient après des pistes d'ergonomie.
  - Le 2026-10-19, le porteur a posé **30 min pour l'explorateur, 20 pour le mesureur et 20 pour
    le délégué** ; l'implémenteur reste à 5 min et le fusionneur à 10. Ce sont les valeurs par
    défaut de `planifier` lancé sans argument (le délégué omis prend 20).
  - Une cadence seule se change sur le plist du job concerné, au repos. `planifier` retire et
    repose tous les jobs à la fois : il couperait un passage en cours.
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

## Amendement du 2026-10-18 (bis) — le porteur délègue une partie de ses validations

**Constat du porteur** : plus de 98 % des recommandations que la session lui soumettait étaient
suivies telles quelles ; le 2026-10-18, 21 sur 21. Mesuré au même moment : 41 pistes
« à valider » pour 2 « autonome ». Le porteur était devenu le goulot de la chaîne, sur des
décisions qu'il ne faisait que confirmer.

**Décision du porteur** :

1. **Un quatrième rôle planifié, `delegue`** (`.agent/agents/pistes/delegue.md`). Il ne fait
   qu'une chose : relire jusqu'à 6 entrées `retenu · à valider` et, pour chacune, soit écrire
   `validé (délégué) — <décision>`, soit laisser le statut et écrire une `Recommandation : …`.
   Pour l'implémenteur, `validé (délégué)` vaut `validé`. Le délégué n'écrit que le fichier de
   pistes, comme le mesureur. Il est planifié toutes les 30 min, relancé dès qu'une PR du mesureur
   est fusionnée, et il relance l'implémenteur quand la sienne l'est. Budget 5 USD, 30 min.
   **Il ne lance pas de modèle** quand `--a-deleguer` ne rend rien.
2. **Catégories déléguées** : V4 additif, V6 réversible et sans ADR, V7 mineur et réversible, V8.
   **Restent au porteur quoi qu'il arrive** : V1 (argent), V2 (authentification), V3 (données
   personnelles), V5 (infrastructure, production, secrets) et V9 (bornes des agents : un agent ne
   s'accorde pas ce qui le borne). Restent aussi au porteur : une entrée qu'il a déjà tranchée
   (`porteur (date) : …`, « plus tard » compris) et un `chemin fermé`.
3. **La garde le tient, pas la consigne.** `check-pistes --role delegue` refuse le push si un
   critère réservé apparaît dans le statut **ou dans une ligne `Mesure` du mesureur**, si la
   mesure du délégué ne déclare pas ses critères (`Délégation : V7, …`) ou en déclare un réservé,
   et si la signature n'est pas `validé (délégué) — <décision de 10 caractères au moins>`. Éprouvé
   par un banc de 15 cas, et par ablation de chacune des cinq protections : chacune retirée fait
   accepter un cas qui doit être refusé. **Ce que la garde ne voit pas** : qu'un V4 est additif,
   qu'un V7 est mineur. Le délégué en juge, et le doute recommande au lieu de valider.
4. **Le porteur garde la main** :
   - `~/.takussan-agents/outils/pistes.sh releve [jours]` liste ce que le délégué a validé ou
     recommandé (`check-pistes --delegations`) ;
   - une validation déléguée se reprend d'une ligne, en rendant le statut à
     `retenu · à valider — porteur (date) : …` (ou par un retour en arrière, si elle est déjà
     `fait`) ;
   - **un désaveu retire toute la catégorie**, sans autre réglage : une ligne
     `- Mesure (…, humain) : désaveu de la délégation V7 — …` sur n'importe quelle entrée, et la
     garde ne délègue plus V7.
5. **V8 est levé, et A1 s'élargit** (§ 3) : la taille ne soumet plus une piste, et une piste V7
   dont l'option est déjà écrite dans une spec ou un ADR relève de A1. **Une dépendance de
   développement ne passe pas en A**, contrairement à ce qui avait été proposé : l'implémenteur ne
   touche ni `package.json` ni `composer.json` (§ 4). L'ouvrir demanderait une garde qui ne laisse
   passer que `devDependencies` et `require-dev`, et qui ne sait rien du fichier de verrou. Ces
   pistes restent « en session ».

**Ce qui change dans le risque** : la lecture du porteur était le seul regard extérieur à la
chaîne. Désormais, le même modèle propose, mesure, valide puis implémente, et ses erreurs se
répètent au lieu de se compenser. La réponse est double : les catégories où une erreur coûte cher
restent hors délégation, garde à l'appui, et chaque délégation laisse une trace datée et
réversible. Le relevé n'a de valeur que s'il est lu.

## Amendement du 2026-10-21 — un lot compte jusqu'à 10 pistes

**Relevé ce jour-là**, sur `~/.takussan-agents/journal.tsv` : les 11 passages de l'implémenteur
qui ont publié une PR le 2026-10-21, en lots de 1 à 4 pistes, ont duré de 17 à 64 min (992 à
3 835 s) et coûté de 2,62 à 5,58 USD. Le porteur venait de valider en bloc 84 pistes (#914) : à
4 pistes par passage, une vingtaine de passages au moins.

**Décision du porteur** : le plafond du lot passe **de 4 à 10 entrées** qui changent de statut,
reclassements et caducs compris, et la consigne de taille de l'agent de l'équivalent de 4 S à
l'équivalent de 10 S. `LOT_MAX` de `scripts/check-pistes.mjs` le garde. Ablation sur le fichier de pistes réel
(`--role implementeur`, entrées reclassées) : 10 entrées passent, 11 sont refusées (« un lot compte
au plus 10 entrées »), et les mêmes 10 entrées sont refusées avec l'ancien `LOT_MAX = 4`.

**Ce qui ne change pas, et borne encore le lot** : la règle des 100 min (au-delà, l'agent ne
commence plus de piste et publie ce qui est clos), le passage tué à 150 min
(`DUREE_IMPLEMENTEUR=9000`) et le budget de 45 USD par passage. 10 est donc un plafond, pas une
cible : un lot de 10 pistes S tient dans les 100 min seulement si elles vont aussi vite que les
plus rapides des lots relevés. Le plafond de PR ouvertes de l'implémenteur n'est pas touché :
`config.env` le pose à 10 depuis le 2026-10-15.

**Ce que ça coûte** : une CI rouge sur une piste retient jusqu'à 10 pistes derrière elle, jusqu'à
sa réparation ou son `git revert`, et la PR à relire est plus grosse. Le gain se relève sur le
journal (pistes closes par heure de passage) après les premiers lots.

## Amendement du 2026-10-21 (bis) — plusieurs implémenteurs en parallèle

**Relevé ce soir-là, à 20 h 41** : 92 pistes à prendre (88 `validé`, 4 `retenu · autonome`), un
seul implémenteur, un passage à la fois (verrou du rôle), de 17 à 64 min chacun. Le porteur
demandait quatre implémenteurs simultanés ; il en a retenu **deux**, sur une machine de 8 cœurs et
16 Go dont l'implémenteur occupe PostgreSQL, Meilisearch et les suites ciblées.

**Deux collisions rendaient un second implémenteur nuisible sans règle** :
- **la même piste**, prise par deux passages partis avant que l'un ait ouvert sa PR — la liste
  « citée par une PR ouverte » ne voit pas un lot en cours ;
- **le même numéro de ticket** : chacun prend « le plus grand vu, plus un », et la seconde PR
  fusionnée rougit `check-backlog` (id en double), puis l'essai de fusion la refuse.

**Décision** : `INSTANCES_IMPLEMENTEUR` (`config.env`, 1 par défaut) lance `N` implémenteurs, et
chacun a sa **part**, sans rien partager à l'exécution :
- **les pistes** : l'instance `k` (de 1 à `N`) ne prend que les pistes `P<nn>.…` dont le numéro
  d'angle `nn` vaut `k − 1` modulo `N`. Un angle entier va à une seule instance, et la famille
  par angle avec lui. Relevé sur la liste de 20 h 41 : 50 pistes pour l'instance 1 (angles
  pairs), 42 pour l'instance 2 ;
- **les numéros de ticket** : le plus petit numéro au-dessus du plus grand vu qui vaut `k − 1`
  modulo `N`. Les trous dans la numérotation sont permis (`check-backlog` ne refuse que le
  doublon) ;
- **les PR** : le plafond `PR_MAX_IMPLEMENTEUR` reste celui du rôle et compte toutes les PR
  `agent:implementeur` ; une instance ne fusionne, ne réconcilie et ne répare que **les siennes**,
  reconnues au suffixe `-<k>` de leur branche (`agents/implementeur/<horodatage>-<k>`, aucun
  suffixe pour l'instance 1). Une PR d'une instance au-delà de `N` (le porteur a réduit le
  nombre) revient à l'instance 1.

**Application** (`scripts/agents/pistes.sh`) : `lancer implementeur <k>` ; l'instance `k > 1` a
son nom, `implementeur-<k>`, pour son job launchd, son verrou, son arbre, ses sorties, ses
empreintes de dépendances, son arbre d'essai et sa colonne du journal. Le rôle — étiquette,
garde `check-pistes --role`, définition d'agent, `PISTES_ROLE` — reste `implementeur`.
`travail_disponible` ne lit que la part de l'instance ; le message de passage lui donne sa règle
(`Instance <k> sur <N>`, consigne dans `implementeur.md`) ; `verifier` refuse avant tout push un
ticket ajouté hors de sa classe de numéros. `planifier` pose un job par instance, et retire ceux
au-delà de `N` ; `deplanifier`, `etat` et la relance après fusion les comptent.

**L'instance 1 avec `N = 1` se comporte exactement comme avant** : mêmes chemins, même branche,
même message, mêmes appels. Vérifié dans un bac à sable (faux `gh`, `launchctl` et `claude`) par
un passage complet de l'ancien et du nouveau script, diffés, et par `planifier`, dont les plists
sont identiques octet pour octet.

**Ce qui n'est pas gardé** : la part des pistes n'est qu'une consigne et une liste filtrée. Rien
n'arrête avant le push une instance qui sortirait de sa part : deux PR peuvent alors porter la même
piste, et c'est à la relecture ou à la fusion qu'on le voit.

## Amendement du 2026-10-21 (ter) — le superviseur

**Constat**, le 2026-10-21 au soir : chaque défaut de la chaîne a été vu par la session du porteur,
jamais par la chaîne elle-même.
- PECL a rendu des 504 : l'image de #916 était rouge, et rien ne relançait le job.
- 16 processus orphelins tournaient encore, et le dossier des agents pesait 23 Go (#918).
- À 20:51, `planifier` s'est arrêté au deuxième job sur un `Bootstrap failed: 5` de launchd : quatre
  jobs gardaient leur ancienne cadence, sans autre signe que cette ligne.

Le porteur veut faire tourner les agents la nuit. Personne ne regarde alors.

**Décision du porteur** :

1. **Un cinquième rôle planifié, `superviseur`** (`.agent/agents/pistes/superviseur.md`), toutes les
   **2 h** (6ᵉ argument de `planifier`, 120 par défaut). Il relève l'état en douze points :
   - pauses, jobs launchd et leur cadence ;
   - journal, erreurs, refus de la garde ;
   - CI de `pre-dev`, PR d'agents ;
   - verrous, processus, disque, charge, dépense.

   Il écrit un rapport à chaque passage, puis corrige ce qui relève de lui. Budget 10 USD,
   durée 60 min. Contrairement aux autres rôles, il part **sous une charge forte**, qui est ce
   qu'il doit voir.
2. **Il agit sur l'état des agents par `pistes.sh action`, et par rien d'autre.** Les verbes :
   - `reposer` : recharge un job à la cadence de son plist, jamais à une autre ;
   - `balayer` : processus d'un rôle **sans passage en cours** ;
   - `purger` ;
   - `pause` et `reprendre`, par rôle (`PAUSE-<rôle>`) ou pour tout : il ne lève que **ses**
     pauses, dont le fichier commence par `superviseur`. Une pause du porteur l'arrête lui aussi ;
   - `relancer-ci` : une fois par run, seulement pour `pre-dev` ou une branche `agents/*` ;
   - `notifier`.

   Chaque verbe vérifie ses bornes lui-même, écrit une ligne `superviseur action` au journal et,
   quand il change quelque chose, prévient le porteur par une notification macOS.
3. **Le code passe par une PR, comme pour tout agent.**
   - `pre-dev` rouge pour une cause du dépôt : sa PR est fusionnée par le fusionneur quand sa CI
     est verte.
   - Un correctif des **outils des agents** (les chemins de la garde : `.agent/`, `.claude/`,
     `scripts/agents/`, `scripts/check-pistes.mjs`, `.github/`, ADR-0066) : il peut l'écrire dans
     son arbre, mais **le fusionneur ne fusionne jamais une PR du superviseur qui touche ces
     chemins**. Rien ne réinstalle les outils à la place du porteur, et le superviseur met en pause
     le rôle concerné en attendant.
4. **La garde**, outre ces droits :
   - lui ouvre `launchctl list|print` ;
   - lui refuse `kill` et `gh run rerun` en direct, qui passent par les verbes ;
   - lui refuse `pistes.sh action` par un autre chemin que l'outil installé, et le fichier de
     pistes, que `pistes.sh` refuse aussi au push.

   Pour **tous** les rôles, elle refuse désormais :
   - les sous-commandes de pilotage de `pistes.sh` (`installer`, `planifier`, `pause`, `lancer`…) ;
   - l'écriture shell dans l'état des agents (outils installés, `config.env`, pauses, verrous,
     `~/Library/LaunchAgents`). Jusqu'ici, une redirection shell y atteignait.
5. **Ce qui lui reste interdit** :
   - changer une cadence, un plafond, un budget ou `config.env` (V9) ;
   - tuer un passage en cours ;
   - écrire le fichier de pistes ;
   - promouvoir, ou toucher à la préproduction ou aux secrets (V5) ;
   - trancher V1, V2, V3, V5 ou V9 ;
   - réinstaller ou replanifier.

**Ce qui change dans le risque** : c'est le premier agent qui agit sur la chaîne plutôt que sur le
dépôt. Ses actions sont donc des verbes fermés, vérifiés par l'outil installé, qu'il ne peut pas
modifier, et toutes réversibles :
- un job se repose ;
- une pause se lève ;
- un processus balayé appartenait à un passage déjà fini.

La garde lit le texte d'une commande. Un script écrit puis exécuté la traverse, comme pour tout
rôle (§ 5). La consigne porte ce que la garde ne voit pas, et le rapport en garde la trace.

## Amendement du 2026-10-21 (quater) — des tests ciblés seulement, un angle entier par lot

**Relevé à 21:39**, deux implémenteurs, l'explorateur et le délégué en route : charge de 11 à 14
sur 8 cœurs, juste sous le seuil de 12. Le mesureur et le délégué s'arrêtaient en `charge` un
passage sur deux. Les tests lancés étaient bien ciblés, mais rien ne l'imposait, et chaque lot
finissait par `impacted-tests --run --parallel` : quatre processus, sur une sélection plus large
que les pistes du lot.

**Décision du porteur** :

1. **Des tests ciblés seulement.** Un agent ne lance que les classes et fichiers de test de ses
   pistes, nommés. Ni suite entière, ni `--parallel`, ni `impacted-tests --run`, ni couverture :
   la CI de la PR joue tout le reste sur GitHub. **Ceci remplace le troisième amendement du
   2026-10-17** (`impacted-tests` une fois par lot). La garde le tient, pour tous les rôles et en
   position de commande :
   - `artisan test`, `phpunit`, `pest` ou `paratest` sans fichier de test, sans classe et sans
     `--filter` ;
   - `--parallel`, `-p` ou `--coverage` ;
   - `bin/impacted-tests.php --run` ;
   - `npm run test` ou `vitest` sans fichier de test.

   Éprouvé par un banc de 27 commandes, où l'ancienne garde laisse passer 13 refus. Le lint du
   front se joue sur les fichiers touchés ; `tsc --noEmit` reste, une fois par lot.
2. **Un angle entier par lot.** L'implémenteur prend toutes les entrées libres de l'angle de la
   première entrée, quel que soit leur nombre ou leur taille. Il ne complète par famille, dans la
   limite de 10 entrées et de l'équivalent de 10 S, que si l'angle en laisse la place.
   `check-pistes` ne compte plus les entrées d'un lot d'un seul angle. Ablation sur le fichier
   réel (angle 6, 14 entrées) :

   | Lot | Nouvelle règle | Ancienne règle |
   |---|---|---|
   | 11 entrées d'un seul angle | acceptées | refusées |
   | 10 entrées + 1 d'un autre angle | refusées | refusées |

   Au relevé, l'angle ouvert le plus gros compte 7 entrées. La règle des 100 min et le passage tué
   à 150 min bornent toujours le lot : ce qui n'est pas commencé reste libre pour le passage
   suivant. La partition entre implémenteurs (amendement bis) se fait déjà par angle, donc un angle
   entier ne déborde jamais sur l'autre instance.

## Amendement du 2026-10-22 — trier un rouge avant de le réparer

**Relevé du 2026-10-22, journée entière** : 57 réparations pour 154 PR publiées, soit 29 USD. Une
bonne part visaient un rouge qui n'était pas celui de la PR réparée :

- **`pre-dev` rouge de 09:32 à 12:40.**
  - TCK-1251 et TCK-1247 étaient vertes chacune, mais rouges avec TCK-1252, fusionnée juste avant.
  - Pendant trois heures, toutes les PR ont rougi sur les deux mêmes tests d'invitation, et chaque
    implémenteur les « réparait » de son côté.
  - Le correctif aa10613e0 est arrivé sur `pre-dev` à 12:40:50. Les runs rouges avaient tous démarré
    avant : relancés, ils rejouaient la ref de fusion calculée à leur déclenchement, donc sans lui.
- **Deux tests intermittents** :
  - le pied de page du PDF, un rendu sur vingt selon la minute imprimée (#1116) ;
  - `MinimalProfileTriggerProvider`, 2 runs sur 53.
- **Trois PR abandonnées** après trois réparations (#1079, #1089, #1095). Deux réparations ont
  récrit un correctif déjà fusionné, d'où un conflit (#1079, #1096).
- **Personne ne voyait `pre-dev` rouge.** `api-ci` et `web-ci` ne tournaient pas à ses push : on le
  découvrait par les PR qui rougissaient.

**Décision du porteur (1a, 2a, 3a, 4a)** :

1. **Un rouge se trie, sans modèle, avant toute réparation** (`trier_rouge`). Il passe trois
   contrôles dans l'ordre, et seul le dernier coûte une réparation :
   1. **Base périmée.** Le run a démarré avant une fusion que la branche n'a pas : le script fusionne
      la base dans la branche par `merge-tree` et `commit-tree`, sans arbre, pousse, et la CI
      repart. Il le fait une fois par tête de branche, sauf pour une PR gelée.
   2. **Relance unique.** Une première tentative rouge voit ses jobs rouges relancés une fois. Ses
      tests sont gardés pour juger la relance.
   3. **Rouge confirmé.** Ses tests rejoignent le registre et la réparation part, comptée dans
      `REPARATIONS_MAX`.

   Le tri s'applique aussi à une PR abandonnée : une base rafraîchie ou une relance peut la sauver
   sans modèle.
2. **Un rouge commun ne se répare qu'une fois.** Un test est commun s'il rougit aussi sur une
   autre PR ouverte ou sur `pre-dev`, dans un fichier que la PR ne touche pas.
   - Si tous les tests rouges d'une PR sont communs, la PR est **gelée** : aucune réparation. Le
     superviseur est appelé hors de sa cadence, une fois par cause.
   - Si une partie seulement l'est, la réparation part, et son message nomme les tests communs à
     ne pas toucher.
   - Une fusion qui arrive ensuite sur la base rafraîchit la PR gelée.
3. **`pre-dev` est éprouvée à chaque push.** `api-ci` et `web-ci` y tournent, avec un run à la fois
   et le plus récent en attente (`concurrency`, `cancel-in-progress: false`). L'attestation par
   arbre (ADR-0063) saute la suite quand l'arbre fusionné est celui de la PR, déjà vert.
   - Le fusionneur lit le dernier verdict de chaque workflow (`evaluer_pre_dev`) et applique la même
     relance unique.
   - Un rouge confirmé suspend toutes les fusions, celles des implémenteurs comprises, sauf les PR
     du superviseur et la synchronisation de `dev`, les seules qui peuvent le réparer. Il appelle le
     superviseur et prévient le porteur par une notification.
   - Les fusions reprennent au premier verdict vert.
4. **Un test intermittent est noté, puis traité, jamais masqué.** Une relance qui finit verte inscrit
   ses tests dans `etat/intermittents.tsv` (`noter_intermittents`) et appelle le superviseur.
   - Le superviseur en cherche la cause et ouvre une PR de correctif, avec la preuve d'avant et
     d'après. Puis il marque le run traité (`action intermittent <run> "<suite>"`).
   - Quarantaine, `markTestSkipped`, `retry` et délai rallongé sans cause lui sont interdits.
   - **Écart à la proposition validée**, qui disait « le superviseur l'écrit en piste « à mesurer » ».
     Le fichier de pistes lui est fermé (amendement ter, § 4 et 5), et le lui ouvrir changerait une
     borne d'agent (V9). Un intermittent est de toute façon un défaut du dépôt, ce que le
     superviseur répare déjà.

**État** sous `~/.takussan-agents/etat/` :

| Fichier | Contenu |
|---|---|
| `rouges/<n° de PR>` et `rouges/pre-dev` | le registre : la tête, puis une ligne `<job>\t<test>` par test rouge |
| `rafraichi-<n°>`, `gele-<n°>` | la tête poussée par le dernier rafraîchissement ; la marque d'une PR gelée |
| `relance-auto-<run>`, `intermittent-attente-<run>` | la relance unique, et les tests à juger quand elle finit |
| `pre-dev-rouge` | présent tant que `pre-dev` est rouge |
| `rouges-communs.tsv` | les rouges communs relevés |
| `intermittents.tsv`, `intermittents-traites.tsv` | les tests intermittents notés, et ceux déjà traités |
| `tests/<run>-<tentative>` | le cache des tests rouges, lus une fois par tentative |

**Les tests rouges se lisent dans le journal du run** (`tests_rouges`, sur `gh run view --log-failed`) :
- PHPUnit : la liste des échecs et des erreurs, jamais celle des tests risqués ;
- Vitest : `FAIL <fichier>`, et l'erreur non gérée qui rougit un run dont tous les tests passent ;
- les `✗` des gardes ;
- `(sans test nommé)` pour un job rouge sans rien de tout cela.

**Éprouvé sur un banc** : faux `gh`, `launchctl` et `osascript`, un vrai dépôt git pour origine,
et les journaux réels de la journée. Le lecteur rend les tests attendus sur cinq journaux : PHPUnit
des invitations et du PDF, Vitest `FAIL`, erreur non gérée, garde du backlog. Douze scénarios
rendent chacun leur verdict :

| Scénarios | Verdict |
|---|---|
| run de 12:21, fusion de 12:40:50 | rafraîchie |
| même tête, run plus récent à sa 1ʳᵉ tentative | relancée |
| 2ᵉ tentative, rouge propre | réparation |
| les mêmes tests sur une autre PR, ou sur `pre-dev` | gelée, superviseur appelé |
| la PR touche le fichier du test | ce test lui reste propre |
| PR gelée, nouvelle fusion | rafraîchie à nouveau |
| `pre-dev` : 1ʳᵉ tentative rouge, relance en cours, rouge confirmé, vert | relance, rouge maintenu, appel et notification une seule fois, reprise |
| relance finie verte | intermittent noté |

Le banc a trouvé deux défauts, corrigés avant la PR :
- `read` fondait deux tabulations, et la conclusion vide d'un run en cours décalait la tentative :
  un `pre-dev` en cours de relance passait pour vert ;
- un rouge confirmé après relance ne prévenait pas le porteur.

**Ce qui n'est pas gardé** :
- La première PR rouge d'une cause commune n'a personne à qui se comparer : elle est réparée. Le run
  de `pre-dev` couvre ce cas dès qu'il rend son verdict, soit à peu près une durée de suite après la
  fusion fautive.
- Une réparation légitime attend désormais une relance, soit une durée de CI de plus.
- Une PR qui touche le fichier d'un test commun le garde pour elle, même quand elle ne l'a pas
  cassé.

## Amendement du 2026-10-22 (bis) — le superviseur ferme ses propres PR devenues redondantes

**Constat**, le 2026-10-22 :
- À 12:02 UTC, le superviseur ouvre #1097 pour réparer deux tests d'invitation rouges sur `pre-dev`.
- Le même correctif, aa10613e0, était déjà commité à 11:57 et entre sur `pre-dev` à 12:40 par #1077.
- #1097 devient redondante et en conflit. Le fusionneur la refuse ensuite à chaque tour, de 14:20 à
  21:55 (« conflit de fusion »).
- Le superviseur la voit redondante dès 14:06 et le redit à chaque passage. Mais aucun de ses verbes
  ne ferme une PR, et la garde refuse `gh pr close` à tous les rôles.
- Le porteur la remarque onze heures plus tard et la fait fermer.

**Décision du porteur** (1a) : un verbe de plus, `pistes.sh action fermer <num> "<raison>"`. Il ferme
la PR, supprime sa branche, laisse la raison en commentaire, journalise et prévient le porteur. Les
bornes sont vérifiées par l'outil installé :
- la PR est **ouverte**, vise `pre-dev`, et sa tête est une branche **`agents/superviseur/*`**. Le
  superviseur ne ferme que ses propres PR, jamais celles d'un autre rôle ni du porteur ;
- la raison compte 10 caractères au moins et dit pourquoi la PR n'a plus d'objet, par exemple le
  commit de `pre-dev` qui porte déjà le correctif.

La garde continue de refuser `gh pr close` en direct, et indique le verbe au superviseur.

**Ce qui change dans le risque** : fermer est réversible, car une PR fermée se rouvre et sa branche
se restaure depuis la PR. Le verbe ne touche ni le code de `pre-dev` ni le travail d'un autre rôle.
Le porteur reste prévenu par une notification.

## Amendement du 2026-10-24 — un rouge se lit sur les runs conclus, et ne reste pas sans maître

**Constat**, le 2026-10-24, sur #1469. Elle est restée rouge de 14:34 à 16:30 sur un seul test,
`DashboardQueryBudgetTest` (plafond du bailleur : 27 requêtes pour 26), sans que rien ne le vise :
- **14:47 — rafraîchie pour rien.** L'étape 1 du tri (« base périmée ») a fusionné `pre-dev` dans
  la branche, parce que le run rouge précédait une fusion dans `pre-dev`. Mais le rouge ne venait
  pas de `pre-dev`, et la CI est repartie pour 30 min.
- **15:14 — une réparation morte, comptée quand même.** La réparation 1/3 est morte sur « API
  Error: Can't reach the API server (ENOTFOUND) » : claude sorti en 1, `is_error: true`,
  `terminal_reason: "api_error"`, après 11 tours et 0,44 USD. Elle a pourtant été comptée dans
  `etat/reparations-<rôle>-<n°>`. Le même message apparaît dans deux autres sorties de la chaîne,
  le 2026-10-23 et le 2026-10-24.
- **15:21 — une réparation sans rouge à réparer.** Pour la réparation 2/3, la PR était en conflit,
  et le run rouge avait fini 14 s plus tôt. `gh pr checks` ne le rendait pas encore : le message
  portait « Checks rouges : » vide. L'agent a résolu le conflit et écrit « aucun check rouge à
  corriger ».
- **14:55 — le superviseur ne voit rien.** Il ne lit que les checks de la tête courante. À 14:55,
  la CI relancée par la fusion de 14:47 était « en cours », et son rapport disait « 3 PR
  mergeables sans rouge ». Un rouge propre à une PR n'était de toute façon pas de son ressort
  avant l'abandon, soit trois réparations.
- **Le test n'a jamais été joué avant la CI.** L'implémenteur n'a lancé que ses classes. Pourtant,
  la carte d'impact relie `app/Services/Dashboard/PortfolioMetrics.php` à `DashboardQueryBudgetTest`.
  Mais `impacted-tests --base=origin/pre-dev` rend « SUITE ENTIÈRE — fichier absent de la carte »
  dès qu'un fichier neuf est dans le diff, et un agent ne lance jamais la suite entière.

**Décision du porteur** :

1. **Une réparation porte le dernier run rouge conclu de sa branche.** Le message garde les checks
   rouges de la tête courante, et y ajoute le dernier run **conclu** rouge de chaque workflow de la
   branche, toutes têtes confondues, avec ses tests (`rouge_conclu`, `tests_rouges`). Il le dit en
   toutes lettres : « Dernier run rouge conclu de ta branche… », puis le run, sa tête et ses tests.
   - Quand la tête n'a aucun check rouge, le message dit pourquoi : CI en cours, ou PR en conflit.
     `commun.md` impose de lancer ces tests après le conflit, et interdit d'écrire « aucun rouge »
     sans les avoir lancés.
   - Si `gh` ne répond pas, le message le dit, et retombe sur le registre du tri
     (`etat/rouges/<n°>`).
2. **Une réparation morte sur une panne d'API ou de réseau ne compte pas** (`panne_d_api`). La
   détection est étroite. Il faut `is_error: true` dans `claude.json`, et l'un de ces deux cas :
   - un résultat qui commence par « API Error » ou qui nomme une panne de réseau (`ENOTFOUND`,
     `EAI_AGAIN`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, « Could not resolve host », « Can't
     reach the API server ») ;
   - aucun tour de travail (`num_turns` à 0).

   Le compteur est alors rendu, `REPARATIONS_MAX` fois au plus par PR
   (`etat/reparations-rendues-<rôle>-<n°>`) : une détection trop large ne fera jamais tourner une PR
   sans fin. Tout le reste compte : budget dépassé, durée atteinte, `claude.json` illisible ou
   absent, échec de l'agent.
3. **La base n'est rafraîchie qu'une fois par PR.** Ceci remplace « une fois par tête de branche »
   (amendement du 2026-10-22, § 1.1). La présence de `etat/rafraichi-<n°>` suffit, quel que soit
   le sha qu'il porte. La fois suivante, le rouge passe aux étapes 2 et 3. Une PR gelée se
   rafraîchit toujours à chaque fusion, comme avant : la cause de son rouge est ailleurs.
4. **Une PR rouge depuis plus de 2 h revient au superviseur.**
   - **L'âge** se compte depuis le premier run rouge conclu de la branche, toutes têtes confondues
     (`rouges_anciens`). Pour chaque workflow, la série de runs rouges qui se suivent sans vert
     entre eux donne son début. Une CI relancée par une fusion ne remet pas l'âge à zéro ; un
     verdict vert, si.
   - **Une PR en réparation n'est pas comptée** (`en_reparation`) : sa tête porte, après celle du
     dernier run rouge conclu, au moins un commit qui n'est pas une fusion (lu sur la première
     ligne parentale), et la CI de cette tête n'a pas conclu. Un rafraîchissement seul ne la
     protège pas.
   - **Le message du superviseur** porte la liste « PR rouges depuis plus de 2 h » : chaque PR,
     depuis quand, le dernier run rouge conclu et ses tests.
   - **Le fusionneur**, toutes les 10 min, le fait partir hors de sa cadence quand une PR franchit
     le seuil (`signaler_rouges_anciens`). L'appel passe par `appeler_superviseur`, une fois par
     clé `rouge-ancien-<n°>-<début>`, donc une fois par PR et par série rouge.
   - **Le superviseur répare la PR lui-même**, avec le même périmètre que ses réparations de
     `pre-dev`, mais **sur la branche de la PR**. Il part de sa tête, commite par-dessus et écrit
     son numéro dans `pr-reparee.txt`. `pistes.sh` (`reparation_du_superviseur`) vérifie alors cinq
     bornes avant de pousser en avance rapide, jamais forcée, puis commente la PR :
     - la PR figure dans la liste de ce passage ;
     - elle est ouverte, vise `pre-dev` et sa tête est une branche d'agent ;
     - la branche du superviseur descend de cette tête ;
     - elle ne porte aucun commit de fusion ;
     - son diff ne touche ni le fichier de pistes ni les outils des agents.

     Les gardes, l'index et Pint se jouent depuis la tête de la PR.
   - **S'il ne peut pas**, son rapport s'ouvre sur `ALERTE : #<n> rouge depuis <HH:MM> — …`, et il
     prévient le porteur.
5. **L'implémenteur lance aussi ce que la carte d'impact relie à ses fichiers connus.**
   `bin/impacted-tests.php` prend une option, `--connus`. Chaque fichier modifié y est jugé seul.
   Celui qui ferait escalader est écarté et nommé : fichier neuf absent de la carte, migration,
   config, harnais, chemin non reconnu. La sélection des autres est rendue. Le comportement par
   défaut de l'outil ne change pas.
   - `implementeur.md` l'impose une fois par lot, avant de publier, et avant de rendre une
     réparation. L'agent lance la commande affichée, sans `--run` (la garde le refuse toujours)
     et sans `--parallel`.
   - Ceci **complète** le § 1 de l'amendement quater du 2026-10-21 : aux tests des pistes s'ajoutent
     ceux que la carte relie aux fichiers du lot. Ce sont des fichiers de test nommés, que la garde
     accepte.

**Éprouvé** sur les données du jour, en lecture seule :
- **Le rouge conclu** de la branche de #1469 rend son API CI rouge : run 40106943842, tête
  `f38288b5`, rouge depuis 14:34, test `DashboardQueryBudgetTest::test_ac6_…@bailleur`. Pourtant,
  la CI de sa tête `450e334c` était en cours.
- **Le message de réparation**, rendu dans ce même état (tête en cours, conflit), nomme ce test.
  Le 2026-10-24 à 15:21, il portait une liste vide.
- **La liste des rouges anciens** rend #1469 (depuis 14:34) et #1478 (depuis 15:21) avec un seuil
  d'1 h, et rien avec celui de 2 h à 16:32. À 16:38, #1469 en sort : `450e334cb`, un commit qui
  n'est pas une fusion, suit la tête rouge `f38288b5`, et sa CI tourne. Entre `62e0d10a5` et
  `f38288b5`, deux rafraîchissements seuls, la première ligne parentale ne porte aucun commit
  hors fusion : ils n'auraient pas protégé la PR.
- **`panne_d_api`** reconnaît les trois sorties « ENOTFOUND » de la chaîne, et ce sont les seules
  sorties en erreur. Sur huit cas fabriqués, elle compte le budget dépassé, l'échec de l'agent, un
  `is_error` faux et un `claude.json` vide ou `null`. Elle rend `EAI_AGAIN`, « API Error: 529 » et
  le passage sans un seul tour.
- **`reparation_du_superviseur`**, sur un dépôt jetable : une réparation par-dessus la tête passe.
  Sont refusés : le fichier de pistes, les outils des agents, un commit de fusion, une branche qui
  ne descend pas de la tête, une PR hors liste et une PR fermée.
- **`impacted-tests --connus`**, sur un diff qui ajoute un fichier neuf dans `app/` et modifie
  `PortfolioMetrics.php` : trois fichiers écartés et nommés, 20 classes, dont
  `DashboardQueryBudgetTest`. Sans l'option, le même diff rend « SUITE ENTIÈRE ».

**État** sous `~/.takussan-agents/etat/`, en plus de celui du 2026-10-22 :

| Fichier | Contenu |
|---|---|
| `rafraichi-<n°>` | présent : la PR a eu son rafraîchissement (une fois par PR) |
| `reparations-rendues-<rôle>-<n°>` | les réparations rendues après une panne d'API ou de réseau |
| `appel-superviseur-rouge-ancien-<n°>-<début>` | l'appel hors cadence d'une série rouge, une fois |

**Ce qui ne change pas** :
- le tri du 2026-10-22, dans son ordre : base périmée, relance unique, rouge confirmé et rouge
  commun ;
- `REPARATIONS_MAX` et l'abandon qui suit ;
- les réparations de `pre-dev` et des rouges communs, qui passent avant celle d'une PR ;
- la garde : `impacted-tests --run`, la suite entière et `--parallel` restent refusés ;
- le superviseur ne fusionne rien, et ne touche ni au fichier de pistes ni, sur la branche d'une
  autre PR, aux outils des agents.

**Ce qui n'est pas gardé** :
- `rouge_conclu` lit les 50 derniers runs de la branche. Une série rouge plus longue sous-estime
  l'âge.
- Un workflow que la dernière tête ne déclenche plus (filtre de chemins) garde son dernier verdict
  rouge.
- Une réparation morte sur une panne qui ne dit pas son nom (un claude tué sans `claude.json`)
  compte toujours.
- `--connus` sélectionne beaucoup de classes pour une classe très partagée (un modèle) : la
  sélection est jouée telle quelle, sans plafond.

## Amendement du 2026-10-24 (bis) — l'archive des pistes closes

**Constat**, le 2026-10-24, sur `pre-dev` `0277a8163` :
- Le fichier de pistes pèse **4,9 Mo** (4 869 451 octets) pour **20 900 lignes** et **1 254
  entrées**.
- **101 entrées seulement sont vivantes** (`retenu · autonome` 9, `retenu · à valider` 76,
  `validé` 16, aucune `à mesurer`) : 0,30 Mo de contenu.
- **1 153 sont closes** : `fait` 1 129, dont 303 `fait · TCK-N — reste : …`, `caduc` 18, `refusé`
  6. Elles pèsent 4,17 Mo, et plus aucun agent ne les écrit.
- **2 202 commits ont touché le fichier en 7 jours** (`git log --since='7 days ago'`). Chaque
  essai de fusion, chaque conflit et chaque réparation porte sur le fichier entier, et GitHub n'en
  rend plus le diff.

**Décision du porteur** :

1. **Les entrées closes partent, telles quelles, dans une archive.**
   - Le statut `fait…` (avec ou sans reste), `caduc…` ou `refusé…` ferme une entrée.
   - Elle part dans `docs/plans/pistes-archive/angles-001-099.md`, `angles-100-199.md`,
     `angles-200-299.md`… : un fichier par centaine du numéro d'angle de sa Réf.
   - Chaque fichier d'archive porte un court en-tête (ce qu'il est, qui l'écrit, le renvoi à cet
     amendement). Pour chaque angle, il porte ensuite le titre `## Angle N — <titre>` repris du
     fichier vivant, sous lequel les entrées sont rangées par Réf, donc dans l'ordre du fichier.
   - Le fichier vivant garde son en-tête, le tableau des angles, chaque section d'angle (son titre,
     ses lignes d'introduction et son texte de fin, même vide d'entrées) et ses seules entrées non
     archivées. La garde exige une section pour tout angle `fait` du tableau, et l'explorateur
     écrit après la dernière section : les sections ne partent jamais.
   - **Le contenu d'une entrée** va de son titre `###` à sa dernière ligne de champ (`- …`), de suite
     indentée ou de ligne vide. Une ligne de texte en colonne 0 ouvre le texte de fin de la
     section, qui reste en place. Le 2026-10-24, deux sections en ont un : « Ce qui tient » à
     l'angle 4, « Angles voisins » à l'angle 10.
2. **Le déplacement est déterministe, sans modèle.**
   - `scripts/agents/archiver-pistes.mjs` déplace les entrées. Le déplacement lui-même est
     `deplacer()`, exporté par `scripts/check-pistes.mjs` avec son analyseur : la garde le rejoue.
   - **Une entrée ne part que close depuis 24 h sur `pre-dev`.** On prend le dernier commit de la
     première lignée parentale de HEAD antérieur à la fenêtre
     (`git rev-list -1 --first-parent --before=<maintenant − 24 h> HEAD`). L'entrée doit y être
     déjà close, **et son contenu déjà celui d'aujourd'hui**.
     - Une entrée touchée dans la fenêtre attend donc un jour de plus : un reste corrigé, une
       mesure du porteur. Ce qu'on écrit encore ne quitte pas le fichier qu'on édite.
     - La méthode coûte deux lectures de git, quel que soit le nombre d'entrées, au lieu d'un
       `git log -S` par entrée.
     - Mesuré le 2026-10-24, la condition sur le contenu n'a retenu aucune entrée de plus. Sur
       les 215 restées, 124 n'existaient pas 24 h plus tôt et 91 étaient alors ouvertes.
   - **Il est idempotent** : relancé sur l'arbre qu'il vient d'écrire, il ne trouve rien.
   - **`pistes.sh archiver`** le lance sous un verrou et vérifie le résultat avec
     `check-pistes --role archiveur --base origin/pre-dev`, dans sa version de `pre-dev`. Il pousse
     ensuite une branche `agents/archiveur/<horodatage>` et ouvre une PR vers `pre-dev`, étiquetée
     `agent:archiveur`. Le fusionneur la prend comme les autres : tête `agents/*`, étiquette
     `agent:*`, CI verte, essai de fusion vert.
   - **Le superviseur le lance une fois par jour**, au premier passage de la journée, avant son
     modèle (`archiver_du_jour`, marqueur `etat/archive-AAAA-MM-JJ`). Le marqueur ne se pose que
     sur un archivage fait : PR ouverte, rien à archiver, ou PR d'archivage encore ouverte. Un
     échec, une pause (`PAUSE` ou `PAUSE-archiveur`) ou un verrou tenu se retentent au passage
     suivant.
   - **Une seule PR d'archivage à la fois.** Une PR d'archivage en conflit ou rouge est fermée par
     le script, branche supprimée, puis regénérée depuis la base du jour : un déplacement
     déterministe n'a rien à réparer à la main.
   - Aucun agent modèle n'écrit l'archive.
3. **La garde** (`scripts/check-pistes.mjs`) lit le fichier vivant ET `docs/plans/pistes-archive/*.md`.
   - **En mode garde**, elle vérifie :
     - la Réf unique dans l'ensemble ;
     - toute Réf `PNN.MM` citée par une entrée vivante existe dans l'ensemble ;
     - l'archive ne garde que des entrées closes : une entrée vivante y est une erreur ;
     - chaque entrée archivée est dans le fichier de sa centaine ;
     - chaque section d'archive a sa section dans le fichier vivant ;
     - la forme de chaque entrée, archivée comprise.
   - **Une entrée close plus vieille que la fenêtre peut rester** dans le fichier vivant : ce n'est
     pas une erreur, l'archiveur passera.
   - **En mode rôle**, aucun rôle modèle ne touche l'archive. Le message nomme le fichier et dit
     comment rouvrir.
   - **Le rôle `archiveur`** ne touche que le fichier vivant et l'archive. Ce qu'il propose doit
     être **exactement** `deplacer()` rejoué depuis la base sur les seules entrées sorties du
     fichier vivant, au caractère près, et ces entrées doivent être closes à la base.
   - **Lisent l'ensemble** : `--report` (les comptes ne changent pas, une ligne dit la part de
     chaque côté), `--liste` (nomme le fichier d'archive devant la ligne), `--restes`,
     `--delegations`, et les désaveux du porteur qui retirent une catégorie au délégué.
   - **Les messages d'erreur nomment le fichier** d'une entrée archivée. Ceux du fichier vivant
     gardent leur forme `l. N`.
   - **Le contrôle « précision mot pour mot au passage à `fait` » ne change pas** : il joue avant
     l'archivage.
   - `scripts/agents/pistes.sh` passe l'archive à la garde partout où il en extrait une copie
     (`travail_disponible`, `releve`). Sans elle, une Réf citée qui y est rangée manquerait, la
     garde sortirait en 1, et ce doute lancerait le modèle à chaque passage.
   - La réparation d'une PR par le superviseur, et sa propre branche, refusent l'archive comme le
     fichier de pistes.
4. **Les consignes** (`.agent/agents/pistes/commun.md` et les cinq rôles) :
   - **chercher dans les deux**, avec
     `grep -rn … docs/plans/2026-10-15-pistes-d-amelioration.md docs/plans/pistes-archive/`. Cela
     vaut pour un doublon, une Réf citée, un précédent ou une décision du porteur ;
   - **écrire dans le seul fichier vivant** ;
   - **rouvrir une piste close**, c'est écrire une entrée neuve qui cite l'ancienne Réf.

   `scripts/check-app-key-base64.mjs` range l'archive avec le fichier de pistes parmi les
   récits qu'il ne lit pas. Sans cela, il rougit sur deux lignes archivées de l'angle 42, qui
   citent la commande fautive pour raconter le défaut. Les ADR qui citent le fichier comme source
   historique restent tels quels.
5. **Le premier archivage** est fait par la commande, pas à la main (voir « Éprouvé »).

**Éprouvé**, le 2026-10-24, sur `pre-dev` `0277a8163`. Premier archivage à 19 h 26, avec pour
référence des 24 h `aae5f2a23` :
- **938 entrées archivées**, de 185 angles : 1 812 847 octets dans `angles-001-099.md`, 1 497 089
  dans `angles-100-199.md`.
- **Le fichier vivant passe de 4 869 451 à 1 576 111 octets**, et de 20 900 à 7 074 lignes. Il
  garde 316 entrées : les 101 vivantes et 215 closes depuis moins de 24 h.
- **La comparaison indépendante** (opérations de chaînes, sans l'analyseur de la garde) :
  - 316 + 938 = 1 254 Réf, le même ensemble qu'avant ;
  - chaque bloc archivé apparaît une fois, octet pour octet, dans le fichier d'origine ;
  - le fichier d'origine moins ces blocs et leurs lignes vides est le fichier vivant, au
    caractère près.
- **Une seconde exécution ne déplace rien.**
- **Les sorties de la garde sont identiques avant et après** :
  - `--report` rend les mêmes comptes ;
  - `--restes` rend les mêmes 305 lignes ; `--liste` donne le même ensemble pour chaque statut.
    Seul l'ordre change : le fichier vivant d'abord, puis l'archive ;
  - `--angles-a-faire`, `--a-deleguer` et `--delegations` sont identiques à la ligne près.
- **Ablation** sur un clone jetable : 19 cas, tous au verdict attendu.
  - Rougissent :
    - en mode garde : un statut vivant dans l'archive, une Réf en double entre le fichier vivant
      et l'archive, la citation d'une Réf inexistante, un angle dans le mauvais fichier
      d'archive, une section d'archive sans section vivante ;
    - pour l'archiveur : un octet changé dans l'archive, une entrée archivée perdue, une entrée
      ouverte archivée, un autre fichier touché, un titre retouché dans le fichier vivant ;
    - l'archive touchée par chacun des quatre rôles modèles.
  - Restent verts : l'arbre archivé, la citation d'une Réf archivée, le déplacement réel,
    l'implémenteur qui ne touche que du code.
  - Un désaveu V7 écrit sur une entrée archivée retire bien V7 au délégué.
- **`pistes.sh archiver`**, rejoué contre un dépôt local avec `gh` simulé. Il ouvre la PR
  `[archiveur] 938 entrée(s) archivée(s)…`, sa garde de rôle est verte, et il journalise. Avec une
  PR d'archivage ouverte et fusionnable, il ne fait rien. Avec une PR en conflit, il la ferme et
  la regénère. Après la fusion, il rend « 0 entrée archivée ». Sous `PAUSE`, il ne fait rien, et
  `--a-blanc` ne pousse rien.

**Ce qui ne change pas** :
- le vocabulaire des statuts, et le format d'une entrée ;
- la précision du porteur, recopiée mot pour mot dans le ticket au passage à `fait`, et le reste
  qu'elle garde ;
- les rôles, leurs transitions et leurs plafonds ;
- les cadences : l'archiveur n'a pas de job launchd, il passe avec le superviseur.

**Ce qui n'est pas gardé** :
- **La garde ne vérifie pas la fenêtre des 24 h**, seulement que les entrées archivées étaient
  closes à la base. La fenêtre est tenue par l'archiveur.
- **Une PR d'agent ouverte avant un archivage, et qui touche une entrée archivée depuis**, entre
  en conflit « modifié / supprimé ». Aucun rôle ne modifie une entrée close, et l'archiveur
  n'archive qu'une entrée intouchée depuis 24 h : le cas demande une écriture du porteur sur une
  entrée close. Sa réparation ne peut écrire l'archive, et revient au porteur.
- **Une PR qui écrit une ligne `Mesure` à la fin d'une entrée vivante juste avant une entrée
  archivée** peut entrer en conflit textuel avec l'archivage, selon la façon dont `diff` aligne
  la ligne vide. La PR se répare alors comme tout conflit.
- **Les fichiers d'archive restent gros**, 1,5 à 1,8 Mo chacun. Ils ne changent qu'une fois par
  jour, et seulement par l'archiveur.
- **Sans dossier d'archive, la garde ne juge pas les Réf citées.** C'est le cas de la copie que
  l'ancien `pistes.sh` extrait pour lire une liste (`travail_disponible`), qui ne prend que le
  fichier vivant. Mesuré sur cette copie, la vérification rendait 136 erreurs : `--liste` sortait
  en 1, et ce doute aurait lancé le modèle à chaque passage de chaque rôle jusqu'à la
  réinstallation. Partout où l'archive existe (CI, arbre d'un agent, essai de fusion), la
  vérification joue.

**Mise en service** : le porteur fusionne vers `pre-dev`, puis réinstalle (`pistes.sh installer`).
La réinstallation crée l'étiquette `agent:archiveur`, sans laquelle `gh pr create` échoue, et pose
le `pistes.sh` qui passe l'archive à la garde et lance l'archivage. Avant elle, rien n'archive.

## Amendement du 2026-10-24 (ter) — une PR ne se répare qu'une fois à la fois

**Constat**, le 2026-10-24, sur #1491 :
- 19:29 — l'implémenteur part réparer #1491 ;
- 19:35 — le fusionneur appelle le superviseur, la PR étant rouge depuis plus de 2 h ;
- 19:38 — le superviseur pousse sa réparation, et la CI passe au vert ;
- l'implémenteur, lui, tourne encore à 20:49 avec un commit non poussé qui portait le même
  correctif. Son passage a été arrêté à la main, la PR étant fusionnée.

`en_reparation` (amendement précédent) ne protège qu'une réparation **poussée**. Une réparation en
cours ne se voyait pas.

**Décision** : chaque passage écrit dans son verrou, `verrous/<nom>/reparation`, les PR qu'il peut
réparer :
- l'implémenteur, la PR de son mode réparation ;
- le superviseur, la liste de ses rouges anciens.

Le fichier part avec le verrou. `reparation_vivante <n°>` le lit chez les autres passages dont le
pid vit encore. Une PR qu'un autre passage répare :
- ne compte pas parmi les rouges anciens : le fusionneur n'appelle pas le superviseur pour elle,
  et elle n'entre pas dans sa liste ;
- n'est ni triée ni réparée par l'implémenteur : elle compte parmi ses PR ouvertes ;
- est refusée à la réparation du superviseur si l'implémenteur l'a prise pendant son passage.

**Ce qui n'est pas gardé** :
- Deux passages qui choisissent la même PR à la même seconde.
- Pendant tout son passage (une heure au plus), le superviseur retient chacun de ses rouges
  anciens, y compris ceux qu'il finit par ne pas réparer.

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
