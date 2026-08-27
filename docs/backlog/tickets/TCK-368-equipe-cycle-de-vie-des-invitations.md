---
id: TCK-368
title: "Équipe agence — cycle de vie des invitations (en attente, relance, révocation)"
status: todo
phase: P1
family: front
estimate: S
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
tags: [front, admin, team, invitations]
---

## Objectif utilisateur

L'admin d'agence qui a invité un collaborateur voit son invitation tant qu'elle n'est pas acceptée, peut la relancer si elle est restée sans réponse, et l'annuler s'il s'est trompé d'adresse.

## Contrat de données

Aucun endpoint à créer. Les trois nécessaires existent et sont déjà consommés ailleurs :

- `GET /api/invitations` — liste, filtrable
- `POST /api/invitations/{invitation}/resend`
- `POST /api/invitations/{invitation}/revoke`

`src/lib/queries/owners.ts` (TCK-256) et `src/lib/queries/service-providers.ts` (TCK-249)
les appellent déjà, et `OwnersList` / `ServiceProvidersList` en rendent déjà la liste. Le
delta est du câblage, pas de la conception.

## Direction UX / Artistique

Les invitations en attente ne sont pas des membres : elles ne se mélangent pas aux lignes du
tableau. Une zone distincte, au-dessus ou dans un onglet propre, qui se replie quand elle est
vide. Chaque ligne dit à qui, quel rôle, depuis quand, et porte ses deux gestes. La révocation
demande confirmation ; la relance non — elle est réversible par une seconde révocation.

L'écran `/app/owners` a déjà tranché ces questions : s'en inspirer plutôt que rouvrir le débat.

## Contraintes strictes (métier)

- Les invitations listées sont bornées à l'agence active. Le front n'envoie jamais de
  `filter[agency_id]` : la portée vient du profil actif côté serveur.
- Une agence `individual` ne peut pas inviter de collaborateur interne
  ([§1.12](../../features.md#112-agence--équipe)) : la zone ne s'affiche pas, et son absence
  ne se lit pas comme une erreur.
- Les deux gestes sont gardés par capacité côté client, jamais par type de profil — cacher un
  bouton n'autorise rien, ce sont les policies qui décident.
- Toute lecture passe par `fields[…]`, `filter[…]` et `include=`.

## Delta à produire

- [ ] Requêtes : liste / relance / révocation des invitations d'agence (le patron des deux
      modules jumeaux est réutilisable tel quel)
- [ ] Section « invitations en attente » dans la console Équipe
- [ ] Confirmation avant révocation
- [ ] Invalidation du cache après chaque geste, des deux côtés (membres ET invitations)
- [ ] i18n fr/en/wo, les trois locales dans le même commit
- [ ] Tests : rendu de la liste, relance, révocation, absence de la zone en agence `individual`

## Critères d'acceptation

- [ ] AC1 — après une invitation envoyée depuis `/admin/team`, l'invitation apparaît dans
      l'écran **sans rechargement de page**
- [ ] AC2 — la relance appelle `resend` et le confirme à l'écran ; deux relances successives
      ne créent pas deux invitations
- [ ] AC3 — la révocation demande confirmation, puis fait disparaître la ligne
- [ ] AC4 — en agence `individual`, aucune section d'invitation n'est rendue
- [ ] AC5 — `grep -rn "invitations" src/components/admin/` trouve les trois appels ; aucun
      d'eux n'est une re-déclaration de ce que `owners.ts` expose déjà (vérifier par lecture,
      pas par compte)
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- L'invitation de propriétaires et de prestataires depuis cette console : les deux ont leur
  écran dédié (`/app/owners`, `/app/maintenance/providers`) et les y déplacer est une décision
  de navigation, pas un raccord.
- Les invitations de cooptation super-admin — TCK-367.
- Les relances automatiques ou programmées.

## Notes d'implémentation

**AC1 n'est pas atteignable, et ce n'est pas un manque de câblage.** Mesuré le 2026-08-27 : le
bouton « Inviter » de `/admin/team` appelle `POST /api/agencies/{id}/members`
(`AgencyController::addAgent`), qui **exige un `User` déjà inscrit** et attache les profils
directement — **aucune ligne `invitations` n'est créée**. L'endpoint qui en crée une,
`POST /api/agencies/{agency}/agents/invite` (TCK-258, complet jusqu'au mail et au garde
`kind=individual`), **n'a aucun appelant dans le front**. Le raccorder change la sémantique de
l'écran (rôles offerts, champs du formulaire, sort du cas `agency_admin` qu'aucun chemin
d'invitation ne couvre) — c'est une décision de parcours, pas le « câblage » que ce ticket
annonce. → **[TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md)**.

Ce qui est livré ici tient sans lui : la zone liste **toutes** les invitations en attente de
l'agence, y compris celles que les assistants Propriétaire et Prestataire créent déjà. Et
l'invalidation croisée est en place des deux côtés, si bien que le jour où TCK-392 passe, AC1
est vrai sans toucher à ce code.

**Le rôle est affiché, donc la zone n'est pas bornée aux rôles internes.** « Chaque ligne dit à
qui, **quel rôle**, depuis quand » suppose plusieurs rôles. Filtrer sur `agent|agency_admin`
aurait rendu la zone vide en pratique (cf. ci-dessus) tout en cachant les seules invitations qui
existent réellement.

**Pas d'`include=`, délibérément.** `InvitationResource::toArray()` n'émet aucune relation :
un `include=inviter` serait chargé côté serveur puis jeté à la sérialisation.

**Les deux mutations sont ré-exportées depuis `owners.ts`, pas réécrites** — `service-providers.ts`
en porte déjà une seconde copie mot pour mot (lignes 144 et 154). Un test compare les identités de
fonction (`expect(resendInvitation).toBe(owners.resendInvitation)`) : une troisième déclaration,
même à corps identique, le ferait rougir.

**`is_expired` (TCK-367) n'est pas consommé ici** : l'expiration n'est ni dans le delta ni dans
les AC, et la zone ne montre que les `sent`. Le champ reste disponible le jour où on l'ajoute.

Ablations vérifiées (8, toutes rouges puis vert restauré) : garde `individual` retirée · révocation
câblée sans confirmation · zone qui ne se replie plus · `filter[agency_id]` renvoyé par le front ·
relance muette · `visibleScope` sans borne d'agence · relance qui duplique la ligne · `revoke()` qui
ne change pas le statut.
