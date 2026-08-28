---
id: TCK-449
title: "`POST /api/agencies/{id}/members` ignore le type d'agence : une agence `individual` se constitue une équipe en contournant l'écran"
status: todo
phase: P1
family: bug
estimate: S
wave: 50
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#22-rôles--permissions
tags: [back, agency, authorization, bug]
---

## Objectif utilisateur

Une agence `individual` est un hôte seul : ce que l'écran lui refuse, l'API le refuse aussi.

## Contexte

Relevé le 2026-08-27. Sur une agence `kind=individual`,
`POST /api/agencies/{agency}/members` rend **200** et rattache l'agent — alors que le geste
jumeau `POST /api/agencies/{agency}/agents/invite` rend **403**. Défaut préexistant, sans rapport
avec le lot qui l'a fait apparaître.

**L'asymétrie se lit dans le code, et c'est elle qui donne le patron du correctif** :

| Chemin | Garde de type d'agence |
|---|---|
| `agents/invite` → `AgentInvitationService::assertAgencyCanInvite()` | `if ($kind !== AgencyKind::Standard) throw new HttpException(403, …)` — `AgentInvitationService.php:190-198` |
| `members` → `AgencyController::addAgent()` | **aucune** |

`addAgent()` (`AgencyController.php:151+`) ne franchit que trois gardes, dont aucune ne regarde le
type : `AddAgentAgencyRequest::authorize()` délègue à `can('update', $agency)`
(`AddAgentAgencyRequest.php:30`), `QuotaResolver::assertCanAddAgent()` ne pèse qu'un quota d'abonnement
et **sort immédiatement s'il n'y a pas de souscription** (`QuotaResolver.php:93-98`), et le garde
`user_already_in_agency` ne concerne que l'utilisateur cible.

⚠ **Deux routes mènent au même contrôleur** — `agencies/{agency}/agents` (alias historique) et
`agencies/{agency}/members` (chemin canonique TCK-015), `routes/api/agencies.php:28` et `:31`.
Une garde posée dans le contrôleur ou le FormRequest les couvre toutes les deux ; une garde
posée sur une seule route en laisse une ouverte.

⚠ **Le quota n'est pas un repli.** Sans souscription, `assertCanAddAgent()` retourne sans rien
vérifier : croire qu'un plan « individual » borne déjà l'équipe est faux dans le cas le plus
courant.

**Ce défaut n'est visible qu'en contournant l'écran.** C'est pourquoi il a survécu :
[TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md) montre que la seule
interface qui appelle cet endpoint est le bouton « Inviter » de `/admin/team` — lequel n'est pas
proposé à une agence `individual`. *Une règle métier tenue par l'interface seule n'est pas tenue.*

## Contrat de données

Aucun endpoint à créer, aucune migration.

- `POST /api/agencies/{agency}/members` et son alias `…/agents` — même contrôleur, même garde à
  poser.
- `AgencyKind` et le message `team.invite.errors.individual_agency` existent déjà : rien à
  inventer côté libellé.

## Contraintes strictes (métier)

- Le refus est un **403**, comme le geste jumeau — pas un 422, pas un rattachement silencieux.
- La règle vaut pour les **deux** routes qui mènent à `addAgent()`.
- Une agence `standard` n'est pas affectée : aucun accès n'est élargi ni restreint pour elle.
- Le garde de quota reste où il est ; il traite une autre question et ne remplace pas celui-ci.
- Le message d'erreur passe par les clés existantes (fr/en/wo), le front possédant le texte.

## Delta à produire

- [ ] Poser la garde `AgencyKind` sur le chemin `addAgent()` — dans `AddAgentAgencyRequest::authorize()`
      ou dans le contrôleur ; réutiliser le patron d'`AgentInvitationService::assertAgencyCanInvite()`
      plutôt que de le réécrire
- [ ] Vérifier que l'alias `agencies/{agency}/agents` est couvert par la même garde
- [ ] Tests : 403 sur `individual` pour les **deux** routes ; 200 inchangé sur `standard` ; un
      test qui échoue avant le correctif

## Critères d'acceptation

- [ ] AC1 — `POST /api/agencies/{id}/members` sur une agence `individual` rend **403**, et le
      test échoue avant le correctif
- [ ] AC2 — l'alias `POST /api/agencies/{id}/agents` rend **403** dans les mêmes conditions
- [ ] AC3 — sur une agence `standard`, les deux routes rendent toujours 200 (non-régression)
- [ ] AC4 — le cas « agence `individual` **sans** souscription » est couvert par un test : c'est
      celui où le quota ne garde rien
- [ ] AC5 — la définition de « qui peut constituer une équipe » n'existe qu'à **un** endroit,
      partagé par l'invitation et le rattachement

## Hors périmètre

- Le fait que le bouton « Inviter » appelle cet endpoint plutôt que celui d'invitation →
  [TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md).
- La promotion d'une agence `individual` vers `standard`, déjà couverte ailleurs.

## Notes d'implémentation

_(à remplir par implementing-specs)_
