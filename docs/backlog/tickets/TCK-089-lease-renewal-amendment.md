---
id: TCK-089
title: "Renouvellement bail / avenant"
status: review
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-25
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

**Implémentation 2026-04-25** :

- **Nom de colonne aligné sur le spec, pas sur le ticket** : `models-spec.md`
  §14 documente `renewed_from_lease_id` (la colonne TCK-027 existe déjà avec
  ce nom). Le ticket utilisait l'alias `parent_lease_id` — j'ai préservé le
  nom canonique partout (Eloquent `renewedFrom()` / `renewals()`, includes
  Spatie, payload, FormRequest, FK). Pas de migration de colonne, juste
  l'index `leases_renewed_from_idx` ajouté pour les requêtes de chaîne.
- **`LeaseRenewalService` remplace `LeaseService::renew`** (TCK-027 stub).
  L'ancienne implémentation ne gérait ni anti-overlap, ni max-chain, ni
  immutabilité tenant/property, ni event/notification. La route
  `POST /api/leases/{lease}/renew` pointe désormais sur
  `LeaseRenewalController` (le `LeaseController::renew` historique a été
  supprimé) ; le controller appelle le nouveau service après autorisation
  via `Gate::forUser($user)->allows('renew', $lease)`.
- **Statuts renouvelables** : seul `Active` ou `Expired` autorisent le
  renouvellement. L'enum `LeaseStatus` n'a pas de case `EndingSoon` (le
  ticket le mentionne mais c'est une feature future) — quand le case sera
  ajouté il suffira de l'inclure dans `RENEWABLE_PARENT_STATUSES`.
- **Soft-cascade non applicable ici** : un parent renouvelé devient
  `Renewed` (pas supprimé) — le child reste indépendant et survit. Pas
  besoin de hook `deleting`. Le FK `nullOnDelete` du parent (TCK-027)
  reste en place pour le cas hard-delete.
- **Continuité dates** : si le payload demande un `start_date` antérieur à
  `parent.end_date`, le parent voit son `end_date` rétroactivement ajusté à
  `start_date - 1` (sauf si ça remonte avant `parent.start_date`, auquel
  cas on clamp). C'est tracé via la persistance Auditable du Lease.
- **Setting `lease.require_signature`** détermine si le child démarre en
  `PendingSignature` ou directement `Active` (avec `signed_at = now()`).
  Le workflow signature électronique reste hors-scope (P3).
- **ActivityLog double entrée** : `lease_renewed` sur le parent (avec
  diff complet des champs trackés) + `lease_created` sur le child (avec
  `parent_lease_id`/`renewed_from_lease_id`). Les listings d'activité
  affichent ainsi les deux côtés du lien sans corrélation manuelle.
- **Notification `lease_renewed`** ajoutée à
  `PreferenceResolver::EVENTS` — respecte les toggles user existants
  (TCK-070). 3 canaux (database/mail/broadcast) ; SMS reste off par
  défaut comme pour les autres events non-critiques.
- **Permission `leases.renew`** créée via `RolesAndPermissionsSeeder` et
  attribuée à `agency_admin` / `agent` / `owner` (mêmes rôles que
  `leases.refund_deposit`). Tenants et customers explicitement exclus —
  un PATCH `parent_id` côté UI échoue avec 403, même si la fiche bail
  affiche le bouton (le frontend gate via `canRenew` aussi par rôle).
- **Frontend `Label` natif** dans `LeaseRenewalDialog` : le composant
  shadcn `<Label>` est wrappé sur `@base-ui/react` `Field.Label` qui
  exige un `<Field.Root>` parent et throw en jsdom. Pour un wizard
  léger sans validation react-hook-form, `<label htmlFor>` natif suffit
  — testable en jsdom et sans surface API perdue.
- **Wizard frontend** est zero-dep (`useState` plutôt qu'un stepper
  externe). Le diff visuel à l'étape 3 met en surbrillance amber les
  champs modifiés ; les inchangés restent stone neutre. Pas de Field
  picker pour tenant/property — l'API les rejette en 422 (`prohibited`)
  donc on ne les expose même pas côté UI.
- **Build pré-cassé non-touché** : `next build` échoue déjà sur `dev`
  pour `ConversationInfoSheet` (TCK-085) qui importe `SheetDescription`/
  `SheetHeader`/`SheetTitle` non exportés par `ui/sheet.tsx`. Ce
  ticket ne touche pas à `messages/` — ajouté à la liste de cleanup
  follow-ups (TCK-078 successor).
- **Tests** :
  - Backend ciblés : 8 (`LeaseRenewalServiceTest`) + 5
    (`LeaseRenewalEndpointTest`) + 4 (`LeaseChainEndpointTest`) + 3
    (`LeaseRenewedNotificationTest`) = **20 verts**.
  - 2 tests pré-existants de `LeaseTest` (renew happy + inactive)
    réajustés au nouveau contrat (status `active` au lieu de `draft`,
    permission seed, `start_date` accepté).
  - Frontend : 3 tests Vitest sur `LeaseRenewalDialog` (default
    `start_date`, transition steps avec diff, hint immutabilité).
  - Suite complète Vitest : **375 verts**.
