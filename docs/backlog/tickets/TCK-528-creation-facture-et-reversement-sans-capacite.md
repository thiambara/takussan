---
id: TCK-528
title: "Créer une facture ou un reversement ne juge aucune capacité : `invoices.create` et `payouts.create` sont déclarées et jamais lues"
status: todo
phase: P1
family: bug
estimate: S
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#28-payout-
tags: [back, sécurité, autorisation, payments, capacités]
---

## Objectif utilisateur

Qu'un membre d'agence ne puisse émettre une facture ou un reversement que si son profil actif
porte la capacité correspondante — et non du seul fait d'appartenir à l'agence.

## Contrat de données

Relevé le 2026-09-16 pendant la revue design (groupe F, puis lecture du code par la session) :

- `POST /api/invoices` → `StoreInvoiceRequest::authorize()` rend `true` (l'autorisation y est
  laissée « au contrôleur puis aux policies »), `InvoiceController::store()` n'appelle aucun
  `authorize()`, et `InvoiceService::create()` accepte tout appelant dont l'agence est celle du
  client, ou qui a ajouté le client. **`Capability::InvoicesCreate` n'est lue nulle part.**
- `POST /api/payouts` → même forme ; `PayoutService::create()` accepte **tout utilisateur qui a
  une agence** (et refuse seulement un bailleur d'une AUTRE agence — un bailleur sans agence
  passe). **`Capability::PayoutsCreate` n'est accordée par aucun profil de
  `SystemRoleCapabilities` et n'est lue nulle part.**
- `InvoicePolicy` et `PayoutPolicy` n'ont pas de méthode `create`.
- Le front (`components/payments/PaymentsTabs.tsx`) ne masque les deux boutons qu'à un
  utilisateur **sans aucune capacité d'agence** (le locataire). Il ne lit pas
  `invoices.create` / `payouts.create` : tant que le serveur ne les juge pas et qu'aucun profil ne
  porte `payouts.create`, le faire retirerait à l'agent et au propriétaire des gestes acceptés.
  *Cacher un bouton n'est pas une sécurité* (`hooks/useCan.ts`).

## Contraintes strictes (métier)

1. La capacité se juge pour le couple *(utilisateur, agence)* du **profil actif**
   (`MembershipCapabilityResolver`) — principe non négociable n° 2 — jamais par
   `users.agency_id`.
2. Le super-admin garde l'accès.
3. **Décision à prendre avant de coder** : quels profils portent `payouts.create` ? Aujourd'hui
   aucun ; l'appliquer tel quel fermerait la création de reversements à tous les membres
   d'agence. Proposition à valider : `agency_admin` (implicite) et `agent`.
4. Les règles d'appartenance existantes (client de l'agence, bailleur de l'agence) restent, en
   plus de la capacité.

## Delta à produire

- [ ] `InvoicePolicy::create(User $user)` et `PayoutPolicy::create(User $user)` jugeant
      `Capability::InvoicesCreate` / `Capability::PayoutsCreate` sur le profil actif.
- [ ] `InvoiceController::store()` et `PayoutController::store()` : `$this->authorize('create', …)`
      avant toute écriture.
- [ ] `SystemRoleCapabilities` : accorder `PayoutsCreate` selon la décision de la contrainte 3.
- [ ] `PayoutService::create()` : refuser aussi un bailleur **sans** agence quand l'émetteur en a une
      (ou documenter pourquoi c'est voulu).
- [ ] Front : `PaymentsTabs` conditionne chaque bouton par `useCan('invoices.create')` /
      `useCan('payouts.create')`, `isLoading` traité — dans le MÊME diff que les policies.
- [ ] Tests : `InvoiceStoreAuthorizationTest`, `PayoutStoreAuthorizationTest` — un membre sans la
      capacité reçoit 403 **et rien n'est écrit** ; un membre qui la porte crée ; le super-admin crée.

## Critères d'acceptation

- [ ] AC1 — Un profil actif sans `invoices.create`, membre de l'agence du client, reçoit **403** sur
      `POST /api/invoices`, et `invoices` ne gagne aucune ligne.
- [ ] AC2 — Même chose pour `payouts.create` sur `POST /api/payouts`.
- [ ] AC3 — Chaque test d'AC1/AC2 rougit si l'appel `authorize('create')` est retiré (ablation notée).
- [ ] AC4 — Les parcours existants de l'agent (création de facture depuis `/app/payments`) restent
      verts.

## Hors périmètre

- La refonte des autres actions (`send`, `mark-paid`, `cancel`, `mark-processed`) — déjà jugées par
  `update` ; à revoir séparément si la même question s'y pose.

## Notes d'implémentation

_(à remplir par implementing-specs)_
