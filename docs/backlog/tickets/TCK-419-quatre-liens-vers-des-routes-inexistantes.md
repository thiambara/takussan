---
id: TCK-419
title: "Quatre liens de `/app` mènent à des routes qui n'existent pas — la divergence menu/écrans dans l'autre sens"
status: todo
phase: P2
family: bug
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#21-authentification--comptes
tags: [front, navigation, bug]
---

## Objectif utilisateur

Un lien du produit mène quelque part.

## Contexte

[TCK-379](TCK-379-app-menu-et-inventaire-des-ecrans-ont-diverge.md) a mesuré la divergence entre
la table de navigation et l'inventaire des écrans **dans un sens** — des écrans sans chemin. Le
balayage du sens inverse, fait pendant son implémentation, en rend **quatre de plus** : des
chemins sans écran.

Mesuré le 2026-08-27, en confrontant tous les littéraux `'/app/…'` de `takussan-web/src` à
l'ensemble des `page.tsx` sous `src/app/(dashboard)/app` (segments dynamiques appariés) :

| Lien produit | Producteur | Route cible |
|---|---|---|
| `/app/payments/new?lease_id=…` | `src/components/tenant/TenantOnboardingChecklistWidget.tsx:134` | **inexistante** — `src/app/(dashboard)/app/payments/` ne contient que `page.tsx` et `return/` |
| `/app/profile/customer/onboarding` | `src/lib/wizard-drafts.ts:96` | **inexistante** |
| `/app/profile/owner/kyc` | `src/lib/wizard-drafts.ts` | **inexistante** |
| `/app/profile/agent/kyc` | `src/lib/wizard-drafts.ts` | **inexistante** |

Le premier est le plus visible : c'est l'étape « premier paiement » de la checklist d'onboarding
locataire, donc un 404 sur un parcours P1 servi à chaque nouveau locataire. Les trois autres sont
des liens de **reprise de brouillon** de wizard — ils ne s'affichent qu'à qui a laissé un
brouillon, ce qui les rend d'autant plus difficiles à voir.

> ⚠️ Ce ticket n'est **pas** couvert par le test d'inventaire posé par TCK-379
> (`src/app/(dashboard)/app/__tests__/routes-atteignables.test.ts`) : celui-ci vérifie que toute
> route a un chemin entrant, jamais que tout chemin a une route. La garde inverse n'a
> **délibérément pas** été ajoutée à ce moment-là — elle serait née rouge sur ces quatre
> entrées, et une garde qu'on met au monde avec quatre exceptions n'est plus une garde.

## Delta à produire

- [ ] Trancher, pour chacun des quatre : la route manque (la créer) ou le lien est faux (le
      corriger / le retirer)
- [ ] Garde de non-régression : tout littéral `/app/…` du front résout vers une route existante,
      avec **zéro** exception à la livraison

## Critères d'acceptation

- [ ] AC1 — un test confronte les littéraux `/app/…` de `src/` à l'inventaire des `page.tsx` et
      échoue sur tout lien sans cible. Il aurait échoué avant ce ticket sur les quatre entrées
      ci-dessus, et il n'admet aucune exception
- [ ] AC2 — un locataire qui clique « premier paiement » depuis sa checklist d'onboarding
      atteint un écran, pas un 404 ; un test l'éprouve

## Hors périmètre

- Le sens déjà traité par TCK-379 (écrans sans chemin entrant).
