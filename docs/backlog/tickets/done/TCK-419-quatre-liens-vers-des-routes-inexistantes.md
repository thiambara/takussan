---
id: TCK-419
title: "Quatre liens de `/app` mènent à des routes qui n'existent pas — la divergence menu/écrans dans l'autre sens"
status: done
phase: P2
family: bug
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-28
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

- [x] Trancher, pour chacun des quatre : la route manque (la créer) ou le lien est faux (le
      corriger / le retirer)
- [x] Garde de non-régression : tout littéral `/app/…` du front résout vers une route existante,
      avec **zéro** exception à la livraison

## Critères d'acceptation

- [x] AC1 — un test confronte les littéraux `/app/…` de `src/` à l'inventaire des `page.tsx` et
      échoue sur tout lien sans cible. Il aurait échoué avant ce ticket sur les quatre entrées
      ci-dessus, et il n'admet aucune exception
- [x] AC2 — un locataire qui clique « premier paiement » depuis sa checklist d'onboarding
      atteint un écran, pas un 404 ; un test l'éprouve

## Re-mesure à l'implémentation (2026-08-27)

Le balayage a été refait avant d'écrire une ligne, par script confrontant tous les littéraux
`'/app/…'` de `takussan-web/src` (commentaires blanchis) à l'inventaire des `page.tsx` sous
`src/app/(dashboard)/app`, segments dynamiques appariés. **46 routes, 81 littéraux distincts, et
CINQ chemins sans cible, pas quatre.**

Le cinquième n'était dans aucun ticket :

| Lien produit | Producteur | Route réelle |
|---|---|---|
| `/app/maintenance/requests/${id}` | `src/components/onboarding/ServiceProviderOnboardingWizard.tsx:161` | `/app/maintenance/[id]` — pas de segment `requests` |

C'est le **dernier geste** du parcours « un prestataire s'inscrit depuis une demande de
maintenance » : le `router.push` qui suit la complétion de son onboarding le déposait sur un 404.
Et **deux tests figeaient les deux liens cassés** — `ServiceProviderOnboardingWizard.test.tsx:134`
attendait `/app/maintenance/requests/99`, `wizard-drafts.test.ts:15` attendait
`/app/profile/customer/onboarding`. *Un test qui asserte une chaîne asserte la chaîne, pas la
route.* Les deux ont été corrigés avec le code.

## Ce qui a été tranché, entrée par entrée

| Entrée | Décision | Raison |
|---|---|---|
| `/app/payments/new?lease_id=` | **lien corrigé** → `/app/leases/{id}` | il n'existe aucun écran « créer un paiement » et il n'en faut pas : un locataire paie depuis le détail de son bail, où `LeaseDetail` monte `LeaseSchedule` qui porte le `PayOnlineButton` de chaque échéance |
| `/app/profile/customer/onboarding` | **règle retirée** | aucun `storageKey` du dépôt n'écrit la clé `customer-onboarding` — la règle enregistrait un lien de reprise vers un 404 pour un brouillon que rien ne peut créer |
| `/app/profile/owner/kyc` | **règle retirée** | idem `owner-kyc` |
| `/app/profile/agent/kyc` | **règle retirée** | idem `agent-kyc` |
| `/app/maintenance/requests/{id}` | **lien corrigé** → `/app/maintenance/{id}` | la route existe, le lien inventait un segment |

Les libellés `wizardDrafts.bannerTitles.{customer-onboarding,owner-kyc,agent-kyc}` des trois
dictionnaires sont **laissés en place** : ils ne coûtent rien et `src/messages/` était tenu par un
autre lot au même moment.

## Hors périmètre

- Le sens déjà traité par TCK-379 (écrans sans chemin entrant).
