---
id: TCK-1061
title: "L'effacement termine les profils du compte et retire le nom de fichier d'origine de leurs pièces"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-64--pièces-kyc-des-profils-à-leffacement-à-la-fin-du-profil-et-au-re-téléversement"
tags: [api, rgpd, kyc, pistes]
---

## Contexte

Réf : **P64.02** du fichier de pistes, `validé` (V3). `AccountDeletionService::anonymize()` ne
lit ni les profils du compte ni leurs `Document` : après l'effacement, l'`OwnerProfile` reste
`active` et non supprimé, et la pièce téléversée garde, sur sa ligne et sur son média, le nom
de fichier choisi par la personne (`CNI_Aminata_Diop.pdf`), qui est aussi le `title` de l'index.
La politique garde les pièces « pendant la relation, puis 5 ans après sa fin » (`privacy.ts`),
mais rien ne date cette fin.

## Décision du porteur

> à l'effacement, terminer les profils du compte (date de fin) et remplacer le `name` des pièces et de leurs médias par le libellé du type ; la purge de TCK-537 part de la fin du profil (porteur, 2026-10-20)

## Objectif

Un compte effacé n'a plus de profil en cours, chacun porte une date de fin, et aucune pièce de
ses profils ne garde le nom de fichier d'origine.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` → `endProfiles()` : pour chaque type de
      `Document::PROFILE_TYPES`, les profils du compte (déjà terminés compris) ; le `name` de
      leurs pièces (supprimées en douceur comprises) et de tous leurs médias devient le type ; les
      profils encore en cours sont supprimés en douceur (`deleted_at` = date de fin).
- [x] Test : `AccountDeletionExecuteTest::test_execute_termine_les_profils_et_renomme_leurs_pieces`.

## Critères d'acceptation

- [x] AC1 — Après `executeDeletion()`, chaque profil du compte a un `deleted_at`.
- [x] AC2 — La pièce téléversée par `kyc/upload` et son média portent le type (`id_card`), plus le
      nom d'origine ; la pièce d'un profil déjà terminé aussi.
- [x] AC3 — La pièce d'un autre compte garde son nom.

## Hypothèses (mode sans humain)

- **« Terminer » = suppression en douceur** : c'est ce que fait déjà le retrait d'un agent
  (`AgencyMemberRemovalService`), et `deleted_at` est la date de fin que la `Piste` propose. Aucun
  statut « terminé » n'existe sur tous les profils.
- **« Le libellé du type » = la valeur du type** (`id_card`, `rib`, `ninea`…). L'API n'a aucun
  libellé traduit de `DocumentType`, le front possède le texte affiché (principe 5), et le dépôt
  nomme déjà ainsi une pièce sans nom (`ucfirst($kind)`, `statuts.<ext>`). Écrire un libellé
  français en base serait un texte neuf.
- **Par `save()`, pas en masse** : `Document` est indexé (`title` = `name`), la sauvegarde
  réindexe la pièce ; aucun des deux modèles ne journalise ses attributs.
- **Seul `name` change sur le média** : depuis TCK-1026, `file_name` est le `hashName()` du
  fichier, et la décision ne vise que `name`. Les fichiers restent, conformément à la politique.

## Hors périmètre

- **La purge à « fin + 5 ans » elle-même** : TCK-537 (`todo`) la porte ; elle partira du
  `deleted_at` du profil, que ce ticket pose.
- Le retrait d'un agent de son agence (`AgencyMemberRemovalService`), qui termine le profil sans
  toucher ses pièces : la décision ne vise que l'effacement du compte.
- Un `file_name` d'origine sur un média téléversé avant TCK-1026.

## Notes d'implémentation

- Avant correctif : rouge sur le `deleted_at` de l'`OwnerProfile`. Ablations : fin des profils
  retirée → rouge ; renommage de la pièce retiré → rouge ; renommage du média retiré → rouge ;
  profils terminés écartés (`query()` au lieu de `withTrashed()`) → rouge sur la pièce de l'agent
  retiré. Remis → 15 verts sur la classe.
