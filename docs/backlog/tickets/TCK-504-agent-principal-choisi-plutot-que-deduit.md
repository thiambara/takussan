---
id: TCK-504
title: "Agent principal — une agence le CHOISIT, au lieu qu'un ordre le déduise"
status: todo
phase: P2
family: full
estimate: M
wave: 58
created: 2026-08-31
updated: 2026-08-31
depends_on: [TCK-502]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#8-propertycollaborator
tags: [back, front, property, collaborators, contact]
---

## Objectif utilisateur

Un admin d'agence qui confie un bien à deux agents doit pouvoir dire **lequel des deux** la fiche
publique nomme et à qui les messages arrivent.

## Contrat de données

TCK-502 a rendu le choix **déterministe** — le collaborateur `agent` le plus anciennement invité,
via `App\Services\Property\PrimaryPropertyContact` — et c'était l'objet du ticket : fermer un
tirage. Mais déterministe n'est pas *choisi*. Aujourd'hui, une agence qui veut mettre l'autre agent
en avant n'a aucun moyen de le dire : il lui faudrait supprimer puis recréer une ligne de
collaboration pour en déplacer la date d'invitation.

Le delta porte sur `property_collaborators`, dont la définition de référence est en `spec_refs`.

⚠️ **Le relevé qui a motivé ce ticket, et qui touche la spec :** les colonnes d'acceptation que
`docs/models-spec.md#8-propertycollaborator` décrit — `invitation_accepted`, `invitation_date`,
`accepted_date`, `invited_by`, `permissions`, `notes` — **n'existent pas dans la migration**
(`2026_04_17_160008_create_property_collaborators_table`), qui porte `invited_at`, `accepted_at`
et `metadata`. Et **rien dans le code ne renseigne `accepted_at`** : `PropertyCollaboratorController::store()`
ne pose que `invited_at`, il n'existe aucun parcours d'acceptation, seul le *seeder* remplit la
colonne. C'est ce qui a rendu inutilisable la règle « le plus ancien accepté » que TCK-502
envisageait. **L'écart spec↔code relève de `/sync-specs`, pas de ce ticket** — mais il doit être
tranché avant, ou en même temps, sous peine de bâtir sur une colonne qui n'a jamais eu de sens.

## Direction UX / Artistique

Le choix se pose **là où les collaborateurs se gèrent déjà**, pas dans un écran neuf : une ligne
distinguée dans la liste, à un geste, avec ce que le choix change dit en clair — c'est la personne
que la fiche publique nomme, qui reçoit les messages et dont le numéro s'affiche. Un bien sans
choix explicite ne doit pas ressembler à un bien mal configuré : le repli de TCK-502 reste juste,
il est simplement muet.

## Contraintes strictes (métier)

1. **Un seul principal par bien**, garanti en base et pas seulement dans l'écran.
2. **Le repli de TCK-502 reste la règle quand aucun choix n'est posé** — et il reste dans
   `PrimaryPropertyContact`, qui demeure la **seule** définition. Les quatre surfaces qu'il sert
   (carte de contact, `contact-lead`, `contact-message`, résolution) ne doivent rien apprendre de
   ce ticket.
3. Seul le rôle `agent` peut être principal : promouvoir un `viewer` ou un `co_owner` n'a pas de
   sens et doit être refusé côté serveur, pas seulement grisé côté client.
4. Le choix est une écriture sur le bien : elle suit l'autorisation qui gouverne déjà la gestion
   des collaborateurs, jamais une règle neuve écrite en contrôleur.
5. Retirer le collaborateur principal ne doit pas laisser le bien sans contact : le repli reprend.

## Delta à produire

- [ ] Migration : marquer le collaborateur principal, avec l'unicité par bien portée par le schéma.
- [ ] Backfill : les biens existants gardent le contact que `PrimaryPropertyContact` leur donne
      aujourd'hui, pour qu'aucune fiche publique ne change de visage à la migration.
- [ ] `PrimaryPropertyContact::for()` : le choix explicite d'abord, le repli actuel ensuite.
- [ ] Endpoint de désignation + `FormRequest` + policy déléguée.
- [ ] UI de gestion des collaborateurs : désigner, voir qui l'est, comprendre ce que ça change.
- [ ] Tests : unicité, refus sur un rôle non-`agent`, repli après suppression du principal,
      et le backfill qui ne déplace aucun contact.

## Critères d'acceptation

- [ ] AC1 — sur un bien à deux collaborateurs `agent`, désigner le second fait que la carte de
      contact, `contact-lead`, `contact-message` et la résolution nomment tous le second.
- [ ] AC2 — deux désignations concurrentes sur le même bien laissent **un** principal, pas deux.
- [ ] AC3 — désigner un collaborateur de rôle `viewer`, `manager` ou `co_owner` est refusé par le
      serveur.
- [ ] AC4 — supprimer le collaborateur principal ramène le contact au repli de TCK-502, sans
      qu'aucun écran ne rende un contact vide.
- [ ] AC5 — après la migration, **aucun** bien du jeu de données ne change de contact principal.
- [ ] AC6 — chaque test rougit si l'on retire la colonne ou si l'on ignore le choix explicite
      (ablation).

## Hors périmètre

- Le parcours d'acceptation d'une invitation de collaboration, et l'écart spec↔code sur les
  colonnes d'acceptation : ils relèvent de `/sync-specs` puis d'un ticket propre.
- La répartition de commission entre collaborateurs, qui a sa propre règle et son propre verrou.
- La messagerie de groupe.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
