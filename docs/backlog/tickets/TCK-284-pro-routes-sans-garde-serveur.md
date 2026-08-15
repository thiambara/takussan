---
id: TCK-284
title: "Quatre routes « pro » cadenassées sans garde serveur"
status: review
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-12
updated: 2026-08-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models: []
tags: [front, back, securite, autorisation, rbac]
---

## Objectif utilisateur

Qu'une fonctionnalité réservée aux agences `standard` le soit **réellement** — et pas seulement
visuellement, par un cadenas qu'une URL tapée à la main contourne.

## Contrat de données

Aucune donnée nouvelle. La règle existe déjà des deux côtés :

- **Front** — `takussan-web/src/lib/access/pro-features.ts` (`PRO_ROUTES`, `isProRouteLocked`) pose
  le cadenas dans la barre latérale ; `src/lib/access/server-guards.ts`
  (`ensureStandardAgencyOrRedirect`) redirige vers `/app` en SSR.
- **Back** — `takussan-api/app/Support/AgencyKindGuard.php` (`ensureStandardForNonGlobal`) rend un
  403. Son docblock se déclare lui-même « backend twin » du fichier TypeScript.

## Contraintes strictes (métier)

**Le constat, mesuré le 2026-08-12.** `pro-features.ts` affirme dans un commentaire que *« the
pages themselves redirect to `/app` server-side, which is the ultimate gate »*. C'est vrai pour
**5 routes sur 9** :

| Route | Garde serveur |
|---|---|
| `/admin` · `/admin/team` · `/admin/agency/billing` · `/admin/moderation/properties` · `/admin/audit` | ✅ `ensureStandardAgencyOrRedirect` |
| `/app/overview/kpis` · `/app/overview/alerts` · `/app/overview/agency` · `/app/owners` | ❌ **aucune** |

Pour ces quatre-là, le cadenas n'empêche que le **clic**. Une URL tapée à la main passe.

**Ce qui rend l'arbitrage non trivial, et pourquoi ce ticket n'a pas été « juste corrigé ».**
`ensureStandardAgencyOrRedirect` s'applique à **tout** utilisateur portant un `agency_id` dont
l'agence est `individual` — pas seulement aux `agency_admin`. Or `isProRouteLocked` ne cadenasse
que les `agency_admin` (`if (!user.roles.includes('agency_admin')) return false`).

**Les deux règles n'ont donc pas le même périmètre.** Poser la garde telle quelle sur les quatre
pages redirigerait aussi les **agents** et les **propriétaires** d'une agence `individual`, qui ne
voient aujourd'hui aucun cadenas et à qui rien n'a jamais été refusé. Ce serait une régression
fonctionnelle déguisée en correctif de sécurité.

**Mesure complémentaire du 2026-08-12 — elle change le diagnostic.** `AgencyKindGuard` n'est appelé
que dans **quatre contrôleurs**, et tous les quatre servent les routes `/admin/*` qui sont déjà
gardées côté front :

| Contrôleur | Route front correspondante |
|---|---|
| `AuditLogController`, `ActivityLogExportController` | `/admin/audit` |
| `UserAdminController` | `/admin/team` |
| `Admin/PropertyModerationController` | `/admin/moderation/properties` |

Les endpoints qui alimentent les quatre routes en défaut — `kpi-configs` (`KpiConfigController`),
`threshold-alerts` (`ThresholdAlertController`), `owners`, `dashboard/agency`
(`DashboardController`) — **ne portent aucun `AgencyKindGuard`**, ni aucun `authorizeAccess` /
`authorizeManage`.

**Donc ces quatre surfaces ne sont restreintes NULLE PART.** Ni sur la page, ni sur l'API. Le
cadenas de la barre latérale est la seule chose qui existe, et il ne bloque rien : il promet une
restriction qui n'a jamais été implémentée.

Cela réduit le ticket à **une** question, et elle est produit :

> **`/app/overview/kpis`, `/app/overview/alerts`, `/app/overview/agency` et `/app/owners`
> doivent-elles être réservées aux agences `standard` — oui ou non ?**

- **Si NON** — le cadenas est l'erreur. Le correctif est de **retirer ces quatre entrées de
  `PRO_ROUTES`** : une ligne, aucun changement d'autorisation, et la barre latérale cesse de mentir
  à ses utilisateurs.
- **Si OUI** — la restriction est à **créer**, pas à réparer : `ensureStandardAgencyOrRedirect` sur
  les quatre pages **et** `AgencyKindGuard` dans les quatre contrôleurs. C'est un retrait d'accès
  pour des utilisateurs qui en disposent aujourd'hui : à annoncer, pas à déployer en silence.

## Delta à produire

- [ ] Trancher le périmètre ci-dessus (produit).
- [ ] Selon l'arbitrage : soit ajouter `ensureStandardAgencyOrRedirect` aux quatre pages, soit
      introduire une variante scopée par rôle, soit retirer ces routes de `PRO_ROUTES` si le
      cadenas était l'erreur.
- [ ] ~~Vérifier que les **endpoints** qui les alimentent portent `AgencyKindGuard`~~ — **mesuré,
      ils ne le portent pas** (voir ci-dessous). Selon l'arbitrage : les y ajouter, ou constater
      qu'ils n'ont pas à l'être.
- [ ] Retirer les quatre entrées de `ECARTS_ASSUMES` dans `scripts/check-pro-routes.mjs`. **La
      garde échoue tant qu'une entrée y reste sans être justifiée, et échoue aussi si une entrée y
      reste alors que la route est devenue gardée** — l'allowlist ne peut pas pourrir en silence.
- [ ] Corriger le commentaire de `pro-features.ts` s'il reste inexact après l'arbitrage.

## Critères d'acceptation

- [ ] AC1 — `node scripts/check-pro-routes.mjs` passe avec `ECARTS_ASSUMES` **vide**.
- [ ] AC2 — pour chaque route de `PRO_ROUTES`, un test vérifie qu'un utilisateur d'agence
      `individual` **dans le périmètre tranché** est refusé, en accès direct par l'URL.
- [ ] AC3 — le même test vérifie qu'un utilisateur **hors périmètre** n'est PAS refusé : sans ce
      second cas, on ne saurait pas distinguer une garde juste d'une garde trop large.
- [ ] AC4 — l'endpoint d'API correspondant rend 403 pour le même acteur.

## Hors périmètre

- La convergence générale PHP ↔ TypeScript des règles d'autorisation (vecteurs de test partagés).
  C'est un chantier à part ; ce ticket ne traite que les quatre routes mesurées.

## ⛔ CORRECTION — la mesure était fausse, la décision a été annulée (2026-08-12, soir)

**Une revue de code a démonté le constat, et elle a eu raison.** Les quatre routes `/app/*`
**SONT gardées côté serveur**. Elles n'appellent simplement pas le helper : elles écrivent le test
**en ligne**, parce qu'elles résolvent déjà l'agence pour leur propre affichage.

| Page | Ligne |
|---|---|
| `app/overview/kpis/page.tsx` | 21 — `if (agency && agency.kind !== 'standard') redirect('/app')` |
| `app/overview/alerts/page.tsx` | 21 — idem |
| `app/overview/agency/page.tsx` | 35 — idem |
| `app/owners/page.tsx` | 47 — `if (agency.kind !== 'standard') redirect('/app')` |

**La garde `check-pro-routes.mjs` ne cherchait que la CHAÎNE `ensureStandardAgencyOrRedirect`.**
Elle a donc rendu un faux négatif — et pas un « je ne sais pas », un « non » — avec l'autorité
d'une mesure. *Une garde qui cherche un jeton ne mesure pas la propriété.* C'est exactement
l'anti-patron que le reste de ce chantier documente, commis par le chantier lui-même.

**Ce que le faux négatif a produit** : les quatre entrées ont été retirées de `PRO_ROUTES`, donc le
cadenas a disparu devant des pages qui redirigent réellement. Un `agency_admin` d'agence
`individual` voyait quatre entrées de menu sans cadenas ni explication, qui le renvoyaient
silencieusement au tableau de bord.

**Rétabli** : les quatre routes sont de retour dans `PRO_ROUTES`, la garde reconnaît les **deux**
formes, et une troisième règle lui interdit de conclure « nue » sur une page qu'elle ne comprend
pas — elle dit « relis à la main » plutôt que « il n'y en a pas ».

**Ce qui reste vrai du constat d'origine** : les endpoints d'API (`KpiConfigController`,
`ThresholdAlertController`, `owners`, `DashboardController`) ne portent effectivement **aucun**
`AgencyKindGuard`. La page redirige, l'API répond. Ce n'est pas une faille — la page est le seul
chemin d'accès normal — mais c'est une asymétrie avec les cinq routes `/admin/*`, gardées des deux
côtés. **Reste à trancher**, et ce ticket reste ouvert pour ça.

<details>
<summary>Décision d'origine, conservée — elle montre comment un faux négatif se propage</summary>

**Tranché : NON.** Ces quatre écrans ne sont pas réservés aux agences `standard`. **Le cadenas était
l'erreur**, pas la garde manquante.

C'est la mesure du backend qui a permis de trancher : la restriction n'existait **nulle part** — ni
page, ni API. Elle n'avait donc jamais été un comportement, seulement une promesse d'interface. La
créer aurait été **retirer un accès** à des utilisateurs qui en disposent depuis toujours ; la
retirer ne change rien pour personne.

**Appliqué :**

- les quatre entrées sont sorties de `PRO_ROUTES` (9 → 5) ;
- `ECARTS_ASSUMES` est **vide** dans `scripts/check-pro-routes.mjs` — la garde est stricte, et
  prouvée par mutation (une route neuve non gardée la fait rougir) ;
- le docblock de `pro-features.ts` et les trois commentaires d'`AppSidebar` qui affirmaient
  « Standard-only via PRO_ROUTES » disent désormais ce qui est vrai ;
- **aucun changement d'autorisation** : `ensureStandardAgencyOrRedirect` et `AgencyKindGuard` ne
  bougent pas, et les cinq routes `/admin/*` restent gardées des deux côtés.

**Vérifié** : 802 tests front verts, `tsc` propre, ESLint 0 erreur, `check-pro-routes` à 5/5.

</details>

## Notes d'implémentation

Trouvé le 2026-08-12 en écrivant `scripts/check-pro-routes.mjs`, qui existait précisément pour
vérifier si le commentaire de `pro-features.ts` disait vrai. Il ne le disait pas.

*Une propriété proclamée dans un commentaire et prouvée par aucun test* — et ici, la forme la plus
tenace : **une règle rendue à deux endroits et tenue à un seul**.

## Reste sur dev

_Mesuré le 2026-08-12, après trois passes de revue._

**Ce qui EST livré** — la partie frontend, entièrement :

- les 9 routes de `PRO_ROUTES` sont gardées côté serveur **et fail-closed** : les quatre `/app/*`
  par un test en ligne, les cinq `/admin/*` par `ensureStandardAgencyOrRedirect` ;
- le helper partagé **et** un sixième site hors de toute liste (`app/overview/page.tsx`) sont
  passés fail-closed — `fetchAgency` avalant son erreur en `null`, un `if (agency && …)` laissait
  s'afficher l'écran réservé dès que l'API toussait ;
- `scripts/check-pro-routes.mjs` reconnaît les deux formes de garde, **suit dans le helper**,
  refuse la forme fail-open, et refuse de conclure sur une page qu'il ne comprend pas.

**Ce qui RESTE, et c'est un arbitrage produit** : les endpoints d'API qui alimentent ces quatre
écrans — `KpiConfigController`, `ThresholdAlertController`, `owners`, `DashboardController` — ne
portent **aucun `AgencyKindGuard`**, alors que les cinq routes `/admin/*` sont gardées des deux
côtés. La page redirige, l'API répond.

Ce n'est pas une faille : la page est le seul chemin d'accès normal, et l'appel direct exige un
jeton valide de l'agence concernée. C'est une **asymétrie** entre deux familles de surfaces
« pro », et elle mérite d'être tranchée plutôt que subie.

> Ce ticket reste `doing` **et non `done`** parce que cette question est ouverte. Il reste ouvert
> **et non `todo`** parce que tout le travail frontend est livré et mergé.

## ⛔ SECONDE CORRECTION — le constat backend était faux sur un quart (2026-08-15)

Tout ce qui précède énumère quatre endpoints « sans aucun `AgencyKindGuard` ». **Trois seulement
l'étaient.**

`/api/dashboard/agency` porte une garde `kind` **écrite en ligne** depuis le 2026-05-12
(commit `5d40dd31`) — `abort_unless($agency->kind === AgencyKind::Standard, 403, …)` — avec un test
qui prouve le 403 (`DashboardAgencyTest::test_individual_agency_admin_receives_403`). Le constat
du 2026-08-12 était donc **déjà faux quand il a été écrit**.

Deux erreurs, et la seconde est la première répétée un étage plus bas :

1. **Le contrôleur nommé n'est pas celui qui sert la route.** Ce ticket, l'ardoise et le message
   vert de `check-pro-routes.mjs` écrivaient tous les trois `DashboardController@agency` ;
   `routes/api/dashboard.php` pointe sur **`DashboardAgencyController`**.
2. **La mesure cherchait la CHAÎNE `AgencyKindGuard`, pas la propriété « cet endpoint refuse-t-il
   une agence `individual` ? »** C'est *exactement* le faux négatif par recherche de jeton que la
   première correction de ce ticket documente sur quarante lignes, commis une seconde fois, sur le
   backend cette fois. *Une leçon tirée sur une couche ne se transporte pas toute seule à la
   couche d'en dessous.*

## ✅ Arbitrage produit — tranché le 2026-08-15

**Les quatre écrans ne relèvent pas de la même réponse**, et c'est ce qui rendait la question
insoluble tant qu'on la posait en bloc.

| Écran | Réservé aux agences `standard` ? | Fondement |
|---|---|---|
| `/app/overview/agency` | **OUI** | `docs/features.md` §1.12 restreint nommément le « reporting cross-équipe », et §2.5 P1 nomme cet écran « Dashboard agence ». Déjà appliqué des deux côtés. |
| `/app/owners` | **OUI** | TCK-256 **confirmé** : dans une agence `individual`, le propriétaire est le créateur du compte lui-même — un carnet d'autres bailleurs n'a pas d'objet. |
| `/app/overview/kpis` · `/app/overview/alerts` | **NON** | Aucune spec, aucun ticket ne les restreint. §1.12 donne une liste **fermée** + une clause résiduelle (« toutes les autres capacités restent disponibles ») ; §2.5 P3 les liste sans qualification de `kind`. Le cadenas était l'ajout. |

## Delta produit — 2026-08-15

**Back — la donnée est fermée, pas seulement l'écran.**

- `OwnerProfileController::index` appelle `AgencyKindGuard::ensureStandardForNonGlobal`, **après**
  `viewAny` : le périmètre de la garde est donc exactement celui de la policy — `agency_admin` et
  `agent` de l'agence — et n'atteint aucun autre rôle. C'est ce que le ticket craignait en
  suspendant le correctif : poser le helper en tête aurait aussi répondu « réservé aux agences
  standard » à des acteurs qui n'avaient de toute façon pas le droit de lire.
- `tests/Feature/Api/OwnerProfileListingTest.php` — cette surface n'avait **aucun** test. Cinq
  cas : les deux refus (`agency_admin`, `agent` d'une agence `individual`), et les trois
  non-refus qui prouvent que la garde n'est pas trop large (`standard` admin, `standard` agent,
  super-admin sur une agence `individual`).
- Le commentaire de `DashboardAgencyController` citait `features.md §2.2` (« Rôles & permissions »,
  qui ne dit rien du `kind`) : corrigé en §1.12.

**Front — le cadenas dit désormais la même chose que les portes.**

- `PRO_ROUTES` passe de 9 à **7** : `/app/overview/kpis` et `/app/overview/alerts` en sortent, et
  leurs pages perdent leur `redirect` sur `agency.kind`.
- `isProRouteLocked` couvre les `agent` en plus des `agency_admin`. Ce n'est **pas** un
  élargissement de restriction : « Vue agence » était déjà poussée aux agents par `buildNavItems`,
  déjà refusée par la page et déjà 403 côté API. Un agent d'agence `individual` cliquait une entrée
  d'apparence normale pour se faire renvoyer sans explication. *Une porte fermée sans panneau se
  lit comme une panne.*
- `src/lib/access/__tests__/pro-features.test.ts` — premier test de ce module, qui avait pourtant
  changé quatre fois en trois mois.
- Le docblock de `owners/page.tsx` annonçait `OwnerProfilePolicy@invite` en défense en profondeur :
  vrai de l'invitation, **faux de la lecture**, qui est le seul appel de cette page.

**Spec — la contradiction est levée.** `docs/features.md` §1.12 nomme désormais la restriction
« propriétaires ». C'est la source de l'impasse : TCK-256 avait décidé et livré une restriction que
la spec, avec sa liste fermée et sa clause résiduelle, **niait explicitement**. Une règle tenue par
le code et démentie par la spec finit toujours par être retirée par quelqu'un qui lit la spec.

**Garde CI.** Le message vert de `check-pro-routes.mjs` affirmait, à chaque exécution, que les
endpoints derrière `/app/*` n'avaient aucune garde `kind` — un fait qu'il ne mesure pas et qui était
faux. Il annonce désormais sa **portée** (« pages Next seulement ») au lieu d'un état de l'API.

## Reste ouvert

- `KpiConfigController` et `ThresholdAlertController` n'ont toujours aucune garde `kind` — et c'est
  désormais **correct** : la spec ne les restreint pas.
- `/api/kpi-configs/metrics` (le catalogue) n'a aucun contrôle au-delà d'`auth:sanctum` : tout
  utilisateur authentifié le lit. Sans rapport avec le `kind` — à ouvrir en ticket propre.
- `docs/models-spec.md` répète la liste fermée de §1.12 sans la restriction « propriétaires ».
  Convergence à faire par `/sync-specs`.
