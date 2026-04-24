---
id: TCK-089
title: "Renouvellement bail / avenant"
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-027]
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
tags: [back, front, lease]
---

## Objectif utilisateur

Permettre à un Agent ou Bailleur de prolonger un bail existant en créant un
avenant (nouveau bail enfant) qui peut modifier loyer, durée et conditions,
tout en conservant la traçabilité complète de la chaîne de baux pour un
même Locataire et un même bien.

## Contrat de données

Le modèle `Lease` (§14) doit exposer `parent_lease_id` (uuid nullable
auto-référence) pour chaîner les renouvellements. Si la colonne n'existe
pas après TCK-027, prévoir une migration additive
`add_parent_lease_id_to_leases`.

**Endpoints nouveaux** :

- `POST /api/leases/{lease}/renew` body
  `{ start_date, end_date?, monthly_rent?, deposit_amount?,
  late_fee_percent?, late_fee_grace_days?, conditions? }`
  → crée un nouveau `Lease` enfant avec `parent_lease_id = {lease.id}`,
  hérite des champs non précisés du parent, statut initial = `active` (ou
  `pending_signature` selon flux signature électronique).
- `GET /api/leases/{lease}/chain` → retourne la liste ordonnée du bail
  racine jusqu'au plus récent (utile pour timeline et reporting).

**Inclusions spatie** : `parentLease`, `childLeases`.

## Direction UX / Artistique

**Bouton "Renouveler le bail"** sur la fiche bail (TCK-044) — visible
uniquement si `status in [active, ending_soon]` et si pas de child
existant en `active`. Pré-rempli avec les valeurs du bail courant ; les
champs modifiables sont mis en surbrillance lorsqu'ils diffèrent.

**Wizard 3 étapes** :

1. *Période* — start_date (par défaut = end_date du parent + 1j),
   end_date, durée auto-calculée.
2. *Conditions financières* — loyer (slider de variation %), caution,
   pénalités de retard. Affichage clair "Évolution loyer : +X% (de A à B)".
3. *Récapitulatif* — diff visuel parent vs avenant, conditions textuelles,
   bouton de génération de l'avenant (PDF) + signature.

**Timeline bail** : la fiche affiche désormais une frise horizontale "bail
racine → avenant 1 → avenant 2 …" avec point actif sur le bail courant.

**Mots-clés d'ambiance** : continuité, transparence des évolutions,
sérénité — éviter une UI alarmiste sur les hausses.

## Contraintes strictes (métier)

- **Statut parent requis** : renouvellement autorisé uniquement si
  `parent.status in [active, ending_soon, expired]`. 422 sinon.
- **Pas de chevauchement actif** : un parent ne peut avoir qu'**un seul**
  child en `active` à la fois. 422 si tentative en doublon.
- **Continuité dates** : `child.start_date >= parent.end_date` recommandé
  ; si chevauchement explicite (renouvellement anticipé avant fin),
  `parent.end_date` est rétroactivement ajusté à `child.start_date - 1`
  (ActivityLog signale l'opération).
- **Héritage par défaut** : tous les champs non fournis dans le payload
  sont copiés du parent (locataire, bien, garants, conditions textuelles).
- **Locataire et bien** : **non modifiables** dans un avenant — pour
  changer de locataire ou de bien, il faut un nouveau bail racine. 422 si
  tentative.
- **Limite chaîne** : chaîne max de 10 niveaux. 422 au-delà.
- **Signature** : si `Setting('lease.require_signature')` est `true`, le
  child est créé en `pending_signature` et activé après workflow signature
  (hors scope de ce ticket).
- **Permissions** : `leases.renew` — réservé Agent / OwnerAgency.
- **ActivityLog** : entrées `lease_renewed` sur le parent et `lease_created`
  sur le child avec `properties.parent_lease_id`.
- **Notification** : event `LeaseRenewed` → notif email + in-app au
  Locataire avec les changements.

## Delta à produire

- [ ] Migration: `add_parent_lease_id_to_leases` (uuid nullable,
      FK self set null, index)
- [ ] Eloquent: `parentLease()`, `childLeases()` sur `App\Models\Lease`
- [ ] Service: `App\Services\Lease\LeaseRenewalService` (renew, validate
      no-active-child, inherit fields, ActivityLog)
- [ ] Controller: `App\Http\Controllers\Api\LeaseRenewalController`
      (`store`)
- [ ] Controller: `App\Http\Controllers\Api\LeaseChainController` (`index`)
- [ ] FormRequest: `RenewLeaseRequest` (validation period, financial,
      pas de tenant/property)
- [ ] Routes: `routes/api/leases.php` (renew + chain)
- [ ] Policy: `LeasePolicy@renew`
- [ ] AllowedInclude `parentLease`, `childLeases` dans
      `LeaseController`
- [ ] Event + Listener: `LeaseRenewed` → `NotifyTenantOfRenewal`
- [ ] Tests: `LeaseRenewalServiceTest` (héritage, no-overlap,
      max-chain, tenant-immutable)
- [ ] Tests: `LeaseRenewalEndpointTest` (201 + 422 + 403 + diff visible)
- [ ] Tests: `LeaseChainEndpointTest` (ordre + profondeur + sparse fields)
- [ ] UI: bouton "Renouveler" + wizard 3 étapes
- [ ] UI: timeline horizontale chaîne de baux
- [ ] UI: diff visuel parent ↔ avenant
- [ ] UI: i18n fr/en/wo (`lease.renewal.*`)
- [ ] UI: Tests Vitest (wizard step transitions, validation)

## Critères d'acceptation

- [ ] AC1 — `POST /leases/{parent}/renew` avec parent `active` →
      201 child créé, `parent_lease_id` set
- [ ] AC2 — Tentative de renouveler un parent ayant déjà un child
      `active` → 422 (`active_child_exists`)
- [ ] AC3 — Payload sans `monthly_rent` → child hérite du loyer parent
- [ ] AC4 — Tentative de changer `tenant_id` ou `property_id` → 422
      (`field_immutable`)
- [ ] AC5 — Chaîne de 11 niveaux → 422 (`max_chain_exceeded`)
- [ ] AC6 — `GET /leases/{id}/chain` retourne l'historique ordonné du
      racine au plus récent
- [ ] AC7 — Frontend : wizard pré-remplit avec parent, surligne les
      champs modifiés et empêche modif tenant/property
- [ ] AC8 — Frontend : timeline affiche tous les baux de la chaîne avec
      mise en valeur du courant

## Hors périmètre

- Workflow de signature électronique du PDF d'avenant (ticket dédié si
  demandé).
- Génération automatique du PDF d'avenant (couvert par TCK-077 templates).
- Calcul auto de hausse indexée sur indice INSEE / IRL — voir TCK-091
  rent-review pour la révision dédiée.
- Reconduction tacite automatique (job scheduled) — peut être ajoutée
  comme évolution P3.
- Migration de la caution du parent vers le child (la caution reste
  attachée au parent, le child a son propre `deposit_amount` si modifié).

## Notes d'implémentation

_(à remplir par implementing-specs)_
