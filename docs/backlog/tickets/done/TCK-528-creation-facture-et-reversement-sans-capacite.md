---
id: TCK-528
title: "Créer une facture ou un reversement ne juge aucune capacité : `invoices.create` et `payouts.create` sont déclarées et jamais lues"
status: done
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

- [x] `InvoicePolicy::create(User $user)` et `PayoutPolicy::create(User $user)` jugeant
      `Capability::InvoicesCreate` / `Capability::PayoutsCreate` sur le profil actif.
- [x] `InvoiceController::store()` et `PayoutController::store()` : `$this->authorize('create', …)`
      avant toute écriture. *Fait dans `authorize()` des FormRequest, pas dans `store()` — cf. Notes.*
- [x] `SystemRoleCapabilities` : accorder `PayoutsCreate` selon la décision de la contrainte 3.
- [x] `PayoutService::create()` : refuser aussi un bailleur **sans** agence quand l'émetteur en a une
      (ou documenter pourquoi c'est voulu).
- [x] Front : `PaymentsTabs` conditionne chaque bouton par `useCan('invoices.create')` /
      `useCan('payouts.create')`, `isLoading` traité — dans le MÊME diff que les policies.
- [x] Tests : `InvoiceStoreAuthorizationTest`, `PayoutStoreAuthorizationTest` — un membre sans la
      capacité reçoit 403 **et rien n'est écrit** ; un membre qui la porte crée ; le super-admin crée.

## Critères d'acceptation

- [x] AC1 — Un profil actif sans `invoices.create`, membre de l'agence du client, reçoit **403** sur
      `POST /api/invoices`, et `invoices` ne gagne aucune ligne.
- [x] AC2 — Même chose pour `payouts.create` sur `POST /api/payouts`.
- [x] AC3 — Chaque test d'AC1/AC2 rougit si l'appel `authorize('create')` est retiré (ablation notée).
- [x] AC4 — Les parcours existants de l'agent (création de facture depuis `/app/payments`) restent
      verts.

## Hors périmètre

- La refonte des autres actions (`send`, `mark-paid`, `cancel`, `mark-processed`) — déjà jugées par
  `update` ; à revoir séparément si la même question s'y pose.

## Notes d'implémentation

Re-mesuré le 2026-09-16 avant de coder — deux prémisses différaient :

- **`payouts.create` n'était pas « accordée à aucun profil »** : `agency_admin` la portait déjà, par
  `Capability::agencyAssignable()`. Seul l'agent en manquait. Décision de la contrainte 3 (session) :
  `agency_admin` (inchangé) + `agent` (ajouté dans `SystemRoleCapabilities::agent()`). Les agences
  existantes la reçoivent par `membership:reconcile-system-roles`, que `docker/release.sh` lance à
  chaque déploiement — rien d'autre à migrer.
- **L'autorisation est dans le FormRequest, pas dans `store()`** (écart assumé au delta). Posée dans le
  contrôleur, elle court APRÈS la validation : un appelant sans la capacité recevait 422 et le détail
  des règles pour un corps mal formé — exactement la régression que TCK-305 a fermée sur 65 méthodes.
  `StoreInvoiceRequest` / `StorePayoutRequest::authorize()` délèguent donc à
  `can('create', Invoice|Payout::class)`, et la règle vit dans la policy (`createCapability()` de
  `BasePolicy`). `test_the_refusal_precedes_validation` garde l'ordre.

**Parcours fermés, volontairement** — le front ne les proposait déjà pas (`estMembreAgence` exigeait au
moins une capacité) : un propriétaire membre d'agence, et un utilisateur SANS agence qui facturait un
client qu'il avait ajouté (courtier). La règle « client ajouté par lui » reste, en plus de la capacité
(contrainte 4) : un agent d'une agence peut toujours facturer un client sans agence qu'il a ajouté.

**Bailleur (`PayoutService`)** : la règle ne compare plus `$landlord->agency_id` mais exige un profil
owner/agent/agency_admin du bailleur DANS l'agence de l'émetteur. L'accesseur rend `null` aussi pour un
bailleur présent dans **plusieurs** agences — ce cas passait vers n'importe quelle agence ; refuser
seulement « `agency_id` null » aurait en plus refusé à tort un multi-agences membre de l'agence émettrice
(les deux cas sont testés).

**Tests existants retouchés** : `InvoiceTest` et `PayoutTest` émettaient avec
`User::factory()->create(['agency_id' => …])`, qui matérialise un profil **owner** — ou sans agence du
tout. Ils émettent maintenant en agent ; aucune assertion n'a changé.

**Ablations** (copies dans le scratchpad, restauration par `cp`, md5 identiques avant/après) :
1. les deux `authorize()` → `return true` : **6 rouges** sur 16 (owner, rôle personnalisé, ordre
   autorisation/validation, ×2) ;
2. ancienne règle du bailleur : **2 rouges** (bailleur sans agence, bailleur de deux autres agences) ;
3. `PayoutsCreate` retiré de l'agent : **5 rouges** (dont 3 de `PayoutTest`) ;
4. front, `useCan('payouts.create')` → `'invoices.create'` : **3 rouges** ; `isLoading` ignoré : **1 rouge**.
Un premier essai de l'ablation 1 par `sed` BSD n'avait rien muté (pas d'alternance `\|`) et rendait
16 verts : vérifier la mutation (`grep`) avant de lire le vert.

AC4 est vérifié par les tests (`InvoiceTest`, `PayoutTest`, `PaymentsTabs.test.tsx`), pas au navigateur.

**Vérification adverse (2026-09-16)** — deux mutations restaient **vertes sur les 46 tests** des quatre
classes, et deux tests les attrapent désormais :
- `StoreInvoiceRequest::authorize()` qui lit `payouts.create` : aucun appelant de la classe ne portait
  l'une sans l'autre → `test_a_role_holding_only_payouts_create_is_refused` (1 rouge sous la mutation) ;
- une policy qui juge la capacité « dans l'une quelconque des agences du user » au lieu du profil actif
  (principe 2) → `test_the_capability_is_judged_on_the_active_profile_not_on_another_agency`, dans les
  deux classes (agent ailleurs, propriétaire ici, `X-Profile-Id` = propriétaire ; 2 rouges), plus la
  contre-épreuve `test_the_same_user_creates_once_the_agent_profile_is_active`.
Aucun défaut du code de production : les deux trous étaient dans les tests.

### Corrigé après vérification adverse

1. **Facture vers une autre agence.** Un agent de l'agence A facturait un client rattaché à l'agence B
   dès lors qu'il l'avait ajouté (201 reproduit, facture portant `agency_id` = A).
   `InvoiceService::create()` ne retient plus « client ajouté par lui » que pour un client **sans
   agence** ; un client de l'agence active de l'émetteur passe déjà par la règle d'appartenance. Le
   refus reste le **403** des autres refus d'appartenance du service.
   Tests : `test_a_customer_of_another_agency_is_refused_even_when_the_issuer_added_it` (201 → 403) et
   `test_a_customer_without_agency_added_by_the_issuer_is_still_invoiceable`. Ablations : ancienne
   règle → **1 rouge** ; clause « ajouté par lui » supprimée → **5 rouges** (dont 4 de `InvoiceTest`).
   Aucun appelant n'en dépendait : dans `InvoiceTest`, les clients « ajoutés par » sont sans agence
   (défaut de `CustomerFactory`) ; `InvoiceSeeder` écrit par `Invoice::create()`, sans passer par le
   service. Les 6 classes qui touchent factures et reversements passent : 63 tests.
2. **`/admin/finances`.** `canEmitFinances` y est passé en dur à tout admin d'agence : un rôle
   personnalisé privé d'une capacité voyait un bouton qui rendait 403. `AdminFinancesTabs` conditionne
   désormais chaque bouton **et son dialogue** par `useCan('invoices.create')` /
   `useCan('payouts.create')`, en plus de `canEmit`, avec un squelette pendant `isLoading`.
   Test : `components/admin/finances/__tests__/AdminFinancesTabs.capacites.test.tsx` (7 cas).
   Ablations : reversement conditionné par `invoices.create` → **2 rouges** ; chargement ignoré →
   **1 rouge** ; facture sans capacité → **1 rouge**. Aucune clé i18n ajoutée : les libellés existent déjà.

### Hors périmètre, justifié

`DepositRefundService` (reversement + facture de remboursement de dépôt) et `EarlyTerminationService`
(facture de résiliation anticipée) créent des factures et reversements **sans** lire
`invoices.create` / `payouts.create`. Rien n'a été changé : ce sont des effets d'un geste sur le bail,
autorisé par `LeasePolicy` (`refundDeposit`, résiliation), et non une émission libre. Exiger en plus
la capacité d'émission ferait dépendre ce geste de deux capacités, et pourrait bloquer au milieu du
parcours un remboursement ou une résiliation déjà autorisés. Si la question se pose, elle se traite
dans un ticket sur les capacités des gestes du bail.
