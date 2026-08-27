---
id: TCK-426
title: "Les replis de /app effacent 404, 307 et 308 : un refus d'autorisation rend désormais 200 et le squelette de la page interdite"
status: doing
phase: P3
family: front
estimate: M
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-382]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, dashboard, http, observabilite]
---

## Contexte

TCK-382 a posé 37 `loading.tsx` sous `/app` pour rendre l'attente visible. Une frontière de
suspension fait partir la coque **et le code de réponse** avant que la page n'ait rien décidé :
tout ce que la page ferait ensuite au niveau HTTP est perdu.

Mesuré le 2026-08-27, Next 16.3.1, sondes jetables sous `next dev`, par ablation du seul
`loading.tsx` :

| Ce que la page appelle | sans repli | avec un repli (même segment **ou** ancêtre) |
|---|---|---|
| `notFound()` | **404** | **200**, l'écran introuvable est rendu quand même |
| `redirect('/x')` | **307** + `Location` | **200** + la coque ; la redirection passe par le flux RSC |

L'écran final reste juste dans les deux cas — c'est le statut seul qui change. `curl`, lui,
s'arrête sur le squelette.

**L'échange est TOTAL, pas segmentaire, et il touche l'AUTORISATION.** `app/loading.tsx` est
l'ancêtre de tout `/app` : les 36 autres replis ne changent rien à la question du statut. Sont
concernés **32 appels de `redirect()`/`permanentRedirect()` sur 15 pages** (relevé sur la source
débarrassée de ses commentaires, 2026-08-27) :

```
7  overview/page.tsx           5  owners/page.tsx              4  settings/agency/upgrade/page.tsx
3  maintenance/providers       2  overview/agency              2  properties/[id]
1  crm · customers · customers/[id] · overview/{agent,alerts,exports,kpis,owner} · properties
```

La grande majorité sont des **refus d'autorisation**, et trois pages font même une redirection
d'**authentification en page** (`owners:36`, `maintenance/providers:34`,
`settings/agency/upgrade:34`) — le cas que la justification de TCK-382 déclarait couvert par le
layout.

Et le changement observable dépasse le statut : un utilisateur sans le droit reçoit désormais
**200 + `AppShell` + le squelette de la route interdite**, puis rebondit côté client. Aucun
contenu ne fuit (le squelette ne porte aucune donnée) mais l'écran ment une fraction de seconde,
là où il y avait un renvoi serveur immédiat. `crm/page.tsx` perd son 308 — celui dont le
commentaire dit qu'il existe pour que les liens en favori résolvent encore.

L'échange a été **assumé** dans TCK-382 pour trois raisons mesurées : `(dashboard)/layout.tsx`
pose `robots: { index: false }` sur tout `/app`, l'espace est derrière l'authentification, et la
garde d'authentification DU GROUPE vit dans le layout — donc **au-dessus** de toute frontière
posée par TCK-382 (vérifié : `GET /app` non authentifié rend toujours 307, donc une visite en
favori depuis un navigateur déconnecté fonctionne encore).

⚠ **Rien ne garde ces statuts, ni avant ni après** : il n'existe aucune suite e2e dans ce dépôt
(`npm run test` = vitest/jsdom). Les deux relevés ci-dessus ont été pris à la main sur sondes
jetables.

⚠ Deux constats qui relèvent l'intérêt du ticket :

1. **Le défaut préexistait, non mesuré.** `app/properties/loading.tsx` existait avant TCK-382 et
   se trouve exactement au-dessus du seul `notFound()` que `/app` portait alors
   (`properties/[id]`, l. 43). Le 404 de cette page était déjà un 200 et personne ne l'avait vu.
2. **Le patron ne doit pas franchir la frontière du public.** TCK-335 a supprimé
   `properties/[slug]/loading.tsx` pour rendre un vrai 404 à l'indexation ;
   `(public)/properties/[slug]/__tests__/pas-de-frontiere-de-suspension.test.ts` le garde.

## Re-mesure et décision (2026-08-27)

### 1. Les chiffres du corps tiennent tous

Recomptés avant d'écrire une ligne, script confrontant l'arbre à lui-même, source débarrassée de
ses commentaires : **37 `loading.tsx`** sous `/app` (dont `app/loading.tsx` à la racine),
**32 `redirect()`/`permanentRedirect()` sur 15 pages**, répartition identique à la ligne près.
Rien à corriger. Le relevé ajoute ce que le corps ne donnait pas : **9 `notFound()` sur 8 pages de
détail**, toutes couvertes par leur propre repli — et non le seul `properties/[id]` de la note.

**21 pages de `/app` décident d'un statut. Les 21 sont couvertes par un repli.** Une seule
(`/app/crm`) l'est par le repli RACINE seul — c'est-à-dire que le geste « `app/(accueil)` », que
ce ticket présentait comme rendant leur statut « à `crm` et à toute page sans repli propre »,
n'en libère **qu'une**. La seconde moitié de la phrase désigne l'ensemble vide.

### 2. Le mécanisme, mesuré — huit formes, pas deux

Sondes jetables sous `next dev` (Next 16.3.1, port 3999, `curl -w '%{http_code}'`), pages nues
hors `(dashboard)`, supprimées après mesure :

| ce qui décide | repli en portée | statut |
|---|---|---|
| page `notFound()` | aucun | **404** |
| page `notFound()` | même segment | **200** |
| page `notFound()` | segment **ancêtre** | **200** |
| page `redirect()` | aucun | **307** + `Location` |
| page `redirect()` | même segment | **200** |
| page `redirect()` **synchrone** (non `async`) | même segment | **200** |
| page `permanentRedirect()` | aucun / avec repli | **308** / **200** |
| **`layout.tsx`** `redirect()` | repli **du même segment** | **307**, *et le repli couvre toujours la page* |
| **`layout.tsx`** `redirect()` | repli **ancêtre** | **200** |

D'où la règle, qui n'était écrite nulle part :

> **Un statut survit si et seulement s'il est décidé STRICTEMENT AU-DESSUS de toute frontière de
> suspension de son chemin.** Un `layout.tsx` est au-dessus du `loading.tsx` de SON segment, et
> en dessous de celui de tous ses ancêtres.

Deux conséquences que le ticket ne pouvait pas avoir :

- **Le remède qu'il proposait — le groupe de routes — n'est pas le bon.** Il coûte un remaniement
  de répertoires et, ici, ne libère qu'une page.
- **Le remède qu'il n'esquissait qu'en passant — remonter la décision dans le `layout.tsx` du
  segment — est mesuré, et il ne coûte AUCUN squelette** : ligne 8 du tableau, le repli continue
  de couvrir la page (TTFB 0,063 s sur une page qui dort 2 s) pendant que le `redirect()` du
  layout rend un vrai 307. C'est le remède à retenir. Il ne s'applique **pas** aux six vues de
  `overview/*` tant que le repli est chez leur parent (ligne 9).
- Et il n'existe **aucune** échappatoire par la synchronicité : une page non-`async` perd son
  statut exactement comme une page `async`.

### 3. Ce qui est FAIT dans ce ticket — les 23 refus d'autorisation, mesurés en vrai

**Le tableau du § 1 sous-comptait, et la re-mesure l'a montré.** Les « 32 appels sur 15 pages » ne
comptent que les `redirect()` LITTÉRAUX d'un `page.tsx`. **Neuf refus de plus** sont délégués à
`assertCanReachAgentArea` / `assertCanReachAgencyStaffArea` (`src/lib/auth/guards.ts`) — ils
s'exécutent depuis la page, donc sous la frontière, exactement comme les autres, et ils n'apparaissent
dans aucun relevé du ticket : `calendar`, `crm/pipeline`, `customers/new`, `properties/new`,
`leases/onboarding-pending`, plus `customers`, `customers/[id]`, `properties`, `properties/[id]`.
*Un inventaire qui compte une écriture ne compte pas une population.*

#### Les gestes

1. **`app/page.tsx` + `app/loading.tsx` → `app/(accueil)/`.** Plus d'ancêtre universel sur `/app`.
   Coût mesuré : une seule page perdait ce repli, `/app/crm`, qui ne rend aucun document.
2. **`overview/loading.tsx` descend dans les SEPT vues.** L'aiguilleur par rôle `overview/page.tsx`
   — 7 des 32 `redirect()`, la page que tout utilisateur traverse — sort de la portée du repli.
3. **`leases/` et `maintenance/` : page de liste + repli dans un groupe `(liste)`.** Voir le § 3 bis,
   c'est la mesure de bout en bout qui l'a exigé.
4. **QUATORZE `layout.tsx` de garde**, un par segment qui refuse : `owners`, `maintenance/providers`,
   `settings/agency/upgrade`, `customers` (couvre aussi `new` et `[id]`), `properties` (idem),
   `calendar`, `crm/pipeline`, `leases/onboarding-pending`, et les six vues d'`overview`. **23 refus
   remontés.** Aucun appel d'API de plus : `getMeAction` et `resolveAgencyOrNull` sont mémoïsés par
   requête.

#### La vérification de bout en bout, sur l'application réelle

API Laravel servie sur `127.0.0.1:8002` contre le PostgreSQL du dépôt, front en `next dev -p 3999`,
jeton Sanctum d'un `service_provider` réel du jeu de données (`provider1@dakarimmo.sn`,
`roles: ['service_provider']`) déposé dans le cookie `auth_token` :

```
/app/owners /app/customers /app/customers/new /app/customers/12 /app/properties
/app/properties/new /app/properties/12 /app/calendar /app/crm/pipeline
/app/maintenance/providers /app/leases/onboarding-pending /app/settings/agency/upgrade
                                                     → 307 → /app          (12/12)
/app/overview/{agent,kpis,alerts,exports,owner,agency} → 307 → /app/overview ( 6/6 )
```

**18 refus sur 18 rendent un vrai 307 avec son `Location`.** Contrôles positifs, tous verts :
un `agent` obtient 200 sur les neuf surfaces qui lui reviennent, un `agency_admin` 200 sur `owners`,
`overview/agency`, `settings/agency/upgrade`, `overview/kpis` ; `/app/crm` rend **308** vers
`/app/customers` ; `/app/overview` rend **307** vers `/app/overview/agent` ; non authentifié, `/app`
et `/app/owners` rendent 307 vers `/auth/login`.

**Et aucun squelette n'est perdu** : `data-testid="route-skeleton"` est présent dans le HTML servi
de `/app`, `/app/customers`, `/app/leases`, `/app/maintenance`, `/app/overview/agent`, `/app/owners`.

### 3 bis. Le trou que seule la mesure a trouvé

Quatorze layouts corrects, **deux au mauvais étage.** `maintenance/loading.tsx` et
`leases/loading.tsx` étaient les ANCÊTRES de `maintenance/providers/layout.tsx` et
`leases/onboarding-pending/layout.tsx` — et un repli d'ancêtre efface le statut d'un layout
descendant aussi sûrement que celui d'une page (ligne 9 du tableau du § 2). Sur le premier passage
de sondes en vrai, dix-sept routes rendaient 307 et `/app/maintenance/providers` rendait **200**.

Rien dans la relecture ne le montrait : les deux layouts étaient justes, au bon endroit *dans leur
segment*. C'est l'étage au-dessus qui n'allait pas. Les deux replis sont descendus dans un groupe
`(liste)` avec la page de liste qu'ils servaient, et une règle de `etats-de-route.test.ts` refuse
désormais tout layout de refus posé sous un repli d'ancêtre.

> *Une règle vraie appliquée au bon fichier peut rester fausse d'un étage, et aucune relecture ne
> le dit — seule une requête le dit.*

### 3 ter. Ce que les gardes ont appris

Trois gardes du dépôt raisonnaient « la protection est dans la page ». Elles sont passées au rouge,
et **elles avaient raison de parler, tort de conclure** :

- `scripts/check-pro-routes.mjs` annonçait `/app/owners` « ne porte aucune garde reconnaissable » au
  moment exact où sa garde devenait plus forte. Il lit désormais la page ET ses `layout.tsx`
  d'ancêtres — le même raisonnement que son suivi dans le helper. Son détecteur de *fail-open* est
  passé fichier par fichier : sur une concaténation, la fenêtre « entre `getToken()` et la décision »
  enjambait la frontière entre deux fichiers et fabriquait un faux positif parfait.
- `scripts/check-auth-interrupts.mjs` : neuf entrées de `REFUS_ARTISANAL` ont changé de fichier,
  aucune de nature. `PLAFOND_MESURE` reste à 22.
- `takussan-web/scripts/check-i18n-namespaces.mjs` exigeait un `messagesPour` de chaque `layout.tsx`.
  Un layout qui rend exactement `<>{children}</>` sans aucune API de traduction est **transparent**
  pour next-intl : il ne monte aucun provider, donc son sous-arbre reçoit ce qu'il recevait déjà.
  L'exemption est dérivée et étroite (les deux conditions), et éprouvée par ablation — un layout qui
  rendrait la moindre chrome traduite retombe dans le contrôle.

### 3 quater. Ce qui n'est PAS fait — et c'est un ticket

Les **9 `notFound()` sur 8 pages de détail**, plus le `redirect()` du `catch` 401/403 de
`properties/[id]`. Ils réagissent à la RÉPONSE de l'API, pas à l'utilisateur : les remonter demande
de remonter la **requête**, ce qui change la forme des pages. →
**[TCK-442](TCK-442-notfound-des-pages-de-detail-sous-les-replis.md)**.

### 3 quinquies. Historique — le premier passage de ce ticket

Deux gestes, choisis parce qu'ils sont **dérivables d'une règle sans exception** :

1. **`app/page.tsx` et `app/loading.tsx` passent dans le groupe `app/(accueil)/`.** Il n'existe
   plus de frontière à la racine de `/app` — donc plus d'ancêtre universel. `/app` est servie à
   l'identique (un groupe ne consomme aucun segment) et garde son squelette. **Coût mesuré : une
   seule page perdait ce repli, `/app/crm`**, qui ne rend aucun document. Elle retrouve son 308,
   celui que son commentaire dit exister pour les liens en favori.
2. **`overview/loading.tsx` descend dans les SEPT vues** (`agency`, `agent`, `alerts`, `exports`,
   `kpis`, `owner`, `tenant`). Chaque vue garde son squelette ; l'aiguilleur par rôle
   `overview/page.tsx` — **7 des 32 `redirect()`, la plus grosse concentration du dépôt, et la
   page que tout utilisateur traverse** — sort de la portée du repli et retrouve son 307.

La règle qui les dérive, et qui est désormais gardée **sans aucune exception** dans
`app/__tests__/etats-de-route.test.ts` :

> **Une page qui ne rend AUCUN document ne vit sous aucune frontière de suspension.**

L'échange « statut contre squelette » se défend quand il y a un squelette à montrer. Sur une
redirection nue il n'y en a pas : la page ne rend jamais rien, et payait son statut pour un
squelette que personne ne voit. Les deux seules pages muettes de `/app` sont exactement `crm` et
`overview` (le test le dérive, il ne le liste pas). Ablation jouée dans les deux sens : remettre
`app/loading.tsx` → rouge sur les deux ; remettre `overview/loading.tsx` → rouge sur `overview`.

### 4. Ce qui n'était PAS fait au premier passage (repris depuis, sauf la famille c)

**24 `redirect()` et 9 `notFound()` restent sous une frontière**, sur des pages qui, elles,
rendent un document. Le remède est connu et mesuré (ligne 8 du tableau) mais il n'est pas gratuit :

| famille | pages | appels | ce que ça demande |
|---|---|---|---|
| refus d'autorisation / d'authentification, repli du **même** segment | `owners`, `maintenance/providers`, `settings/agency/upgrade`, `customers`, `properties`, `customers/[id]`, `properties/[id]` | 17 | un `layout.tsx` par segment + sortir la garde de la page ; la garde y interroge déjà `getMeAction()` et `resolveAgencyOrNull`, tous deux mémoïsés par requête — donc aucun appel d'API de plus |
| refus d'autorisation, repli **ancêtre** (`overview/`) | `overview/{agency,agent,alerts,exports,kpis,owner}` | 6 | désormais possible : leur repli est chez elles depuis le geste 2, un `layout.tsx` par vue suffit |
| `notFound()` sur ressource absente | 8 pages de détail | 9 | remonter la REQUÊTE dans le layout, pas seulement la décision — le seul cas qui change la forme des pages |

Les trois pages qui font une redirection d'**authentification en page** (`owners`,
`maintenance/providers`, `settings/agency/upgrade`) sont dans la première ligne : elles restent le
premier lot à traiter.

⚠ **Ce qui n'a pas pu être vérifié ici** : aucune de ces mesures n'a été prise sur une page réelle
de `/app`. Elles exigent une session authentifiée et une API servie, et ce worktree n'en a pas
(`takussan-api/vendor` n'y est pas installé). Le mécanisme est établi sur des sondes exécutées par
le VRAI Next 16.3.1 du dépôt ; son application aux pages réelles est déduite de l'arbre, pas
observée. *Le dire est moins coûteux que de le laisser croire.*

## Ce qu'il resterait à décider

- Un statut juste et un repli visible sont-ils conciliables ? La piste connue est le **groupe de
  routes** : sortir les pages qui décident d'un statut (`[id]`, aiguilleurs, pages qui refusent
  sur le rôle) de la portée du repli, comme TCK-335 l'a fait avec `(liste)`. Le geste le moins
  cher est `app/(accueil)/page.tsx` + `app/(accueil)/loading.tsx`, qui supprime à lui seul la
  frontière RACINE et rend leur statut à `crm` et à toute page sans repli propre. Coût : un
  remaniement de répertoires, sur 1 segment pour ce premier geste, ~10 pour aller au bout.
- **Le flash de la page interdite** est le point le plus visible, et il se traite peut-être
  séparément du statut : un refus d'autorisation pourrait remonter dans le `layout.tsx` du
  segment, au-dessus de la frontière, plutôt que dans la page.
- Ou bien : accepter l'échange **explicitement**, et poser une garde qui refuse un `loading.tsx`
  au-dessus d'un `notFound()` **hors** de `(dashboard)`.
- Mesurer d'abord s'il existe un consommateur réel de ces statuts (sonde de disponibilité,
  journal d'accès, analytique). S'il n'y en a aucun, ce ticket se ferme en `wontfix` documenté —
  ce qui est un résultat.

## Hors périmètre

- Le catalogue public, déjà tenu par TCK-335.
- Les 24 `redirect()` et 9 `notFound()` du § 4 : mesurés, chiffrés, non traités ici.
