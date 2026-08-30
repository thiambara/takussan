---
id: TCK-449
title: "`POST /api/agencies/{id}/members` ignore le type d'agence : une agence `individual` se constitue une équipe en contournant l'écran"
status: done
phase: P1
family: technique
estimate: S
wave: 50
created: 2026-08-27
updated: 2026-08-30
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

> ## ⚠ CORRECTION DU 2026-08-29 — LE DÉFAUT DÉCRIT CI-DESSOUS N'EXISTAIT DÉJÀ PLUS
>
> **Établi par exécution, pas par lecture.** Les six fichiers rebasculés à leur état `origin/dev`
> (`git show origin/dev:<path> > <path>`, six empreintes relevées AVANT de lire le résultat, six
> md5 changés — donc l'ablation a bien eu lieu) :
>
> ```
> ef829f67 → 89d1adf9   AgencyController.php
> f8e9bdd0 → ad61689e   AgencyMemberRoleController.php
> 19d26493 → 018af070   AgentProfilePolicy.php
> 1191b968 → ed78d94f   OwnerProfilePolicy.php
> 7ab170e7 → 58f5b33c   AgentInvitationService.php
> ac59d895 → 1861ccd1   OwnerInvitationService.php
>
> php artisan test tests/Feature/Agency/TeamFormationBoundaryTest.php
>   → 3 passed (18 assertions)        ← SUR LE CODE D'AVANT CE TICKET
> ```
>
> Restauré, les six md5 reviennent à l'identique et le test rend les mêmes 3/18.
>
> **Ce n'est pas « un chemin oublié », c'est aucun chemin.** `php artisan route:list` rend
> **exactement six** routes vers les méthodes gardées, et le test les frappe **toutes les six** :
> `POST agents`, `POST members`, `PUT members/{user}/role`, `PATCH members/{user}`,
> `POST agents/invite`, `POST owners/invite`. Il n'existe pas de septième chemin qui aurait rendu
> 200 hors du regard du test. Sur `origin/dev`, la règle était déjà écrite **six fois**, une par
> chemin, chacune à la main — le 403 venait d'un `abort_if` inline dans `addAgent()` lui-même
> (`AgencyController.php:173`), ni du quota, ni d'une policy.
>
> **D'où venait le défaut, et pourquoi personne n'est en faute.** Le relevé de ce ticket a été pris
> le **2026-08-27**. Le correctif est `d750b26f`, daté du **2026-08-27 à 22:19:58**, sur une autre
> branche — la passe adverse d'un AUTRE ticket, dont le message dit en toutes lettres : *« TCK-392
> AC4 : j'avais déclaré tenu ce que je n'avais pas mesuré. `POST /agencies/{id}/members` rendait
> 200 sur une agence `individual`, quand son jumeau `agents/invite` rendait 403. »* Il a atteint
> `dev` par le merge `dbd1746c` (PR #237) le **2026-08-29 à 16:47**, c'est-à-dire le point de
> départ exact de la branche qui livre ce ticket.
>
> *Le relevé était juste le jour où il a été pris. Une mesure sans sa date devient une croyance —
> ici elle a tenu 48 heures.*
>
> **Ce que ce ticket a réellement livré, et qui reste acquis :** la **mutualisation**. Les six
> copies écrites à la main deviennent un appel unique à `AgencyKindGuard::canFormTeam()`. C'est
> l'AC5, il est réel, et il est prouvé par sa propre ablation — casser la définition unique fait
> rougir 6 tests sur 29 (`md5 c2218438 → 7ecbae9f`), restauré 165 verts. Six copies d'une règle
> d'autorisation sont six occasions de diverger ; il n'y en a plus qu'une.
>
> **Ce qui tombe, et qu'il ne faut pas laisser affirmé :** le titre et le sujet du commit
> (« l'ajout de membre **ignorait** le type d'agence ») et l'**AC1** (« un test qui échoue avant le
> correctif »). Le comportement est **inchangé aux 18 assertions près, dans les deux états** :
> mêmes 403, mêmes 200, mêmes `assertDatabaseMissing`.
>
> ⚠ **Ce ticket reste `done`** — la consolidation est livrée et gardée. Il change de NATURE :
> `family: bug` devient une dette technique fermée. *Un ticket qu'on clôt en corrigeant son cadrage
> vaut mieux qu'un ticket qu'on clôt en gardant le récit qui l'a justifié.*


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

- [x] Poser la garde `AgencyKind` sur le chemin `addAgent()` — dans `AddAgentAgencyRequest::authorize()`
      ou dans le contrôleur ; réutiliser le patron d'`AgentInvitationService::assertAgencyCanInvite()`
      plutôt que de le réécrire
- [x] Vérifier que l'alias `agencies/{agency}/agents` est couvert par la même garde
- [x] Tests : 403 sur `individual` pour les **deux** routes ; 200 inchangé sur `standard` ; un
      test qui échoue avant le correctif
      *(voir ci-dessous : la seconde moitié de cette case est sans objet)*

## Critères d'acceptation

- [x] AC1 — `POST /api/agencies/{id}/members` sur une agence `individual` rend **403**, et le
      test échoue avant le correctif
      *(idem — le 403 est éprouvé, le « avant le correctif » n'existe pas)*
- [x] AC2 — l'alias `POST /api/agencies/{id}/agents` rend **403** dans les mêmes conditions
- [x] AC3 — sur une agence `standard`, les deux routes rendent toujours 200 (non-régression)
- [x] AC4 — le cas « agence `individual` **sans** souscription » est couvert par un test : c'est
      celui où le quota ne garde rien
- [x] AC5 — la définition de « qui peut constituer une équipe » n'existe qu'à **un** endroit,
      partagé par l'invitation et le rattachement

## Hors périmètre

- Le fait que le bouton « Inviter » appelle cet endpoint plutôt que celui d'invitation →
  [TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md).
- La promotion d'une agence `individual` vers `standard`, déjà couverte ailleurs.

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Ces deux cases sont cochées à moitié, et il faut dire laquelle — 2026-08-30

Les deux portent la même conjonction : « **403** sur les deux routes » **et** « un test qui
échoue **avant le correctif** ».

- La **première moitié est tenue et mesurée** : `TeamFormationBoundaryTest` dérive les deux
  routes de `route:list`, les refuse toutes deux sur `individual` sans souscription, et garde un
  **témoin** `standard` qui reste ouvert — sans quoi une garde qui refuserait tout le monde
  passerait pour un correctif.
- La **seconde est sans objet**, et le bloc de correction daté plus haut le montre par exécution :
  le défaut était **déjà clos sur `origin/dev`** quand cette branche est partie. Il n'existe
  aucun « avant le correctif » où faire rougir quoi que ce soit — six fichiers ramenés à l'état
  de `dev` laissent le test vert.

Ce qui reste réellement livré par ce ticket, et qui n'existait pas : la définition unique
(`AgencyKindGuard::canFormTeam()`) là où six copies écrites à la main disaient chacune la même
chose, et le témoin `standard`. *Cocher la case entière aurait attesté d'un rouge que personne
n'a vu ; la laisser vide aurait effacé le 403 qui, lui, est prouvé.*
