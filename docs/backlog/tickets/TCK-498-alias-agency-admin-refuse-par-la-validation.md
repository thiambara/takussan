---
id: TCK-498
title: "On ne peut pas revenir sur son espace administrateur : la validation refuse l'alias que l'onboarding épingle"
status: done
phase: P0
family: bug
estimate: S
wave: 56
created: 2026-08-30
updated: 2026-08-31
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
tags: [back, front, profils, garde, bug, p0]
---

> **Ticket écrit après le correctif**, ce qui n'est pas l'ordre habituel : il l'est pour que le
> commit puisse citer un identifiant et que la correction laisse une trace ailleurs que dans un
> diff. Les cinq critères sont mesurés — le test échouait avant, au message près du signalement.

## Objectif utilisateur

Un hôte qui bascule de son espace Administrateur vers son espace Propriétaire peut revenir — au lieu
de rester enfermé dans le second, devant un message qui parle d'un format invalide.

## Contrat de données

`ActiveProfileResolver::TYPE_MAP` porte cinq alias de fil : `agency_admin`, `owner`, `agent`,
`broker`, `service_provider`. `SelectActiveProfileRequest::rules()` en recopiait quatre :

```
TYPE_MAP                        agency_admin  owner  agent  broker  service_provider
regex de validation (avant)     ————————      owner  agent  broker  service_provider
```

`PATCH /api/me/active-profile` rendait donc **422 « The profile id field format is invalid »** sur
`agency_admin:<id>` — c'est-à-dire sur l'alias que `HostIndividualOnboardingService` épingle
lui-même comme profil actif (TCK-271), et que `GET /api/me/profiles` venait de proposer dans le
sélecteur.

**Le trou de test explique la durée.** `SelectActiveProfileTest` comptait six cas, tous sur `owner:`
et `agent:` ; le cas « format invalide » n'éprouvait que `unknown_type:1`. Aucun n'a jamais posté
l'alias que l'onboarding pose.

**C'est la deuxième occurrence du même motif.**
[TCK-329](TCK-329-profiletype-front-ignore-agency-admin.md) avait déjà payé une liste d'alias écrite à la
main qui avait dérivé — `PROFILE_TYPES` côté front, où `agency_admin` manquait aussi. La garde posée
alors ne couvre que le front ; le back portait une **seconde copie**, dans une regex, que rien ne
regardait.

**Défaut voisin, même famille, même parcours** : le garde de `/onboarding/host` testait `owner` et
`agent` sans `agency_admin`. Un compte dont l'`OwnerProfile` serait absent ou suspendu repassait donc
le garde et relançait l'assistant sur un espace qu'il possède déjà.

## Contraintes strictes (métier)

1. **Le motif est DÉRIVÉ de `TYPE_MAP`, jamais recopié.** Allonger la regex corrigerait l'instance et
   laisserait le défaut : la prochaine entrée de la carte se reperdrait de la même façon.
2. **La validation ne se relâche pas.** Un alias inconnu doit continuer de rendre 422, et un alias
   connu mais non possédé, 403 — la distinction porte le sens (`unknown_type:1` reste un 422).
3. **Le test doit attraper le DÉFAUT, pas son instance.** Un test qui n'éprouve que `agency_admin`
   laisserait passer le sixième alias ajouté demain.
4. **Aucune migration, aucun changement de contrat HTTP.**

## Delta à produire

**Backend — prescriptif**

- [x] `App\Http\Requests\Api\Me\SelectActiveProfileRequest` — `compositeIdPattern()` construit le
      motif depuis `array_keys(ActiveProfileResolver::TYPE_MAP)`, chaque alias échappé
- [x] `tests/Feature/Api/Me/SelectActiveProfileTest` — un cas nommé sur `agency_admin`, et un cas qui
      parcourt **chaque** alias de `TYPE_MAP` en exigeant 403 et jamais 422

**Frontend — intentionnel**

- [x] Le garde de `/onboarding/host` reconnaît `agency_admin` au même titre que `owner` et `agent`

## Critères d'acceptation

- [x] **AC1** — `PATCH /api/me/active-profile` avec `agency_admin:<id>` d'un profil possédé et actif
      rend 200. *Ce test échouait sur le code d'avant*, au message près de la capture.
- [x] **AC2** — Chaque alias de `TYPE_MAP`, posté sur un identifiant inexistant, rend 403 et jamais
      422. C'est la forme qui attrape le prochain alias ajouté sans que la validation suive.
- [x] **AC3** — `unknown_type:1` et `invalid-format` rendent toujours 422 : la validation n'a pas été
      relâchée pour faire passer le cas.
- [x] **AC4** — Un compte portant un `AgencyAdminProfile` mais aucun `OwnerProfile` actif ne peut
      plus relancer l'assistant hôte.
- [x] **AC5** — `SelectActiveProfileTest` vert (8 cas) ; Pint propre ; `npx tsc --noEmit` et
      `npm run lint` propres.

## Hors périmètre

- La garde de parité sur l'axe des rôles → TCK-494.
- La refonte visuelle de la coque des assistants → TCK-499.
- Le fait que l'assistant crée deux profils dans la même agence → TCK-497.
- Toute modification de `ActiveProfileResolver` : la carte était juste, c'est sa recopie qui ne
  l'était pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_
