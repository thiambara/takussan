---
id: TCK-305
title: "120 validations inline contre 65 FormRequest — deux conventions sur le même geste"
status: review
phase: P2
family: technique
estimate: L
wave: 39
created: 2026-08-16
updated: 2026-08-17
depends_on: [TCK-279]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, validation, convention, refactor, dette]
---

## Objectif utilisateur

Qu'une règle de validation se trouve toujours au même endroit — pour qu'une contrainte métier
puisse être revue, testée et modifiée sans avoir d'abord à chercher laquelle des deux conventions
l'endpoint a retenue.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16, dans `takussan-api/app/` :

- **120** appels à `$request->validate()` — validation inline dans le contrôleur.
- **65** classes sous `app/Http/Requests/` qui étendent un `FormRequest`.

`BaseFormRequest` et les patterns de validation existent depuis TCK-051 (`done`), et
`takussan-api/CLAUDE.md` tranche pour le code neuf. L'existant n'a jamais convergé.

> Chiffres re-mesurés le 2026-08-16. L'ardoise D-32 annonçait « 120 vs 69 » au 2026-08-12 : le
> premier compte est identique, le second diffère par la méthode de comptage (fichiers de
> `app/Http/Requests/` étendant `FormRequest`). L'ordre de grandeur tient.

## Contraintes strictes (métier)

- **La validation porte des règles métier, pas seulement de la forme.** Chaque migration inline →
  FormRequest doit préserver le comportement exact : mêmes règles, mêmes messages, mêmes codes de
  réponse. Un test qui passe avant et après ne suffit pas à le prouver si aucun test ne couvrait la
  règle — vérifier la couverture de chaque règle **avant** de la déplacer.
- L'autorisation ne se glisse pas dans le `authorize()` du FormRequest par commodité : la règle
  d'autorisation appartient aux policies (principes n°1 et n°2, et TCK-306).
- **Ne pas convertir 120 sites en un commit.** Découper par domaine, tests verts à chaque étape.
- Convergence sans garde = dette qui revient.

## Delta à produire

- [ ] Inventorier les 120 sites et les grouper par domaine
- [ ] Pour chaque site, vérifier qu'un test couvre les règles **avant** de les déplacer ; en écrire
      un si ce n'est pas le cas
- [ ] Converger domaine par domaine vers `BaseFormRequest`
- [ ] Garde CI : `$request->validate()` dans un contrôleur fait échouer le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — plus aucun `$request->validate()` dans `app/Http/Controllers/`
- [ ] AC2 — chaque règle déplacée est couverte par un test qui échouerait si la règle disparaissait
- [ ] AC3 — la suite backend reste verte, sans assertion assouplie
- [ ] AC4 — aucune règle d'autorisation n'a migré vers `authorize()` d'un FormRequest
- [ ] AC5 — réintroduire une validation inline fait échouer la CI

## Hors périmètre

- L'autorisation dans les contrôleurs — TCK-306.
- Les messages d'erreur traduits : l'API émet des codes, le front possède le texte (principe n°5).

## Notes d'implémentation

**Inventaire réel, mesuré le 2026-08-17** : **120** `$request->validate()` dans **58** contrôleurs —
les deux chiffres du ticket, à l'unité — pour **511 champs de règles**. Le compte de 65 FormRequest
était une méthode de comptage différente : `find app/Http/Requests -name '*.php'` en rendait **74**.

Une **121ᵉ** validation en ligne n'entrait dans aucun de ces comptes :
`ModerationQueueController::index()` écrivait `validator([...], [...])->validate()` sur un tableau
reconstruit à la main. Même défaut, autre orthographe — et c'était exactement l'échappatoire par
laquelle la garde aurait pu être contournée sans mentir. Elle interdit donc quatre formes.

**Ordre du travail, et il compte.** Les 30 sites sans aucun test 422 ont été couverts **d'abord**
(33 tests, commit séparé, joués verts sur le code d'avant, non-vacuité prouvée par 3 ablations),
puis le déplacement. Écrits après, ces tests n'auraient prouvé que la cohérence du code avec
lui-même.

**Preuve que rien n'a été perdu sur les 511 règles.** Un script confronte, pour chaque site, le
tableau de règles d'AVANT (lu par `git show HEAD:<contrôleur>`) au `rules()` d'APRÈS :
**114 sites comparés automatiquement, 114 identiques, 491 champs**. Les 6 restants ont été
restructurés à la main et relus (voir plus bas). C'est cette confrontation, et non la couleur de la
suite, qui couvre les règles qu'aucun test ne touche.

**Six sites restructurés à la main, et pourquoi :**

| Site | Motif |
|---|---|
| `AlertRuleController::validated()` | helper **privé** partagé, paramétré par `$partial`. Un FormRequest ne s'injecte que dans une action → une classe abstraite + `StoreAlertRuleRequest`/`UpdateAlertRuleRequest`. *Le drapeau booléen était déjà la forme dégradée de ces deux classes.* |
| `NotificationPreferenceController::update()` | seul site à porter **deux** `validate()` dans une méthode. La conditionnalité passe dans `rules()`. Effet de bord favorable : deux `validate()` successifs s'arrêtaient au premier échec, le 422 est désormais complet. |
| `AbstractOAuthController::callback()` | action sur une classe **abstraite** ; l'injection vaut pour les deux sous-classes routées. |
| `PublicPropertyController::visitRequest()` | règles dépendantes de `$request->user()` (visiteur anonyme vs authentifié). |
| `PublicPropertyController::bookingRequest()` | règles dépendantes du **bien** (TCK-176 : une vente attend une offre d'achat, pas des dates). |
| `ModerationQueueController::index()` | la 121ᵉ, en `validator(...)`. |

Pour les deux dernières actions publiques, `PublicPropertySlugRequest` **résout le bien elle-même**
et le contrôleur le relit par `$request->property()`. Sans cela, le `firstOrFail()` qui précédait la
validation aurait vu son 404 devenir un 422. La résolution est mémoïsée : il y a une requête de
**moins** qu'avant, pas une de plus.

### Trois classes de défauts que le déplacement introduit, et qui ne se voient pas à la compilation

1. **Les règles perdent le contexte du contrôleur — 7 cas sur 120.** `$this->allowedRoles()` (×2),
   `self::KYC_KIND_TO_TYPE` (×3), `self::ALLOWED_SPECIALIZATIONS`, `self::TASKABLE_TYPES` : toutes
   des `private const` ou des méthodes de contrôleur, devenues hors de portée. **Un seul** a été
   attrapé par un test ; les six autres l'ont été par un balayage systématique des jetons. Résolu en
   déplaçant chaque définition dans le FormRequest, le contrôleur la relisant par
   `XRequest::LA_CONSTANTE`.
2. **Un `$request` recopié dans les règles** — 1 cas, `StoreLeaseRequest` (`Rule::exists(...)
   ->where('property_id', $request->input(...))`). Mon premier balayage l'avait manqué : il
   excluait `$request` de la liste des variables « dynamiques ».
3. **Une action appelée en interne par une autre** — 1 cas, `PropertyVisitController::destroy()`
   déléguait à `cancel()` en lui passant son propre `Request` nu. `TypeError` à l'exécution. C'est
   le typage qui l'a signalé, pas le miroir de routes.

Après correction, un script instancie les **122** classes et évalue `rules()` : **120 sans aucune
levée**, les 2 autres levant `ModelNotFoundException` — le 404 attendu, hors contexte de route.

### Le 403 → 422 : arbitré, corrigé, et épinglé

La validation d'un FormRequest court **avant** le corps du contrôleur. **65 méthodes** autorisaient
d'abord ; elles se sont donc mises à rendre **422 au lieu de 403** pour un appel à la fois non
autorisé et mal formé. Hors contrat (« mêmes codes de réponse »), fuite d'information (noms de
champs, contraintes, énumérations livrés à qui n'a aucun droit) et rupture de contrat pour le front,
qui distingue « je n'ai pas le droit » de « ma saisie est mauvaise ».

**Corrigé** : l'autorisation passe dans `authorize()`, qui s'exécute avant la validation.

- **35 des 65 sont de simples DÉLÉGATIONS** — `$this->user()?->can('update', $this->route('x'))` —
  et la règle reste dans sa policy : **AC4 est tenu à la lettre**, aucune règle ne migre.
- **30 sont des REPRISES** : leur règle n'est pas encore dans une policy (ce sont les helpers
  relevés hors périmètre de TCK-306). L'expression est reproduite à l'identique, et les trois
  partagées entre classes sœurs vivent dans `Concerns\AuthorizesTransitionally`, un trait qui
  **annonce sa propre péremption** — le ticket de suite doit les convertir en délégations.

**Le vrai défaut n'était pas l'inversion : c'est que RIEN ne l'observait.** 163 fichiers de test
assertaient 403/401, tous verts, et pas un ne postait un corps invalide en même temps.
`tests/Feature/Validation/AuthorizationPrecedesValidationTest.php` épingle les quatre mécanismes —
18 tests, chaque refus doublé de son versant « autorisé → 422 » pour qu'un `authorize()` qui
refuserait tout le monde ne puisse pas le rendre vert. Non-vacuité prouvée par 4 ablations, toutes
rouges sur `Expected response status code [403] but received 422`.

### ⚠️ Le défaut que ce correctif a lui-même introduit, et ce qui l'a trouvé

La première passe retirait l'instruction d'autorisation par un `replace(count=1)` sur le **fichier
entier** : elle a donc retiré la **première occurrence du texte**, pas celle de la méthode visée.
**24 vérifications d'autorisation** ont ainsi disparu de méthodes que la table ne nommait pas —
`show()`, `confirm()`, `destroy()`, `publish()`, `activate()`… Le résultat n'était pas un 422 à la
place d'un 403 : c'était un **200**.

**Deux tests l'ont vu, sur 24.** Les 22 autres étaient des trous muets. Ce qui les a trouvés est un
script d'audit qui confronte, méthode par méthode, les instructions d'autorisation d'avant et
d'après, et refuse tout retrait dans une méthode absente de la table. Les contrôleurs ont été
ramenés à `HEAD` et le retrait rejoué **borné au corps de la méthode**. Second audit : **0
anomalie**.

*Sur un lot où l'erreur ouvre une porte, un test qui passe ne dit rien de ce qu'on n'a pas testé.
La preuve doit venir d'un inventaire, pas d'une couleur.*

### Ce qui reste inversé, et qui n'était pas demandé

**25 instructions dans 22 méthodes** rendaient **401, 404 ou 422** avant la validation et se
trouvent, elles aussi, après. Exemples : `abort_unless(Flag::tryFrom($key), 404)` sur les feature
flags, `abort_unless($payment->booking, 404)`, la 422 « OAuth provider is not configured ». Un slug
inconnu accompagné d'un corps fautif rend donc 422 au lieu de 404.

Non corrigé — l'arbitrage portait sur le 403. Relevé ici pour être décidé, pas oublié.
