---
id: TCK-284
title: "Quatre routes « pro » cadenassées sans garde serveur"
status: todo
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

La question à trancher est donc : **`/app/overview/*` et `/app/owners` sont-elles réservées aux
agences `standard` pour TOUS les rôles, ou seulement pour les `agency_admin` ?**

## Delta à produire

- [ ] Trancher le périmètre ci-dessus (produit).
- [ ] Selon l'arbitrage : soit ajouter `ensureStandardAgencyOrRedirect` aux quatre pages, soit
      introduire une variante scopée par rôle, soit retirer ces routes de `PRO_ROUTES` si le
      cadenas était l'erreur.
- [ ] Vérifier que les **endpoints** qui les alimentent portent `AgencyKindGuard` — le SSR n'est
      qu'une redirection, l'API reste atteignable directement.
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

## Notes d'implémentation

Trouvé le 2026-08-12 en écrivant `scripts/check-pro-routes.mjs`, qui existait précisément pour
vérifier si le commentaire de `pro-features.ts` disait vrai. Il ne le disait pas.

*Une propriété proclamée dans un commentaire et prouvée par aucun test* — et ici, la forme la plus
tenace : **une règle rendue à deux endroits et tenue à un seul**.
