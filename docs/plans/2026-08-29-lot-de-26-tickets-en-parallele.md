# Lot de 26 tickets — plan d'exécution en parallèle

> Établi le **2026-08-29** sur `dev` à `5d49c1a8`. Périmètre demandé : TCK-349, 350, 351, 442, 443,
> 444, 445, 447, 449, 450, 451, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 465, 466, 467,
> 468, 469, 470 — **27 tickets, dont 26 planifiés et un écarté** (TCK-351, § *Écarté*).

---

## 1. Ce que la mesure a établi avant le découpage

Cinq contraintes gouvernent tout ce qui suit. Chacune porte sa commande.

### C1 — TCK-464 est `doing` alors que son code est sur `dev`

```
$ git log --oneline origin/dev -3
dbd1746c Merge pull request #237 from thiambara/feat/tck-464-publication-bien-parcours-guide
$ ls takussan-web/src/components/property-form/
field-matrix.ts  options.ts  payload.ts  PropertyForm.tsx  PropertyWizard.tsx  wizard/
```

TCK-469 et TCK-470 déclarent `depends_on: [TCK-464]`, et la règle 2 du `CLAUDE.md` dit qu'un ticket
ne démarre pas tant que ses dépendances ne sont pas `done`. **Le statut est en retard sur le code.**

→ **Étape 0 obligatoire** : vérifier TCK-464 ticket par critère, puis le passer à `done`. *Vérifié,
pas basculé en bloc* — c'est la seule façon de ne pas transformer un statut faux en un statut faux
dans l'autre sens.

Les trois autres dépendances du lot sont satisfaites : TCK-343 `done`, TCK-385 `done`,
TCK-426 `done`.

### C2 — L'isolation des tests est PAR PROCESSUS, des deux côtés

```
takussan-api/tests/bootstrap.php:27   TestSearchIndex::install();   # préfixe Meilisearch par PID
takussan-api/phpunit.xml:57-67        commentaire : « Le préfixe est désormais engendré par PROCESSUS »
                                       la base PostgreSQL l'est aussi (Tests\Support\TestDatabase)
```

**C'est ce qui autorise plusieurs agents backend simultanés.** Sans ça, le plan ci-dessous n'aurait
aucune vague parallèle côté API. Ce n'est PAS une déduction depuis la configuration : c'est le
mécanisme nommé, avec le motif de sa mise en place (deux exécutions simultanées se détruisaient —
10 puis 8 rouges sur des ensembles différents).

### C3 — Quatre tickets sont HOSTILES au parallélisme, et deux le sont par construction

| Ticket | Pourquoi il ne peut pas partager la machine |
|---|---|
| **TCK-451** | AC3 exige **cinq exécutions sous charge CPU soutenue** (64 brûleurs). Il ne subit pas la contention : il la **fabrique**. Tout ce qui tourne à côté rougit pour la mauvaise raison. |
| **TCK-349** | `EXPLAIN (ANALYZE, BUFFERS)` sur des tables gonflées à ~800 000 lignes. Un plan mesuré sous charge décrit la machine, pas la requête (cause 2 du `CLAUDE.md`). |
| **TCK-450** | AC4 : **captures de 3 écrans × 2 thèmes** — serveur de dev + navigateur. |
| **TCK-468** | AC3 : « aucune page dense ne gagne de défilement inattendu ; **vérifié au navigateur** ». |

Ajouter TCK-442, dont l'AC1 exige un `curl` **sur l'application réelle avec une session valide**.

→ Ces cinq mesures vont dans un **couloir exclusif, machine au repos**, tenu par la session
principale (une commande de plus de ~10 min n'est pas délégable : elle est coupée sans rien produire
et sans le dire).

### C4 — Cinq tickets exigent une DÉCISION que le code ne rend pas

Ce sont ceux dont le corps dit explicitement « ce ticket ne tranche pas ». Les déléguer sans la
décision, c'est déléguer l'arbitrage à un agent qui n'a pas le contexte.

| Ticket | Ce qu'il faut trancher |
|---|---|
| **TCK-350** | Où vit l'anti-renotification : `SearchService`, filtre du job, ou table de traçage. **L'option 3 exige un ADR.** Plus : le sort de `notification_frequency`, lue par personne. |
| **TCK-454** | La garde va-t-elle dans `AgencyRoleService::assign()` (tous les appelants, seeders compris) ou sur les deux contrôleurs ? Quels écrans mènent au 403 ? Quelle clé i18n ? |
| **TCK-455** | **Mesure préalable obligatoire** : que produit `POST /api/invitations` sur une agence `standard` ? Si `invitable_type` y est nul aussi, le ticket change de nature (défaut général, pas défaut du type d'agence). |
| **TCK-456** | Le sort de `scopeActive` : branché ou **supprimé**. |
| **TCK-460** | `--scrim` réemployé, ou un `--shadow-color` propre ? |

### C5 — Le vendor ne se partage pas entre worktrees

`project_worktree_vendor_symlink` : un lien symbolique `vendor` fait résoudre `__DIR__` vers l'arbre
principal — le vert porterait sur un autre arbre. Un worktree backend coûte donc un `composer
install` complet, un worktree frontend un `npm ci`.

→ **Arbre partagé, lanes disjointes par fichier, la session commite.** Onze worktrees pour ce lot
coûteraient plus que la contention qu'ils évitent, puisque les lanes ci-dessous sont construites
pour ne partager aucun fichier.

---

## 2. Le découpage : onze lanes, construites par disjonction de fichiers

Une **lane** = un agent, une suite de tickets exécutés dans l'ordre, dont l'ensemble des fichiers
touchés ne rencontre celui d'aucune autre lane de la même vague.

### Les trois couplages qui ont dicté le regroupement

Ce ne sont pas des affinités thématiques — ce sont des **fichiers partagés**, et les ignorer
produirait soit un conflit, soit deux corrections qui se défont.

1. **TCK-449 + 454 + 455 → une seule lane.** L'AC5 de TCK-449 exige que « la définition de *qui peut
   constituer une équipe* n'existe qu'à **un** endroit, partagé par l'invitation et le
   rattachement ». Trois agents produiraient trois définitions — c'est-à-dire exactement le défaut
   que TCK-456 décrit sur un autre mécanisme.
2. **TCK-456 + 457 → une seule lane.** TCK-456 le dit lui-même : « À traiter avec TCK-457, relevé
   dans la même revue et sur le même mécanisme. »
3. **TCK-470 → 469, dans cet ordre.** `payload.ts:3` importe `sanitizeByType` de `field-matrix.ts`.
   TCK-470 retype l'appel, TCK-469 change ce qu'il produit. Retyper d'abord donne à TCK-469 un
   compilateur qui l'aide au lieu de deux `as never` qui masquent.

### Lanes backend

| Lane | Tickets, dans l'ordre | Surface principale |
|---|---|---|
| **B1** — Frontière de l'agence | 449 → 454 → 455 | `AgencyController`, `AgencyMemberRoleController`, `AgencyRoleService`, services d'invitation, `lang/{fr,en,wo}` |
| **B2** — Délégations | 456 → 457 | `RoleDelegation`, `MembershipCapabilityResolver`, `MeCapabilityController`, `RoleDelegationCapabilityTest` |
| **B3** — Événements & maintenance | 443 → 445 | `AppServiceProvider`, `bootstrap/app.php`, `app/Listeners/**` · puis `MaintenanceRequest*` (policy + FormRequests) |
| **B4** — Recherche & alertes | 462 → 350 | `tests/Feature/Search/**` · puis `SendSavedSearchAlerts`, `SearchService` |

### Lanes frontend

| Lane | Tickets, dans l'ordre | Surface principale |
|---|---|---|
| **F1** — Contraste | 459 → 458 → 444 | `TCK-371` (texte) + garde `.dark` · `src/test/contraste-wcag.ts`, `ContractTypeChip` · `ProfileBadge`, `check-chart-contrast.mjs` |
| **F2** — Jetons CSS | 460 → 467 | `globals.css` (jeton d'ombre, puis `prefers-reduced-motion`), `PropertyCard{Standard,Listing}`, contrôle D |
| **F3** — Property-form | 470 → 469 | `payload.ts` puis `field-matrix.ts` |
| **F4** — Brouillon & vocabulaire | 465 → 466 | `useWizardDraft.ts` · `options.ts` + `scripts/check-enum-namespaces.mjs` |
| **F5** — Preuves de route | 461 → 442 | gardes dérivées (`Footer`, SEO) · les 9 pages de détail de `/app` + `etats-de-route.test.ts` |

### Lane documentation

| Lane | Ticket | Surface |
|---|---|---|
| **D1** | 447 | `docs/gen-features-by-actor.mjs`, `docs/features-by-actor.md` |

### Couloir exclusif (session principale, machine au repos)

| Slot | Ticket | Ce qu'il mesure |
|---|---|---|
| **X1** | 451 | 5 exécutions sous 64 brûleurs |
| **X2** | 450 | captures 3 écrans × 2 thèmes — **après F1** |
| **X3** | 468 | densité vérifiée au navigateur |
| **X4** | 349 | EXPLAIN sur tables gonflées — **après B2** |
| **X5** | *(fin de F5)* | le `curl` de l'AC1 de TCK-442, application réelle + session |

### Clôture

| Slot | Ticket | Pourquoi il est dernier |
|---|---|---|
| **Z1** | 453 | Son AC3 exige **une ligne de base de faux positifs mesurée sur tout `src/`**. Prise pendant que F1, F2, X2 et X3 changent des classes, elle serait périmée à l'instant où elle est écrite. |

---

## 3. L'ordonnancement

### Étape 0 — séquentielle, session principale

Rien ne se délègue tant que ces cinq points ne sont pas tranchés.

1. **Vérifier TCK-464 critère par critère, puis le passer à `done`** — sans quoi 469 et 470 sont
   bloqués par la règle 2 (C1).
2. **Mesurer `POST /api/invitations` sur une agence `standard`** — l'AC1 de TCK-455 l'exige *avant*
   toute correction, et le résultat peut changer la nature du ticket.
3. **Trancher TCK-350** (les trois options), **TCK-454** (les trois questions), **TCK-456**
   (`scopeActive`), **TCK-460** (jeton d'ombre). Écrire la décision **dans le ticket**, pas dans
   le prompt de l'agent : une décision qui ne vit que dans un prompt est perdue à la première
   relecture.
4. **Ouvrir l'ADR** si TCK-350 retient l'option 3 (table de traçage) — décision structurelle, donc
   ADR **avant** implémentation.
5. Créer la branche de vague depuis `dev`.

### Vague 1 — 6 agents simultanés

```
B1  449 → 454 → 455        F1  459 → 458 → 444
B2  456 → 457              F2  460 → 467
B3  443 → 445              F3  470 → 469
```

**3 agents backend, 3 agents frontend.** Le plafond backend est le chiffre qui compte : la suite
occupe 0,73 cœur sur 8, et les agents ne lancent que des tests filtrés. Trois est le nombre qui
laisse la machine répondre ; les trois agents frontend (vitest) sont peu coûteux.

### Vague 2 — 4 agents simultanés

```
B4  462 → 350              F4  465 → 466
                           F5  461 → 442 (sans son curl)
                           D1  447
```

Vague plus légère : un seul agent backend, et TCK-350 est le plus gros morceau du lot après la
décision de l'étape 0.

> **Vagues 1 et 2 peuvent fusionner en une vague de 10** si la machine est au repos et si le plafond
> « ≤ 4 agents backend simultanés » est tenu. C'est l'option agressive ; elle échange du temps
> d'horloge contre un risque de contention qui rendrait toute mesure prise pendant la vague
> illisible. **Aucun de ces dix tickets ne mesure de temps** — c'est ce qui rend la fusion
> défendable, et c'est aussi pourquoi X1-X4 en sont exclus.

### Couloir exclusif — séquentiel, un à la fois, machine au repos

```
X4  349   (après B2)
X2  450   (après F1)
X3  468
X5  442 — le curl
X1  451   (en dernier : c'est lui qui sature)
```

### Clôture

```
Z1  453   (ligne de base sur tout src/, après stabilisation)
```

Puis le **rituel de fin de branche** :

```bash
cd takussan-api  && ./vendor/bin/pint && php artisan test          # entière, UNE fois, au repos
XDEBUG_MODE=coverage php vendor/phpunit/phpunit/phpunit --coverage-clover=storage/coverage/clover.xml
php bin/coverage-gate.php storage/coverage/clover.xml --min=86
cd ../takussan-web && npm run lint && npx tsc --noEmit && npm run test
cd .. && for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check && node docs/gen-features-by-actor.mjs --check
```

---

## 4. Les collisions que le découpage ne supprime pas

Trois restent, et elles se gèrent par l'ordre, pas par l'isolation. Les nommer vaut mieux que
prétendre qu'elles n'existent pas.

| Où | Qui | Comment c'est tenu |
|---|---|---|
| `.github/workflows/repo-ci.yml` | F4 (466 : `check-enum-namespaces.mjs`) et Z1 (453) y ajoutent chacun une étape | Z1 est en clôture, donc après. Conflit textuel trivial, mais **la CI doit être rejouée après Z1** : deux étapes ajoutées séparément peuvent toutes deux être vertes et la seconde masquer que la première n'est pas branchée. |
| `docs/design-guidelines.md` | F2 (460, jeton d'ombre) et X2 (450, décision de charte) | X2 est dans le couloir exclusif, donc après F2. |
| `src/components/home/**` | F1 (458 dérive le périmètre du test de contraste de la chrome publique) et F5 (461 pose des gardes sur `Footer`) | Fichiers distincts, même répertoire. **F1 doit livrer son périmètre DÉRIVÉ (AC2) avant que 461 n'ajoute des composants** — sinon 461 pose une garde que 458 réécrira. → F1 est en vague 1, F5 en vague 2. |

Et une quatrième, moins visible : **TCK-457 peut conclure qu'il lui faut un index sur `agency_id`**
(ses Notes le disent). C'est exactement l'objet de TCK-349. → **X4 (349) après B2**, et TCK-349
absorbe l'index que TCK-457 aura justifié par `EXPLAIN`, au lieu d'en créer un second.

---

## 5. Ce qui est demandé à chaque agent — et ce qui ne l'est pas

### Ce que l'agent fait

- Il lit son ticket, et **il ne le reformule pas** : les AC de ce lot sont écrits pour qu'une
  régression ne puisse pas les cocher, et c'est leur formulation exacte qui porte cette propriété.
- Il lance **les tests de son périmètre** (`php artisan test <fichier>`, `npx vitest run <dossier>`),
  ou `php bin/impacted-tests.php --run` s'il ne sait pas quoi lancer.
- Il **prouve chaque test par ablation**, et **prouve que l'ablation a eu lieu avant d'en lire le
  résultat** — par `md5` du fichier, ou `git diff | md5`.

  > ⚠ Deux façons de se tromper ont été mesurées dans ce dépôt et sont rappelées par TCK-460 :
  > `git diff --numstat` ne distingue pas une substitution à nombre de lignes égal, et `grep -c`
  > peut rendre 0 si le shell réinterprète le motif. **Le hachage du contenu, rien d'autre.**

- Il lance `./vendor/bin/pint` s'il a touché du PHP.
- Il **n'écrit pas dans un fichier d'une autre lane**. S'il en a besoin, il s'arrête et le dit.

### Ce que l'agent ne fait JAMAIS

- **La suite entière.** C'est la session qui la lance, une fois, à la fin.
- **Une commande de plus de ~10 minutes.** Elle sera coupée sans rien produire et sans le dire —
  passage sous couverture, épreuve répétée, build long. Il les demande à la session.
- **Un commit, un push, un merge.** La session commite, un commit par ticket, message français
  préfixé du type conventionnel et citant l'id : `fix(api): … (TCK-449)`.
- **Basculer un ticket à `done`.** Le statut vaut pour ce qui est mergé sur `dev`.

### Ce que la session fait à chaque frontière de vague

`npm run lint`, `npx tsc --noEmit`, les tests des répertoires touchés, `./vendor/bin/pint`. Pas la
suite entière — celle-là est le rituel de fin de branche, et elle n'a de sens qu'au repos.

---

## 6. Écarté du lot : TCK-351

**Ce ticket n'est pas implémentable dans cette vague, et le forcer produirait le pire des deux
mondes.** Trois raisons, dans l'ordre de gravité :

1. **Ses 44 valeurs doivent être arbitrées une par une, et les 24 wolof exigent un locuteur.** C'est
   le même besoin que TCK-339 (`doing`, revue lexicale requise) et TCK-342. Le ticket le dit :
   « Ne pas choisir *celle de l'API* ou *celle du front* en bloc : `farm` montre que la bonne
   réponse change d'une clé à l'autre. »
2. **Son arbitrage préalable n'est pas un détail d'implémentation.** L'issue 1 est une **rupture de
   contrat sur une API publique** ; l'issue 2 **révoque le principe non négociable n°5**. Ni l'une
   ni l'autre ne se tranche dans un prompt d'agent.
3. **La dette ne croît pas pendant ce temps.** `property-labels.parity.test.ts` est déjà un cliquet
   à contenu nommé qui rougit **dans les deux sens** — une divergence nouvelle non inscrite comme
   une divergence résolue non retirée. Le coût de l'attente est borné, ce qui est rarement le cas.

**Recommandation** : le laisser `todo`, l'attacher explicitement à TCK-339 (`depends_on`), et le
reprendre quand le locuteur aura tranché le vocabulaire. Si l'on veut avancer sans locuteur, le seul
geste disponible est l'issue 3 réduite à sa garde — mais elle **existe déjà**, ce qui rend le
ticket sans contenu tant que les valeurs ne sont pas arbitrées.

---

## 7. Récapitulatif

| | Tickets | Compte |
|---|---|---|
| **Vague 1** (6 agents) | 449, 454, 455, 456, 457, 443, 445, 459, 458, 444, 460, 467, 470, 469 | 14 |
| **Vague 2** (4 agents) | 462, 350, 465, 466, 461, 442\* | 6 |
| | 447 | 1 |
| **Couloir exclusif** (séquentiel) | 349, 450, 468, 451 | 4 |
| **Clôture** | 453 | 1 |
| **Écarté** | 351 | 1 |
| | | **27** |

\* TCK-442 est codé en vague 2 ; seul son `curl` de l'AC1 passe au couloir exclusif (X5).

**Le chemin critique n'est pas la vague 1 — c'est le couloir exclusif.** Quatre mesures qui ne
peuvent pas se chevaucher, dont une (TCK-451) qui sature la machine par conception et une autre
(TCK-349) dont le résultat attendu est *« la plupart de ces 85 index ne méritent rien »*. Accélérer
les vagues parallèles ne raccourcit pas ce couloir ; **la seule chose qui le raccourcit est de
décider, à l'étape 0, si TCK-349 mérite d'être dans ce lot du tout** — son estimation est M, son
gain est incertain avant mesure, et il est le seul du lot dont le ticket dit lui-même que la
conclusion évidente est fausse.
