# ADR-0066 — Trois agents planifiés traitent le fichier de pistes : l'explorateur relève, le mesureur re-mesure et classe, l'implémenteur corrige ce qui est classé autonome ; tout passe par une PR vers `pre-dev`, vérifiée avant le push par un script et non par l'agent

- **Statut** : Accepté (2026-10-15)
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
| `pistes-implementeur` | `--liste "validé"`, puis `--liste "retenu · autonome"` | un ticket, le code, ses tests ; `Statut` et `Mesure` | une piste (ou plusieurs de même cause) |

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
| `fait · TCK-NNN` | implémenteur | implémenté par ce ticket |

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
2. **État de sa PR** : un agent a au plus une PR ouverte vers `pre-dev`.
   - Si elle est en attente, le passage s'arrête.
   - Si elle est verte, elle est fusionnée seulement si le porteur l'a permis (§ « Décisions du
     porteur », Q1). C'est d'ordinaire le fusionneur qui l'a déjà fusionnée (Q1 ci-dessous).
   - Si elle est rouge ou en conflit, le passage la répare. Après trois réparations, il abandonne
     et le dit.
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
  - une PR du porteur vers `pre-dev` n'est jamais touchée.

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
