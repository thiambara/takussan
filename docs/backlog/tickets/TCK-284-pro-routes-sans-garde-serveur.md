---
id: TCK-284
title: "Quatre routes « pro » cadenassées sans garde serveur"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-12
updated: 2026-08-12
depends_on: []
blocks: []
spec_refs:
  features: []
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

## Décision et résolution — 2026-08-12

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

## Notes d'implémentation

Trouvé le 2026-08-12 en écrivant `scripts/check-pro-routes.mjs`, qui existait précisément pour
vérifier si le commentaire de `pro-features.ts` disait vrai. Il ne le disait pas.

*Une propriété proclamée dans un commentaire et prouvée par aucun test* — et ici, la forme la plus
tenace : **une règle rendue à deux endroits et tenue à un seul**.
