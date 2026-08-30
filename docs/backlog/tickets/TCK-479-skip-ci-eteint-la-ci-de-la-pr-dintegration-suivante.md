---
id: TCK-479
title: "Le `[skip ci]` de la carte d'impact éteint la CI de la PR d'intégration suivante — 7 fois sur 12"
status: doing
phase: P1
family: full
estimate: M
wave: 52
created: 2026-08-30
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [ci, deploiement, garde, dette, preview]
---

## Objectif utilisateur

Aucun directement. Ce qui est en jeu est la garde : une PR qui déploie doit être **vue** par la CI
du dépôt, ou dire clairement qu'elle ne l'a pas été.

## Le défaut, mesuré le 2026-08-30

`api-ci.yml` régénère `takussan-api/tests/impact-map.json` après chaque push sur `dev` et la
commite en `[skip ci]`. Ce marqueur est **nécessaire** et son commentaire le justifie bien : sans
lui, le push relance API CI, qui régénère, qui repousse — une boucle qui ne s'arrête pas seule.

Le raisonnement s'arrête au **push**. Il manque la suite : ce commit devient la **tête de `dev`**,
donc le `head` de la prochaine PR d'intégration `dev` → `preview`. GitHub applique `[skip ci]` au
**commit**, pour *tous* les événements qui le visent — `push` **et** `pull_request`. La PR
d'intégration, ouverte des heures ou des jours plus tard et sans aucun rapport avec la carte,
n'exécute donc **aucun** workflow du dépôt.

**Ce n'est pas un cas limite — c'est la majorité.** Sur les 12 dernières PR fusionnées vers
`preview` :

| PR | tête de `dev` au moment de la PR | contrôles GitHub Actions |
|---|---|---|
| #239 | `chore(tests): régénérer la carte d'impact [skip ci]` | **aucun** |
| #236 | idem | **aucun** |
| #234 | idem | **aucun** |
| #229 | idem | (idem) |
| #227 | `Merge pull request #226…` | **5** — Gardes documentaires, mapping, variables du build, Web, Vercel |
| #224 | `[skip ci]` | (idem) |
| #221 | `[skip ci]` | (idem) |
| #219 | `Merge pull request #218…` | — |
| #216 | `[skip ci]` | (idem) |
| #208, #152, #149 | commits ordinaires | — |

**7 sur 12.** Vérifié par exécution sur trois d'entre elles :

```
$ gh pr view 236 --json statusCheckRollup -q '[.statusCheckRollup[]|.name]|unique|join(", ")'
Vercel
$ gh pr view 234 …
Vercel
$ gh pr view 227 …      ← tête SANS [skip ci]
Gardes documentaires, Le mapping branche → environnement tient encore,
Variables du build front déclarées dans le dépôt, Vercel, Web (…)
```

## Pourquoi ça coûte

**Une PR sans contrôle ne ressemble pas à une PR sans contrôle.** #239 affichait
`mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, et **un** vert — celui de Vercel, qui n'est pas
GitHub Actions et ignore `[skip ci]`. Rien, nulle part, ne dit que les gardes n'ont pas tourné.
*Un vert unique sur une PR d'intégration ressemble exactement à une CI qui a tourné.*

Et cette PR-là **déploie** : `deploy-preview.yml` se déclenche sur `push` vers `preview` avec
`paths: takussan-api/**`, et sert `https://preview.api.takussan.com` — 5 exécutions réussies,
~1 min 20 chacune. Le seul environnement déployé de ce dépôt est donc alimenté par des PR que la
CI du dépôt n'a, sept fois sur douze, pas regardées.

⚠ **Le risque réel est resté faible jusqu'ici, et il faut le dire** : le commit parent de la tête
`[skip ci]` est un merge de PR, lui, contrôlé ; et le seul écart entre les deux est
`tests/impact-map.json`, un artefact dérivé qu'aucun code n'importe. **Ce qui est cassé n'est pas
le code livré, c'est la garde** — et une garde qui ne s'exerce pas ne prévient pas le jour où
l'écart cesse d'être bénin.

## Le marqueur se lit dans TOUT le message, corps compris — mesuré sur ce ticket même

Le premier commit de ce ticket n'a déclenché **aucun** workflow sur sa PR. Sa tête n'était pas
celle du bot : c'était le commit qui **décrit** le défaut, et qui citait `[skip ci]` trois fois
dans son corps pour l'expliquer.

```
$ git log -1 --format='%B' | grep -n 'skip ci'
7:Cause : `api-ci.yml` commite la carte d'impact en `[skip ci]` après chaque push
12:`head` de la prochaine PR d'intégration, et GitHub applique `[skip ci]` au
17:une tête `[skip ci]`. Vérifié par exécution, pas déduit du YAML :
$ gh run list --branch fix/tck-479-… → aucun run
```

GitHub ne lit pas seulement la **première ligne**, et ne distingue pas une **mention** d'une
**directive** : le marqueur est cherché dans le message entier, y compris à l'intérieur de
guillemets inverses. *Le commit qui documentait le mécanisme l'a déclenché sur lui-même.*

Deux conséquences pour ce ticket :

- **Le remède ne peut pas se contenter de filtrer le commit du bot par son auteur ou son titre.**
  N'importe quel message citant le marqueur produit le même effet, et une PR qui parle de CI en
  citera.
- **AC1 doit être éprouvé sur une PR réelle** (c'est déjà ce qu'il dit) : ici, la lecture du YAML
  aurait conclu que `docs/**` déclenche `repo-ci`, et elle aurait eu raison sur le YAML et tort
  sur le fait.

## Contraintes strictes (métier)

- ⚠ **Ne pas retirer `[skip ci]`.** Il empêche une boucle de régénération qui ne s'arrête pas
  seule, et son commentaire dans `api-ci.yml:404-407` le documente. Le remède doit garder cette
  propriété.
- ⚠ **`dev` n'est pas protégée** (relevé du fichier, 2026-08-17 :
  `gh api repos/thiambara/takussan/branches/dev/protection` → 404). Le step pousse en direct. Un
  remède qui suppose une protection de branche change autre chose que ce ticket.
- ⚠ **Le commentaire d'`api-ci.yml:453-461` a déjà identifié une conséquence du `[skip ci]`** —
  que `check-impact-map.mjs` de `repo-ci.yml` ne s'exerce jamais sur la carte — et l'a compensée
  en validant la carte **là où elle est produite**. La compensation couvre le **fichier**, pas la
  **tête de branche**. *Une atténuation juste peut laisser entier le second effet du même
  mécanisme ;* reprendre ce commentaire plutôt que le contredire.
- Le remède ne doit pas rendre la carte « aimant à conflits » : elle n'a qu'un écrivain, sur `dev`,
  et c'est délibéré.

## Pistes (à trancher dans le ticket, pas ici)

Trois directions, aucune évidente — c'est pourquoi ce ticket existe plutôt qu'un correctif :

1. **Déplacer la carte hors de l'historique de `dev`** — artefact de build (cache Actions,
   *release asset*) plutôt que fichier commité. Supprime la cause à la racine ; demande de revoir
   d'où `bin/impacted-tests.php` la lit.
2. **Réarmer à l'ouverture d'une PR** — un workflow `on: pull_request` qui, voyant une tête
   `[skip ci]`, relance explicitement les trois autres (`workflow_dispatch`, ou un job qui les
   appelle). Le plus petit changement ; ajoute une pièce mobile.
3. **Ne plus pousser sur la tête** — commiter la carte sur une branche dédiée, ou l'amender au
   merge. Évite la tête `[skip ci]` sans toucher aux workflows.

## Delta à produire

- [ ] Trancher entre les trois pistes, et **écrire pourquoi** — celle qu'on ne documente pas
      coûtera au prochain lecteur
- [ ] Appliquer, en conservant la propriété anti-boucle
- [ ] Rendre l'absence de contrôles **visible** dans tous les cas, même après correctif : une PR
      d'intégration sans run Actions doit le dire, pas se présenter `CLEAN`

## Critères d'acceptation

- [ ] AC1 — une PR `dev` → `preview` ouverte alors que la tête de `dev` porte `[skip ci]`
      exécute les workflows du dépôt. **Éprouvé sur une PR réelle**, pas sur une lecture de YAML :
      `gh pr view <n> --json statusCheckRollup` doit rendre plus que `Vercel`.
- [ ] AC2 — **témoin** : une PR dont la tête ne porte pas `[skip ci]` continue d'exécuter
      exactement ce qu'elle exécutait. Une garde qui déclenche tout, tout le temps, n'a rien
      réparé — elle a supprimé les `paths:`.
- [ ] AC3 — la boucle de régénération ne revient pas : après un push sur `dev`, `api-ci.yml` ne
      se relance pas en chaîne. Vérifié sur `gh run list`, pas déduit du YAML.
- [ ] AC4 — `php bin/impacted-tests.php --run` trouve toujours sa carte et rend le même
      résultat qu'avant sur un diff témoin.
- [ ] AC5 — le commentaire d'`api-ci.yml` est mis à jour : il porte aujourd'hui la moitié du
      raisonnement (le fichier), il doit porter l'autre (la tête de branche) ou dire que le
      mécanisme a disparu.

## Hors périmètre

- Protéger `dev`. C'est une décision de politique de branche, pas un correctif de CI, et le
  fichier dit déjà ce qu'elle impliquerait pour ce step.
- Les autres environnements. `master` n'est pas concernée : `deploy.yml` se déclenche sur `push`,
  pas sur PR.

## Notes d'implémentation

### La piste retenue : aucune des trois — le frein est DÉPLACÉ, pas supprimé

Les trois pistes du ticket partagent une prémisse — « le marqueur global doit rester, on va
composer avec » — et c'est elle qu'il fallait défaire. Le marqueur n'était pas le frein : il
était *un* frein, emprunté à GitHub, dont la portée (le commit, pour toujours, pour tous les
événements) dépasse de très loin ce qu'on lui demandait (ce push-ci, ce workflow-ci). Ce qu'on
demande est exprimable dans le dépôt.

`api-ci.yml` commite donc `[carte-impact]` — marqueur propre au dépôt, que GitHub ne connaît
pas — et deux conditions `if:` le lisent : une par job (elle évite de payer la suite entière
sur un commit qui ne change qu'un index) et une sur le step qui pousse (c'est elle, seule, qui
ferme réellement la boucle ; elle est délibérément redondante, pour tenir le jour où une
refonte casse la condition de job).

**Pourquoi pas les trois autres :**

1. *Sortir la carte de l'historique* (artefact de build) supprime la cause, et supprime aussi
   `php bin/impacted-tests.php --run` pour tout le monde : la carte est lue localement, et
   `CLAUDE.md` en fait **la** commande du quotidien. Un cache Actions n'est pas lisible depuis
   un poste. Le remède coûterait la boucle de retour qu'il protège.
2. *Réarmer à l'ouverture d'une PR* ne peut pas marcher sous la forme décrite : le workflow de
   réarmement serait lui-même `on: pull_request`, donc lui-même sauté par le marqueur qu'il
   existe pour rattraper. Il faudrait un déclencheur hors `push`/`pull_request` (`schedule`) —
   une pièce mobile, en retard sur la PR qu'elle doit couvrir.
3. *Ne plus pousser sur la tête* (branche dédiée, amend au merge) déplace le problème dans la
   plomberie git du bot — le cas le plus délicat à éprouver, sur `dev` non protégée, pour un
   gain identique.

### Ce que le changement ajoute, et qu'il faut savoir

Le push de la carte déclenche désormais **`repo-ci.yml`** (`push: branches: [dev]`,
`paths: takussan-api/tests/**`), qui était sauté jusqu'ici. Un workflow de plus par carte
poussée — celui qui la vérifie. Il ne pousse rien : il ne referme aucune boucle. Le
commentaire d'`api-ci.yml` qui disait « la carte est validée par celui qui la produit, et
c'est le SEUL moment où elle peut l'être » a été corrigé en conséquence (AC5) : c'est
désormais le **premier** moment, et l'appel local reste, parce qu'ici l'échec arrive AVANT le
push et appartient à celui qui l'a causé.

### La visibilité (3ᵉ point du delta) : `scripts/check-skip-ci-marker.mjs`

Deux contrôles, qui ne valent pas la même chose, et l'en-tête de la garde le dit :

- **Contrôle B** — le marqueur qu'`api-ci.yml` commite est bien celui que ses `if:` lisent,
  et aucun workflow ne commite le marqueur global. **Non tautologique**, il s'exerce en CI, et
  c'est lui qui garde le remède contre une divergence silencieuse des deux côtés.
- **Contrôle A** — la tête ne porte aucune des sept formes que GitHub reconnaît. **Vert par
  construction quand il tourne en CI** : le défaut supprime son propre détecteur, une tête
  marquée saute Repo CI aussi. Aucun événement `push` ni `pull_request` ne peut voir ce cas —
  le câbler ailleurs n'y changerait rien. Son point d'exécution utile est **avant le push** :
  le rituel `for g in scripts/check-*.mjs` de `CLAUDE.md`, et, avant d'ouvrir la PR
  d'intégration, `node scripts/check-skip-ci-marker.mjs --tete origin/dev`.

C'est le contrôle A qui couvre le cas que le ticket signale comme non réductible au bot :
n'importe quel message **citant** le marqueur, guillemets inverses compris. La garde regarde
le message, jamais l'auteur.

⚠ **Le titre de ce ticket contient la forme littérale.** Un message de commit qui le recopie
éteint la CI de sa propre PR — c'est exactement ce qui est arrivé au premier commit du ticket.
Le contrôle A l'attrape localement ; le renommer serait plus sûr encore.

### Éprouvé, et ce qui ne l'est pas

Ablations (le changement prouvé par `md5` avant lecture du résultat, garde restaurée ensuite) :
tête portant le marqueur — sur `1946e513`, un vrai commit de l'historique — condition de job
retirée, condition de step retirée, marqueur global remis dans le message, marqueur renommé
d'un seul côté, une des sept formes retirée (l'auto-épreuve jette) : **six rouges, six**.

**AC1 est NON ÉPROUVÉ, et il ne peut pas l'être sans pousser.** Après merge sur `dev`, il faut
attendre qu'`api-ci.yml` pousse une carte, puis :

```bash
git fetch origin dev
git log -1 --format='%an | %s' origin/dev       # attendu : github-actions[bot] | …[carte-impact]
node scripts/check-skip-ci-marker.mjs --tete origin/dev   # doit être VERT
gh pr create --base preview --head dev --title 'chore: intégration' --body '…'
gh pr view <n> --json statusCheckRollup -q '[.statusCheckRollup[]|.name]|unique|join(", ")'
# AC1 tenu si la sortie rend PLUS que « Vercel ».
```

**AC3 est NON ÉPROUVÉ** pour la même raison. Après le premier push du bot :

```bash
gh run list --workflow=api-ci.yml --branch dev --limit 5
# attendu : le run déclenché par le commit du bot existe et ses jobs sont « skipped » —
# pas de second run, pas de chaîne.
```

Relevé en ouvrant la PR #239 (`dev` → `preview`, 77 commits) et en constatant qu'elle n'affichait
qu'un seul contrôle. *Le défaut n'a pas été trouvé en lisant les workflows — il a été trouvé en
regardant ce qu'une PR affichait réellement, ce qu'aucune lecture de YAML n'aurait rendu.*

### Ce que la PR #242 a éprouvé, et ce qu'elle n'a pas éprouvé (2026-08-30)

**Le défaut est encore vivant sur `dev` au moment d'ouvrir le lot de la vague 53**, et la garde le
dit sans qu'on ait à le chercher :

```
$ git fetch origin dev && node scripts/check-skip-ci-marker.mjs --tete origin/dev
✗ contrôle A : le commit de tête porte le marqueur d'exclusion global de GitHub
  sujet : « chore(tests): régénérer la carte d'impact [skip ci] »   ← 1946e513
```

**La mesure du coût, elle, s'est révélée bien plus lourde que ce que le tableau des 12 PR
laissait voir.** En relevant les têtes des quatre dernières PR :

| PR | commit de tête | contrôles |
|---|---|---|
| #238 | `chore(backlog): les 25 tickets du lot passent à done…` | 8 |
| **#239** | **`chore(tests): régénérer la carte d'impact [skip ci]`** | **`Vercel` — 1** |
| #240 | `docs(backlog): une PR d'intégration sur deux…` | 3 |
| #241 | `merge: dev dans le lot de la vague 52…` | 8 |
| #242 | `merge: reprendre dev dans le lot de la vague 53…` | 8 |

**PR #239 portait 95 fichiers** — dont ~30 fichiers PHP applicatifs (contrôleurs, policies,
services, `MembershipCapabilityResolver`), 15 fichiers de tests, 4 scripts de garde, les deux
fichiers de workflow eux-mêmes — et elle a été **fusionnée vers `preview` sans qu'un seul test,
un seul lint ni une seule garde n'ait tourné.** Seul `Vercel` s'affichait, qui n'est pas un
workflow de ce dépôt et ne lit pas le marqueur.

⚠️ *Le ticket disait « 7 fois sur 12 ». Le chiffre est juste ; ce qu'il ne disait pas, c'est ce
qu'une seule de ces sept fois laisse passer.* Une PR muette n'est pas une PR moins vérifiée : sur
#239, c'est **toute** la vérification qui est absente, et son affichage `CLEAN` est indiscernable
d'un vert.

**Ce que la PR #242 NE prouve PAS.** Ses 8 contrôles montrent qu'une tête au message propre
déclenche la CI — ce qui n'a jamais été en doute. **AC1 au sens strict reste NON ÉPROUVÉ** : il
demande une tête portant le marqueur **neuf** (`[carte-impact]`), donc le correctif d'abord mergé
sur `dev`, puis un push du bot, puis une PR d'intégration. La séquence de vérification ci-dessus
tient inchangée. **AC3 reste NON ÉPROUVÉ** pour la même raison.
