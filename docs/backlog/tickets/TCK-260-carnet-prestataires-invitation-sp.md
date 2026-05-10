---
id: TCK-260
title: "Carnet de prestataires + invitation Service Provider"
status: todo
phase: P1
family: applicatif
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-249]
blocks: [TCK-261, TCK-262]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#39-serviceprovideragencycollaboration-"
tags: [back, front, onboarding, service-provider, maintenance, p1]
---

## Objectif utilisateur

Une agence (standard ou individual) doit pouvoir tenir un **carnet de prestataires** (plombiers, électriciens, etc.) et **inviter** un nouveau prestataire — soit lors de la création d'une demande de maintenance, soit en pré-référencement depuis une page dédiée.

## Contrat de données

Repose sur le pattern Invitation unifié (TCK-249) :

- `POST /api/invitations` avec body :

  ```json
  {
    "email": "plombier@example.com",
    "role": "service_provider",
    "agency_id": 42,
    "invitable_type": "ServiceProviderProfile",
    "invitable_data": { "first_name": "...", "last_name": "...", "phone": "...", "trades": ["plumbing"], "intervention_zones": [...] },
    "metadata": { "from_maintenance_request_id": 123 }
  }
  ```

  Si l'invitation est déclenchée depuis une demande de maintenance, le `from_maintenance_request_id` est porté dans `metadata` pour que le SP atterrisse directement sur la demande après acceptation (TCK-261).

Endpoints carnet :

- `GET /api/agencies/{agency}/service-providers` — liste des SP rattachés (via `ServiceProviderAgencyCollaboration`).
- `POST /api/agencies/{agency}/service-providers/invite` — wrapper du pattern Invitation pour SP (simplifie le payload côté frontend).

## Direction UX / Artistique

Page `/app/maintenance/providers` (carnet) :
- Liste des SP avec métiers, zones, tarifs indicatifs, statut (Actif / Invité)
- Bouton "Ajouter un prestataire" → modal d'invitation

Lors de la création d'une demande de maintenance : champ "Prestataire" → option "Inviter un nouveau prestataire" → même modal pré-rempli avec les métiers/zones de la demande.

## Contraintes strictes (métier)

- Accessible aux agences `standard` ET `individual` (un host individual a aussi besoin de ses prestataires).
- Permission requise : `invite_service_provider` (par défaut `agency_admin`, `agent` si délégué).
- Conflit email : si un SP existe déjà avec ce profil dans cette agence → 409. Si le SP existe dans **une autre agence**, l'acceptation propose le multi-rattachement (TCK-262).
- Activity log : `service_provider_invited`.

## Delta à produire

- [ ] Endpoints backend
- [ ] Service : `App\Services\Invitation\ServiceProviderInvitationService` (wraps `InvitationService` + crée `ServiceProviderProfile` draft + `ServiceProviderAgencyCollaboration` draft)
- [ ] Policy : `ServiceProviderProfilePolicy@invite` (kind=standard OR individual + permission)
- [ ] Tests backend : invitation, conflit, multi-rattachement détecté (delegate à TCK-262 pour le flow complet)
- [ ] Page frontend `/app/maintenance/providers`
- [ ] Composant `<InviteServiceProviderModal>` (réutilisable depuis création demande maintenance)
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Une agence standard ou individual peut envoyer une invitation SP.
- [ ] AC2 — Carnet liste les SP rattachés à l'agence avec leur statut.
- [ ] AC3 — Depuis une demande de maintenance, l'invitation pré-remplit les métiers et zones.
- [ ] AC4 — Conflit dans la même agence → 409.
- [ ] AC5 — Si SP existant dans autre agence → l'invitation est créée et le flag `existing_sp_other_agency` remonté côté frontend (pour TCK-262).

## Hors périmètre

- Wizard onboarding SP post-acceptation (KYC, dispos) — TCK-261.
- Multi-rattachement complet d'un SP à plusieurs agences — TCK-262.

## Notes d'implémentation

_(à remplir par implementing-specs)_
