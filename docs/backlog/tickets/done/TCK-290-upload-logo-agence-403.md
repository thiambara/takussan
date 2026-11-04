---
id: TCK-290
title: Upload du logo d'agence — 403 systématique, aucune policy pour Agency
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-13
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [bug, media, autorisation, agence]
---

## Objectif utilisateur

Qu'un administrateur d'agence puisse téléverser le logo de son agence.

## Contrat de données

`POST /api/media` avec `model_type=App\Models\Agency`, `model_id`, `collection=logo`.
Consommé par `uploadAgencyLogo` (`takussan-web/src/lib/queries/agencies.ts`) via la server action
`admin-agency.ts`.

## Contraintes strictes (métier)

Le chemin d'autorisation actuel refuse **tout le monde**, mesuré :

`MediaController::authorizeAttach` cherche d'abord une policy — `Gate::getPolicyFor(Agency)` rend
`null`, il n'existe ni `AgencyPolicy` ni `Gate::policy(Agency::class, …)` dans `AppServiceProvider`.
Il retombe donc sur la branche « propriétaire uniquement » : `Agency` n'est pas un `User`, et la
table n'a pas de colonne `user_id` (elle a `primary_admin_id`). Résultat : `abort(403)`
inconditionnel.

Vérifié en amorçant l'application :

```
policy pour Agency : AUCUNE
user_id défini ? NON
```

La règle à écrire doit s'accorder avec celle d'`AgencyController::update` — `activeProfile()` sur
l'agence **et** `isAgencyAdminAt()`, ou `primary_admin_id`, ou super-admin — sans quoi on créerait
deux définitions divergentes de « qui administre cette agence ».

## Delta à produire

- [x] Policy: `App\Policies\AgencyPolicy` avec `update()`, alignée sur `AgencyController::update`.
- [x] Enregistrement: `Gate::policy(Agency::class, AgencyPolicy::class)` dans `AppServiceProvider`.
- [x] Tests: upload du logo accepté pour l'admin de l'agence, refusé pour un tiers, refusé pour
      un admin d'une AUTRE agence.

## Critères d'acceptation

- [x] AC1 — un `agency_admin` de l'agence téléverse le logo et reçoit 201.
- [x] AC2 — un `agency_admin` d'une autre agence reçoit 403.
- [x] AC3 — la règle est écrite UNE fois et partagée avec `AgencyController::update`.

## Hors périmètre

- Les autres `model_type` de `/api/media` (Property est couvert par `PropertyPolicy`).

## Notes d'implémentation

Trouvé en revue de la PR #150 (passe 32). Défaut PRÉEXISTANT, relevé parce que cette PR fait
passer `activeProfileId` dans la relecture qui suit l'upload — un paramètre correct sur un chemin
qu'aucun appel n'atteint. **Aucun test ne couvre ce chemin**, ce qui est la raison pour laquelle
il a pu rester cassé.
