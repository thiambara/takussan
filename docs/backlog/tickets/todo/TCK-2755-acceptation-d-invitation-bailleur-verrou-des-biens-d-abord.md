---
id: TCK-2755
title: "Accepter une invitation de bailleur pendant qu'une visite de son bien se confirme : un interblocage mesuré (bien ↔ utilisateur)"
status: todo
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2744]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md"
tags: [back, invitations, bailleur, visites, concurrence, postgresql]
---

## Objectif utilisateur

Le bailleur qui accepte son invitation pendant que l'agence confirme une visite d'un bien tenu pour lui voit
les deux gestes aboutir, l'un après l'autre. Aujourd'hui, l'un des deux peut échouer par une erreur serveur
(interblocage PostgreSQL).

## Contexte — mesuré le 2026-11-12 (contre-vérification de TCK-2744 d3/d4)

Course rejouée 20 fois par variante, sur l'arbre de c1eb4ecb5 :

- `InvitationService::accept` → `acceptForUser` / `acceptForAccount` → `finalizeAccept` → `aLAcceptation` →
  `delier` écrit `update properties set pending_owner_profile_id` ;
- en face, `createConfirmedOrFail` sur un bien tenu pour ce profil, la visite assignée au même utilisateur,
  prend `select users … for update` puis le bien.

| Variante | Interblocages / 20 |
|---|---|
| utilisateur sans nom | 8 |
| utilisateur sans e-mail | 9 |
| témoin, aucune écriture de `users` | 4 |

Les 27 interblocages du journal PostgreSQL portent la même paire. Le témoin interbloque aussi : poser
`owner_profiles.user_id = L` prend, par la clé étrangère, un `KEY SHARE` sur `users` L, qui heurte le `FOR UPDATE`
de la visite. `delier` écrit le bien même quand le transfert est refusé (titulaire = agence).

## Ce qui change

1. `acceptForUser` et `acceptForAccount` verrouillent, **en tête de leur transaction et avant toute écriture de
   `users`**, les biens que `aLAcceptation` déliera :
   `TitulaireALaSaisie::biensLies([invitable_id])->orderBy('id')->lockForUpdate()` — seulement quand l'invitation
   vise un `OwnerProfile` (`invitable_type` stocke le nom de classe complet).
2. L'ordre global des verrous (bien → … → utilisateur) est respecté par ce cinquième écrivain.
3. `takussan-api/CLAUDE.md`, piège 10 : ajouter `InvitationService` à la liste des écrivains ; préciser qu'une clé
   étrangère verrouille aussi sur un `UPDATE` qui pose la colonne, pas seulement à l'insertion (toucher une ligne
   qui référence `users` compte comme prendre `users`) ; un `UPDATE` simple prend `FOR NO KEY UPDATE`.

## Critères d'acceptation

- [ ] AC1 — Course rejouée 20 fois sur chacune des trois variantes : 0 interblocage.
- [ ] AC2 — Test d'épinglage par `DB::listen` : dans `acceptForUser` et dans `acceptForAccount`, le verrou des biens
  liés précède toute requête sur `users`. Ablation : le retirer fait rougir le test.
- [ ] AC3 — Une invitation qui ne vise pas un `OwnerProfile` ne prend aucun verrou de bien (test).
- [ ] AC4 — Aucune régression : les tests d'invitation, d'acceptation et de transfert du bailleur restent verts.

## Notes

- Correctif mesuré par verif-commercial : 0/20 sur les trois variantes. Diff contre c1eb4ecb5 :
  `$S/impl/verif/c2744f/correctif-acceptation.diff` (hors dépôt) ; la méthode y est posée dans le docblock
  d'`acceptForUser`, à déplacer.
- Rapport : `$S/impl/verif/TCK-2744-d3d4-contre.json` (hors dépôt).
