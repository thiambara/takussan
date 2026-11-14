---
id: TCK-2755
title: "Accepter une invitation de bailleur pendant qu'une visite de son bien se confirme : un interblocage mesuré (bien ↔ utilisateur)"
status: done
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

- [x] AC1 — Course rejouée 20 fois sur chacune des trois variantes : 0 interblocage.
- [x] AC2 — Test d'épinglage par `DB::listen` : dans `acceptForUser` et dans `acceptForAccount`, le verrou des biens
  liés précède toute requête sur `users`. Ablation : le retirer fait rougir le test.
- [x] AC3 — Une invitation qui ne vise pas un `OwnerProfile` ne prend aucun verrou de bien (test).
- [x] AC4 — Aucune régression : les tests d'invitation, d'acceptation et de transfert du bailleur restent verts.

## Notes

- Correctif mesuré par verif-commercial : 0/20 sur les trois variantes. Diff contre c1eb4ecb5 :
  `$S/impl/verif/c2744f/correctif-acceptation.diff` (hors dépôt) ; la méthode y est posée dans le docblock
  d'`acceptForUser`, à déplacer.
- Rapport : `$S/impl/verif/TCK-2744-d3d4-contre.json` (hors dépôt).

## Notes d'implémentation

- `InvitationService::verrouillerLesBiensLies()` (privée, à côté de `delierLesBiens`) : la requête mesurée par
  verif-commercial, renommée et sortie du docblock d'`acceptForUser`. Appelée en tête des transactions
  d'`acceptForAccount` (avant la pose de l'e-mail) et d'`acceptForUser` (avant le prénom) ; dans
  `acceptForAccount`, l'appel imbriqué d'`acceptForUser` la rejoue sous le même verrou, sans effet.
  `acceptAsNewUser` n'est pas touché : sa ligne `users` naît dans la transaction, personne d'autre ne la tient.
- `tests/Feature/Invitation/OrdreDesVerrousDeLAcceptationTest.php` (AC2, AC3) — les requêtes comptées à partir
  du `BEGIN` de l'acceptation (`TransactionBeginning`) :
  - compte sans nom (`acceptForUser`) et compte sans e-mail (`acceptForAccount`) : le `select … for update`
    des biens liés précède toute requête qui nomme `users`, par `order by "id"` ;
  - le témoin, compte nommé : il précède l'`update "owner_profiles" … "user_id"` (la clé étrangère vers
    `users`, que l'épingle ne voit pas en nommant `users`) ;
  - une invitation d'agent : aucun `from "properties" … for update`.
- Ablations, une à une, toutes rouges puis restaurées : sans l'appel d'`acceptForAccount` (1 rouge), sans celui
  d'`acceptForUser` (rouge sur le compte sans nom, puis sur le témoin), garde de type remplacée par `true` (AC3
  rouge), sans `orderBy('id')` (2 rouges).
- AC4 : `tests/Feature/Invitation` + `PropertyPendingOwnerTest`, `PropertyOwnerTransferTest`,
  `PropertyOwnerDesignationTest` — 318 tests verts (2026-11-12, 14:58, load 7).
- `takussan-api/CLAUDE.md`, piège 10 : les trois corrections (l'écrivain, la clé étrangère sur un `UPDATE` qui
  pose la colonne, `FOR NO KEY UPDATE`).
- AC1 (la course, 20 × 3 variantes) n'est pas rejouée ici : le harnais de verif-commercial tournait dans
  `wt-2744f`, retiré depuis. Le correctif mesuré à 0/20 est le même texte de requête aux deux mêmes places ;
  la course est à rejouer sur l'arbre commité.
