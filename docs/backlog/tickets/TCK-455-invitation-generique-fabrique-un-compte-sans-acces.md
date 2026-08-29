---
id: TCK-455
title: "`POST /api/invitations` fabrique un compte accepté qui n'est membre de rien"
status: todo
phase: P1
family: back
estimate: M
wave: 49
created: 2026-08-28
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-agences--types
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
tags: [back, invitation, autorisation, agency, individual, dette]
---

## Objectif utilisateur

Personne n'accepte une invitation pour découvrir qu'elle ne donne accès à rien.

## Contexte

Relevé pendant la revue adverse de [TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md), en
mesurant **les cinq portes une à une** sur une agence `kind=individual` — inventaire dérivé des
routes réelles, non d'une liste écrite à la main. Quatre portes se ferment correctement :

```
POST /api/agencies/{a}/members        → 403
POST /api/agencies/{a}/agents (alias) → 403
POST /api/agencies/{a}/agents/invite  → 403
POST /api/agencies/{a}/owners/invite  → 422
POST /api/invitations                 → 201   ← role=agent, agency_id = l'agence individuelle
```

La cinquième s'ouvre, et le relecteur **a suivi la chaîne jusqu'au bout** plutôt que de s'arrêter
au 201 :

- l'invitation part avec **`invitable_type = NULL`** ;
- l'acceptation rend **200** et crée bien un `User` ;
- ce `User` n'est membre de **rien** : `isAgentAt`, `isOwnerAt`, `isAgencyAdminAt` sont **tous
  faux**.

C'est **exactement la pathologie que TCK-392 documente pour `agency_admin`** — un compte accepté
et aucun accès. Elle vaut aussi pour `role=agent`, et personne ne l'avait mesurée.

⚠️ **Préexistant, hors du delta de TCK-392**, et délibérément laissé hors de son périmètre : le
corriger là-bas aurait étendu ce lot en silence à une surface que ses trois tickets ne visaient
pas. *Il a fallu le mesurer pour pouvoir affirmer que l'AC4 de TCK-392 tenait — c'est la mesure
qui crée le ticket, pas l'inverse.*

## Ce que ce ticket doit décider

La question n'est pas « faut-il un 403 de plus ». Deux lectures s'affrontent et **le ticket doit
trancher explicitement** :

1. **La porte ne devrait pas s'ouvrir** — une agence `individual` n'invite pas de collaborateurs
   internes (`docs/features.md:293`), et l'endpoint générique doit appliquer la même règle que
   les quatre autres.
2. **La porte peut s'ouvrir, mais la chaîne doit aboutir** — `invitable_type = NULL` est un
   défaut en soi, indépendamment du type d'agence : une invitation qui ne sait pas à quoi elle
   rattache le compte est cassée pour **toutes** les agences, pas seulement les individuelles.

Ces deux lectures ne s'excluent pas et la seconde a une portée plus large. **Mesurer d'abord ce
que `POST /api/invitations` produit sur une agence `standard`** : si `invitable_type` y est
également nul, le défaut n'a rien à voir avec le type d'agence et ce ticket change de nature.

## Critères d'acceptation

1. Le comportement de `POST /api/invitations` est mesuré sur les **deux** types d'agence avant
   toute correction, et le relevé figure dans le ticket.
2. Une invitation acceptée rend un compte **membre de quelque chose**, ou l'invitation est
   refusée à l'émission — jamais 201 puis un couloir sans issue.
3. Le test suit **la chaîne entière** (émission → acceptation → appartenance), et non le seul
   code de retour. *Un 201 ne dit rien de ce qu'il a créé.*
4. Un témoin sur agence `standard` reste vert, sinon la garde peut refuser tout le monde sans
   que rien ne bronche.
5. Chaque test prouvé par **ablation**, dont l'application est prouvée (`md5` ou `grep -c`)
   **avant** que le résultat n'en soit lu.

## Notes

Trois portes de la même famille ont été fermées par TCK-392 (`AgencyController@addAgent`,
`AgencyMemberRoleController@update` atteint par deux routes, et les services d'invitation). Le
patron de garde existe donc déjà et se recopie ; c'est la **décision** ci-dessus qui manque, pas
le geste.

---

## Décision — mesure du 2026-08-29, étape 0 du lot

**La mesure exigée par l'AC1 a été prise, et elle change la nature du ticket.**

Sonde exécutée sur les deux types d'agence, chaîne entière (émission → acceptation →
appartenance), même acteur `agency_admin`, même payload `{email, role: 'agent'}` :

| Type d'agence | `POST /api/invitations` | `invitable_type` | `accept` | `isAgentAt` / `isOwnerAt` / `isAgencyAdminAt` |
|---|---|---|---|---|
| **`standard`** | **201** | **NULL** | **200** | **false / false / false** |
| `individual` | 201 | NULL | 200 | false / false / false |

**Le témoin `standard` se comporte exactement comme l'agence individuelle.** Le défaut n'a donc
aucun rapport avec le type d'agence : c'est **la lecture 2** du ticket, et la lecture 1 tombe.

La cause est lisible et ne demande aucune inférence : `CreateInvitationRequest` déclare
`'invitable_type' => ['nullable', 'string']`, et `InvitationService::send()` reprend
`$payload['invitable_type'] ?? null` tel quel. **Rien, nulle part, n'exige qu'une invitation sache
à quoi elle rattache le compte.** Le `nullable` est commenté « pour la cooptation super-admin » —
un cas réel, mais qui n'a jamais été distingué des autres.

### Ce qui est donc à corriger

**Refuser à l'émission une invitation qui ne rattache à rien**, quel que soit le type d'agence :
un `invitable_type` absent est légitime **pour le seul rôle `super_admin`** (cooptation, hors
agence) et illégitime pour `owner`, `agent`, `agency_admin`, `service_provider`.

⚠ **Ne pas déduire la règle du `role` seul** : la mesurer sur les quatre rôles, et garder
`super_admin` vert comme second témoin. Une garde qui refuserait aussi la cooptation
transformerait ce ticket en régression sur un parcours qui marche.

⚠ **Ne PAS fermer `POST /api/invitations` aux agences `individual`** : la mesure montre que ce
n'était pas le sujet, et TCK-454 traite séparément la restriction qui, elle, est bien liée au
type d'agence.

*C'est la mesure qui a créé ce ticket ; c'est encore elle qui vient d'en écarter la moitié.*
