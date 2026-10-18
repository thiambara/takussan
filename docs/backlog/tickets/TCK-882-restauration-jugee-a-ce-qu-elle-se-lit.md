---
id: TCK-882
title: "Une restauration se juge aussi à ce qu'elle se lit : backup:verify-encryption, et la restauration de la préproduction rejouée"
status: doing
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [api, infra, sauvegardes, adr-0028, adr-0044, adr-0069, pistes]
---

## Contexte

Piste P42.03 du [fichier de pistes](../../plans/2026-10-15-pistes-d-amelioration.md), décision du
porteur du 2026-10-18. Le critère de restauration d'ADR-0028 § 7 (repris par ADR-0069 § 5) compare
des comptes de lignes : il passe sous une `APP_KEY` fausse, alors que chaque colonne chiffrée
(ADR-0044 : RIB, identifiants légaux, secrets 2FA, jetons) est alors perdue. La seule restauration à
blanc mesurée date du 2026-09-14 ; 88 migrations sont venues depuis, dont les colonnes chiffrées du
2026-10-08.

## Objectif utilisateur

Une restauration se sait réussie avant d'en avoir besoin : la copie se lit avec la clé de
l'environnement.

## Delta à produire

1. `php artisan backup:verify-encryption {--connexion=} {--echantillon=20} {--cle-fausse}` : relit un
   échantillon de chaque colonne dont un modèle déclare un cast `encrypted*`, et le déchiffre avec
   la clé de l'application ; n'imprime que des comptes. `0` tout se lit, `1` une valeur illisible,
   `2` rien lu. `--cle-fausse` est son ablation.
2. ADR-0028 § 7 amendé, ADR-0069 § 5 annoté, runbook de `hebergement.md` (« Restaurer une base »).
3. Sur le serveur : la dernière sauvegarde nocturne de `takussan_preview` restaurée dans une
   instance jetable, comptes comparés à l'original, puis `backup:verify-encryption` lancé depuis le
   conteneur `api` de la préproduction sur la copie (clé de l'environnement, puis `--cle-fausse`) ;
   le relevé daté dans `hebergement.md`.

## Critères d'acceptation

- [x] **AC1** — `tests/Feature/Console/BackupVerifyEncryptionTest.php` (4 cas : clé juste, clé
      fausse, valeur abîmée, base vide) passe ; il rougit sur deux ablations (déchiffrement
      retiré → 2 échecs ; casts `encrypted` ignorés → 4 échecs).
- [ ] **AC2** — Sur le serveur, la copie de la dernière sauvegarde : comptes égaux à l'original
      aux tables vivantes près (nommées), `backup:verify-encryption` → `0` avec la clé de la
      préproduction, `1` avec `--cle-fausse` ; relevé daté dans `hebergement.md`.

## Reste sur dev

La commande est sur `dev` depuis la PR #630 (2026-10-18). Il ne reste que AC2, le rejeu sur le
serveur, qui attend l'image de préproduction qui la porte. La restauration à blanc elle-même est
déjà jouée le 2026-10-18 : dump de 03:00, 3 086 349 o, restauré en 11 s sans erreur, 116 tables
sur 116. Seules trois tables vivantes diffèrent par leur compte : `jobs`, `scheduled_task_runs`,
`property_boost_daily_stats`.

## Hors périmètre

- WAL-G et la restauration à un instant choisi : étape 5 d'ADR-0069, ticket à part.
