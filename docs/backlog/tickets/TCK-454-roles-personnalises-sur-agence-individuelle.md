---
id: TCK-454
title: "Deux endpoints acceptent des rôles personnalisés sur une agence `individual`, que la spec leur refuse"
status: todo
phase: P1
family: back
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-agences--types
    - docs/features.md#backlog-produit
  models:
    - docs/models-spec.md#2-agency
tags: [back, autorisation, agency, individual, securite]
---

## Objectif utilisateur

Une agence individuelle ne se voit pas offrir un mécanisme d'équipe que le produit lui refuse
partout ailleurs.

## Contexte

`docs/features.md:293` énumère les restrictions de l'agence `individual`, et **« pas de rôles
personnalisés »** en fait partie, au même titre que « pas d'invitation de collaborateurs
internes » et « un seul `agency_admin` ».

[TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md) a fermé la famille *invitation* en
dérivant l'inventaire des gestes **des routes réelles** plutôt que d'une liste écrite à la
main. Cet inventaire a mis au jour deux endpoints qui relèvent d'une **autre** restriction —
celle des rôles personnalisés — et que ce ticket-là ne pouvait donc pas fermer.

**Mesuré le 2026-08-27**, par sonde exécutée sur une agence `kind=individual` :

```
POST  /api/agencies/{a}/roles          (RoleController@store)                → 201
PATCH /api/profiles/{p}/agency-role    (Profile\AgencyRoleController@update) → 200
```

Les deux réussissent là où la spec les refuse.

⚠️ **Ce ticket a été délibérément séparé de TCK-392, et la raison vaut d'être conservée.**
Ni l'un ni l'autre de ces deux gestes ne rattache ni ne promeut un membre :
`AgencyRoleController@update` **ne peut pas franchir les types de profil**, il assigne un
`AgencyRole` à un profil qui existe déjà. Les corriger sous TCK-392 aurait étendu ce lot **en
silence** à une surface que ses trois tickets ne visaient pas. *Une correction juste, posée
sous le mauvais ticket, est une décision qui n'a pas été prise.*

## Ce que ce ticket doit décider (et non pas seulement coder)

La garde d'`AgencyKind` est le geste facile ; il existe déjà, sur le patron de
`AgentInvitationService::assertAgencyCanInvite()` et de la garde posée en tête de
`AgencyController::addAgent()` (TCK-392). Trois questions n'ont **pas** de réponse évidente :

1. **Le sort de `AgencyRoleService::assign()`** — la garde va-t-elle dans le service (donc sur
   tous les appelants, y compris internes et seeders) ou sur les deux contrôleurs ? ⚠ TCK-305 a
   établi que `authorize()` d'une FormRequest est une **simple délégation à la policy** :
   n'y pose pas la règle. `AgencyPolicy@update` ne juge pas le `kind`.
2. **Les écrans concernés** — quels écrans mènent aujourd'hui à ces deux routes, et que
   voient-ils au refus ? Un 403 sans écran qui l'anticipe est un cul-de-sac, pas une garde.
3. **La clé i18n du refus**, dans les trois dictionnaires (`fr`/`en`/`wo`) — l'API émet un code,
   le front possède le texte.

## Critères d'acceptation

1. `POST /api/agencies/{a}/roles` refuse une agence `kind=individual`, et le **test l'éprouve
   sur une agence `standard` aussi** — un témoin qui reste vert, sinon la garde peut refuser
   tout le monde sans que rien ne bronche.
2. `PATCH /api/profiles/{p}/agency-role` idem. ⚠ **Si une seconde route atteint la même méthode
   de contrôleur, le test doit éprouver les DEUX** — c'est ce que TCK-392 a fait pour
   `AgencyMemberRoleController@update` (`PUT /members/{u}/role` et `PATCH /members/{u}`, même
   méthode), *parce qu'un futur découplage des routes en rouvrirait une sans que rien ne bronche*.
   Dériver la liste des routes de `php artisan route:list`, ne pas l'écrire à la main.
3. `assertDatabaseMissing` sur l'enregistrement que le refus doit empêcher — un 403 qui écrit
   quand même n'est pas un refus.
4. Chaque test est prouvé par **ablation** : garde retirée → le cas `individual` rougit, le
   témoin `standard` reste vert ; restaurée → tout revient au vert. L'application de l'ablation
   se prouve (`md5` ou `grep -c`) **avant** d'en lire le résultat.
5. Le refus est lisible côté front : clé i18n dans les trois dictionnaires.

## Hors périmètre

`POST /agencies/{a}/service-providers/invite` répond 201 sur une agence `individual` et **c'est
délibéré** : `ServiceProviderInvitationService` autorise explicitement `Standard` **et**
`Individual`, et `features.md:293` le confirme — « invitation de prestataires externes
`ServiceProvider` » reste disponible aux agences individuelles. **Ne pas la garder.**

## Notes

L'éditeur de rôles personnalisés lui-même reste au backlog produit
(`docs/features.md:398`, P1) et « le mécanisme reste à concevoir », `Capability` étant défini en
code ([ADR-0003](../../adr/0003-capacites-enum-code-defined.md)). Ce ticket ne le conçoit pas :
il ferme une porte ouverte en attendant, sur une surface où la spec est déjà tranchée.
