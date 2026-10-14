# ADR-0063 — Une suite verte s'atteste par l'arbre qu'elle a éprouvé, et un arbre déjà attesté ne se rejoue pas ; la carte d'impact se régénère la nuit

- **Statut** : Accepté
- **Date** : 2026-10-13
- **Tickets** : [TCK-636](../backlog/tickets/TCK-636-ci-attestation-par-arbre.md) ·
  suite : [TCK-637](../backlog/tickets/TCK-637-ci-parallele-couverture-decouplee.md) ·
  amendement §1 : [TCK-638](../backlog/tickets/TCK-638-ci-api-ignore-markdown.md)

## Contexte

Le 2026-10-13, le porteur : *« quand on finit une fonctionnalité dans une branche, ça peut prendre
jusqu'à des heures pour qu'elle soit disponible, à cause des CI — et la plupart, c'est la même
chose qu'on exécute sur la PR vers `dev`, puis après le merge, puis sur la PR vers `preview`. »*

Mesuré sur les dernières livraisons (TCK-633, TCK-635) :

| Étape | Durée | Ce qui tourne |
|---|---|---|
| PR → `dev` | 17 à 23 min | api-ci, web-ci, repo-ci, filtrés par chemins |
| push sur `dev` (le merge) | 19 à 24 min | les mêmes, sur l'arbre que la PR vient d'éprouver |
| PR `dev` → `preview` | 28 à 42 min | `promotion-ci` : les trois **sans filtre** (TCK-524) |
| `images.yml` sur `preview` | 4 à 5 min | construction, poussée, déploiement |

**La même suite, sur le même arbre, trois fois.** Une PR vers `dev` est éprouvée sur son commit de
fusion (`refs/pull/N/merge`) ; fusionnée par `--merge` sur un `dev` qui n'a pas bougé, elle donne à
`dev` **exactement cet arbre**. `preview` étant un ancêtre de `dev`, la promotion éprouve à son tour
le commit de fusion `preview` + `dev`, dont l'arbre est **celui de `dev`**. Rien n'a changé entre
les trois exécutions, sauf un fichier, et c'est le second constat.

**Le commit du bot invalide l'arbre.** Le push sur `dev` régénère `takussan-api/tests/impact-map.json`
et le repousse (`[carte-impact]`, TCK-479) : la tête de `dev` — donc la promotion — porte un arbre
qu'aucune suite n'a éprouvé. Ce fichier n'est pas inerte : `tests/Support/ImpactMap.php`,
`TranslationUsage.php` et `bin/impacted-tests.php` le lisent.

**Les `paths:` des workflows ne disent pas ce qu'une suite lit.** Mesuré le 2026-10-13 : deux tests
du front lisent des fichiers de l'API que les `paths` de web-ci ne couvrent pas —
`booking-quote.concordance.test.ts` (`takussan-api/tests/fixtures/booking-quote.json`) et
`Alerts.test.tsx` (`app/Domain/Alerts/AlertableEvents.php`). Dans l'autre sens,
`SearchWolofReviewSheetTest` lit `takussan-web/src/messages/wo.json`. Aujourd'hui ces trous sont
rattrapés par la promotion, qui rejoue tout sans filtre. **Une clé calquée sur les `paths` les
ferait disparaître en silence.**

## Décision

### 1. Une suite verte dépose une attestation nommée par l'arbre qu'elle a éprouvé

Les deux jobs lourds — `lint-and-test` d'api-ci, `quality` de web-ci — sont précédés d'un job
`attestation` (`scripts/ci-attestation.mjs`). Il calcule une **clé** : le SHA-256 de
`git ls-tree -r HEAD` restreint au **périmètre de lecture** de la suite, plus le fichier du workflow
et le script lui-même. Un `ls-tree` porte le hachage de chaque blob : deux arbres de même clé ont le
même contenu, octet pour octet, sur ce périmètre.

| Suite | Périmètre de la clé |
|---|---|
| API | `takussan-api/`, `takussan-web/src/messages/` (mesuré : seule lecture hors de son dossier), `api-ci.yml`, le script |
| Front | `takussan-web/`, **tout** `takussan-api/` (ses tests lisent l'API à plusieurs endroits, dont deux hors `paths`), `web-ci.yml`, le script |

**Amendement du 2026-10-13 (TCK-638) — la documentation qu'aucune suite ne lit sort de la clé ET du
déclencheur d'api-ci** : `HORS_CLE` = `takussan-api/*.md` et `takussan-api/docs/**`. Sans lui,
retoucher `takussan-api/CLAUDE.md` rejouait la suite backend entière (PR #372). Mesuré : aucun test
PHP ni vitest ne lit ces fichiers. ⚠ **Pas « tous les `.md` »** : `CourtierAbsentTest` lit tous les
fichiers d'`app/`, `config/`, `routes/` et `database/` quelle que soit l'extension, et une fixture
`.md` vit sous `tests/fixtures/` — ces `.md`-là restent dans la clé. `git ls-tree` refusant
`:(exclude)`, le filtre s'applique à sa sortie ; `check-ci-attestation.mjs` exige que les négations
`'!…'` d'`api-ci.yml` soient exactement `HORS_CLE`, et qu'aucun motif n'atteigne un dossier de code.

Quand la suite est verte, son **dernier step** dépose l'artefact `ci-vert-<suite>-<clé>`
(conservé 7 jours).

### 2. Un arbre déjà attesté ne rejoue pas la suite

Le job `attestation` cherche cet artefact (`GET /repos/…/actions/artifacts?name=…`). Il retient une
attestation **non expirée**, déposée par un run **de ce dépôt** (ni fork : `head_repository_id`
égal au dépôt) et d'un des trois workflows qui la produisent (`api-ci`, `web-ci`, `promotion-ci`).
S'il la trouve, le job lourd est **sauté par son `if:`**, et le résumé du run nomme le run qui a
attesté. Un job sauté par `if:` compte comme **réussi** pour un check requis (documentation GitHub) :
la protection de `preview` est satisfaite sans rejouer.

**Toute incertitude rejoue.** Une erreur réseau, un 403, une réponse illisible → `deja-vert=false`,
avec un avertissement. Le job lourd porte `!cancelled()` : un job `attestation` en échec le laisse
tourner au lieu de le sauter. *Le seul défaut que ce mécanisme ne doit jamais avoir est de sauter
une suite qu'il n'a pas vue verte.*

**Ce qui tourne toujours** : les images (~2 min, ce sont elles que `preview` déploie),
`migrations-pgsql` (36 s) et les gardes de repo-ci (34 s). Leur coût ne justifie pas un mécanisme.

### 3. La carte d'impact se régénère la nuit, plus à chaque push

api-ci gagne `schedule` (02:30 UTC) et `workflow_dispatch`. Le `cov.php` et le step « Régénérer la
carte d'impact » passent du `push` sur `dev` à ces deux événements, sur `dev` seulement. Un push sur
`dev` redevient une exécution ordinaire — **sautée** quand la PR fusionnée a déjà attesté son arbre.
La nuit, la suite ne se saute **jamais** par attestation (elle doit produire `cov.php`) ; elle se
saute si **aucun fichier de l'API n'a changé** depuis le dernier commit de carte.

L'anti-boucle `[carte-impact]` reste en place, aux deux endroits : le commit du bot déclenche
toujours un `push` sur `dev`. `dev` reste **non protégée** (le bot y pousse avec `GITHUB_TOKEN`).

**Coût accepté** : une promotion dont la tête est le commit de carte de la nuit, sans fusion
après lui, rejoue la suite de l'API en entier (l'arbre a changé d'un fichier que les tests lisent).
Exclure la carte de la clé l'éviterait, au prix d'une attestation fausse sur ce qu'elle a éprouvé.

### 4. `--parallel` en CI : plus tard, dans un ticket à part (TCK-637)

Le gain mesuré est ×2,48, mais une seule exécution porte tests **et** couverture, et PCOV agrège
mal entre processus. Le découplage est un chantier distinct ; il ne conditionne pas celui-ci.

## Conséquences

- **Le parcours attendu** : PR → `dev` complète (17-23 min) ; push sur `dev` en ~3 min (attestation,
  migrations, gardes) ; promotion en ~4 min (attestation, images, migrations, gardes). **À
  mesurer sur la première promotion qui l'emprunte**, et cette mesure tranche, pas ce tableau.
- Deux PR fusionnées à la suite : la seconde produit sur `dev` un arbre que ni l'une ni l'autre
  n'a éprouvé. Il n'a pas d'attestation, la suite tourne au push — c'est le cas où le push sur `dev`
  sert, et il reste servi.
- Une PR qui ne touche que l'API ne lance pas web-ci (filtre de chemins) ; l'arbre suivant n'a donc
  pas d'attestation du front, et la promotion rejoue le front. **C'est voulu** : c'est exactement
  ce qui rattrape les `paths` incomplets mesurés plus haut.
- **Garde** : `scripts/check-ci-attestation.mjs` tient la forme (job `attestation` en tête des deux
  workflows, `needs` + `!cancelled()` + sortie `deja-vert` sur le job lourd, dépôt de l'artefact au
  nom de la clé, `actions: read` accordé par `promotion-ci` à **chaque** appel — sans bloc
  `permissions`, le réglage du dépôt borne le jeton à `contents` et `packages`, et le run de
  promotion échoue au démarrage : mesuré sur #369, le 2026-10-13) et le périmètre de
  l'API : toute référence à `takussan-web/` dans le code de l'API doit tomber dans sa clé.

### Ce que l'attestation ne garde pas

- **Un collaborateur en écriture peut forger un artefact** — il peut aussi pousser. Le dépôt n'a
  qu'un porteur ; le filtre de dépôt écarte les forks, seul vecteur extérieur.
- **Un test qui dépend d'autre chose que l'arbre** — l'heure, une image de runner, un service
  externe — peut rougir sur une exécution que l'attestation a sautée. La validité de 7 jours borne
  cette dérive, sans l'annuler.
- **Une lecture hors périmètre qu'aucune garde ne voit** : un test du front qui lirait `docs/` ou
  `scripts/` à la racine échapperait à la clé. Relevé le 2026-10-13 : aucune lecture de ce genre,
  seulement des mentions en commentaire.
