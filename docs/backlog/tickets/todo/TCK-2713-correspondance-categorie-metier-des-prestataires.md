---
id: TCK-2713
title: "Prestataires suggérés : une correspondance catégorie de demande → métiers, et deux métiers neufs (nettoyage, lutte contre les nuisibles)"
status: todo
phase: P1
family: back
estimate: S
wave: 88
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2652]
blocks: [TCK-2653]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [back, front, maintenance, prestataires, audit-ux, app]
---

## Objectif utilisateur

Dans la file « À dispatcher », une demande de maintenance propose jusqu'à trois prestataires du
carnet de l'agence (TCK-2652). La règle « métier = catégorie, à la lettre » laisse sans suggestion
quatre catégories sur neuf, parce que la catégorie de la demande et le métier du prestataire ne
parlent pas le même vocabulaire :

| Catégorie (`MaintenanceCategory`) | Métier qui la sert (`specialties`) |
|---|---|
| `structural` | aucun métier ne s'appelle ainsi |
| `appliance` | aucun |
| `cleaning` | métier absent du formulaire du prestataire |
| `pest_control` | métier absent du formulaire du prestataire |

## Contrat

Décision du porteur du 2026-11-11 (recommandation de la session, validée) :

| Catégorie | Métiers qui la servent, dans l'ordre |
|---|---|
| `plumbing` | `plumbing` |
| `electrical` | `electrical` |
| `structural` | `masonry` |
| `appliance` | `climate_control`, `electrical` |
| `painting` | `painting` |
| `cleaning` | `cleaning` (métier neuf) |
| `pest_control` | `pest_control` (métier neuf) |
| `locksmith` | `locksmith` |
| `other` | aucun — pas de suggestion |

- La correspondance vit en UN endroit : `MaintenanceCategory::trades()`.
- `GET /api/maintenance-requests/{id}/suggested-providers` retient un prestataire dont les métiers
  contiennent **l'un** des métiers de la catégorie ; `matching_trade` est le premier métier de la
  liste que le prestataire exerce. Le classement (zone, note, interventions, id) ne change pas.
- Le formulaire des métiers du prestataire (`TradesMultiSelect`) propose `cleaning` et
  `pest_control`, libellés en fr/en (wo : texte français, wolof en pause).

## Critères d'acceptation

1. Une demande `structural` suggère un maçon, et pas un plombier ; `matching_trade = masonry`.
2. Une demande `appliance` suggère un climaticien et un électricien ; chacun porte son métier.
3. Une demande `other` ne suggère personne, même à un prestataire qui a coché `other`.
4. Chaque catégorie de l'enum a une entrée dans la correspondance (un cas neuf sans entrée casse
   un test).
5. Le formulaire propose les deux métiers neufs, libellés.

## Notes d'implémentation

- Prémisse re-mesurée le 2026-11-11 : l'API ne valide aucune liste de métiers (`specialties` est un
  `jsonb` libre, écrit par `ServiceProviderProfileController` et `ServiceProviderInvitationService`
  sans `Rule::in`) : les deux métiers neufs ne demandent aucune migration ni règle côté API.
- Le front ne consomme pas encore `suggested-providers` (page de TCK-2653).
- **Écart trouvé en implémentant** : `specialties` porte DEUX vocabulaires. La feuille d'invitation
  de l'agence (`InviteServiceProviderSheet`) propose les valeurs de **catégorie**
  (`MAINTENANCE_CATEGORIES` : `structural`, `appliance`…), l'onboarding du prestataire
  (`TradesMultiSelect`) les **métiers** (`masonry`, `climate_control`…). La correspondance accepte
  donc les deux (`MaintenanceCategory::matchingSpecialties()` : les métiers, puis la catégorie
  elle-même — un prestataire invité avec `structural` reste suggéré, comme avant). La liste des
  prestataires sortait `masonry` et `climate_control` bruts : leurs libellés sont ajoutés à
  `serviceProviders.invite.trades`. **Suivi** : un seul vocabulaire (recommandation : les métiers
  partout, et une migration des valeurs de catégorie déjà écrites).
