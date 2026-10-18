---
id: TCK-885
title: "La liste des effacements de compte est tenue hors de la base, pour les rejouer après une restauration"
status: doing
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-883]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [api, rgpd, sauvegardes, adr-0044, pistes]
---

## Contexte

ADR-0044, amendement du 2026-10-18, § B (piste P42.06) : restaurer une sauvegarde antérieure à un
effacement rend le compte en clair, et efface la trace (`account_deletion_requests`,
`privacy_requests`) qui permettrait de le retrouver. La procédure « Après une restauration » de
`hebergement.md` relève les effacements dans la base courante **avant** de restaurer ; elle ne peut
rien si la base courante est perdue.

## Objectif utilisateur

Un compte effacé ne revient jamais, même après la restauration d'une sauvegarde plus ancienne.

## Delta à produire

- Chaque effacement exécuté écrit, hors de la base, l'identifiant de l'utilisateur et l'instant.
- La procédure « Après une restauration » lit cette liste au lieu de la base courante.

### Le support, choisi au début du ticket

**Un objet par effacement sur le disque privé des médias** (`config('media-library.disk_name')` :
`local` en dev et en test, `r2-private` en préproduction et en production), sous
`effacements/AAAA-MM-JJ/<user_id>-<AAAAMMJJTHHMMSSZ>.json`, contenant **seulement**
`{"user_id": …, "erased_at": "…Z"}`.

- Ce seau vit hors du serveur (R2) ; il est copié chaque nuit dans
  `vps-sauvegardes/takussan-preview-private/` par `deploy/server/sauvegarde-seau-prive.sh`
  (`rclone copy`, qui ne supprime jamais), et `vps-sauvegardes` porte depuis le 2026-10-18 un
  verrou de rétention de 7 jours (ADR-0069 ; dit par la session qui a tranché le support — la
  ligne « Copie du seau privé des médias » du relevé de `hebergement.md`, datée du 2026-09-22,
  dit encore « non posée »). Ni jeton ni variable d'environnement de plus.
- Un objet **par effacement**, parce qu'un objet S3 ne s'allonge pas : un fichier journal unique
  serait un lire-réécrire concurrent.
- Écarté : un export nocturne vers `vps-sauvegardes` (l'énoncé d'ADR-0044 § B) — il aurait demandé
  à l'application un jeton d'écriture sur le seau des sauvegardes, qu'elle n'a pas et ne doit pas
  avoir, et laissé jusqu'à 24 h d'effacements sans trace.

## Critères d'acceptation

- [x] **AC1** — Un effacement exécuté apparaît dans la liste hors base, sans aucune donnée
      personnelle autre que l'identifiant ; un test le garde.
      *Mesuré le 2026-10-18 :* `AccountErasureLedgerTest::test_ac1_…` affirme la clé exacte et le
      contenu exact (`assertSame` sur `{user_id, erased_at}`), et l'absence du nom, du courriel et
      du téléphone. **Ablation** — l'écriture retirée de `executeDeletion()` : 4 rouges sur 6 dans
      `AccountErasureLedgerTest` (dont l'AC1) ; remise : 6 verts. Seconde ablation — l'écriture
      déplacée **après** le commit : 1 rouge (`test_si_l_ecriture_echoue_…` : courriel parti et
      compte anonymisé alors que la trace manque) ; remise : vert.
- [ ] **AC2** — La procédure de `hebergement.md` est rejouée une fois sur une copie : un compte
      effacé après la sauvegarde restaurée est ré-effacé depuis la liste. **À mesurer en session**
      (accès au serveur). Le cas est joué en test
      (`ListAccountErasuresCommandTest::test_execute_re_efface_le_compte_ramene_par_la_restauration`),
      ce qui ne remplace pas la mesure.

## Reste sur dev

- **AC2** : rejouer la procédure « Après une restauration » de `docs/infra/hebergement.md` sur une
  copie de la préproduction (restauration dans un conteneur jetable, comme TCK-882), avec un compte
  effacé après l'instant de la sauvegarde, et constater qu'`account:list-erasures --since=<instant>
  --execute` le ré-efface. Vérifier au passage que le premier objet `effacements/…` apparaît bien
  dans `vps-sauvegardes/takussan-preview-private/effacements/` après la copie nocturne.

## Notes d'implémentation

- **L'objet s'écrit AVANT l'effacement, hors transaction, et un échec annule tout** — et non
  « après le commit, échec journalisé ». Raisons : (1) écrit après le commit, un échec scellerait
  un effacement sans trace, exactement le compte qu'une restauration ramènerait sans que personne
  le sache, et un `Log::error` ne le rattrape pas ; (2) écrit en fin de transaction, un seau en
  panne ferait partir à chaque passage horaire le courriel « votre compte est supprimé »
  (`AccountDeletionExecutedNotification` part **en synchrone** depuis `anonymize()`, avant l'écriture).
  Écrit en premier, un échec sort avant tout effet : `executed_at` reste nul, `account:execute-deletions`
  journalise (TCK-741), sort en 1, et retente au passage suivant. Le seul écart restant — un objet
  pour une transaction qui échoue ensuite — est sans danger : la demande est échue, elle sera
  exécutée, et le rejeu est idempotent.
- **Un seul chemin d'exécution** : `AccountDeletionService::executeDeletion()` (appelé par
  `account:execute-deletions` ; l'effacement par un opérateur, TCK-600, passe par la même demande).
  `privacy_requests` n'exécute rien : c'est un registre.
- La branche « demande sans compte résolu » (`$request->user === null`) n'écrit rien : elle
  n'efface rien (comportement de TCK-080, inchangé).
- **`account:list-erasures`** (domaine `account:`, voisin d'`account:execute-deletions`) : lit la
  liste, dit pour chaque compte `effacé` / `absent` / `à ré-effacer` dans la base courante ;
  `--since` borne à l'instant restauré (inclus) ; `--execute` ré-efface par `executeDeletion()` en
  recréant la demande perdue (datée de l'effacement d'origine), **sans renvoyer le courriel**
  (paramètre `notifier: false`, ajouté pour ce seul usage). Un objet illisible fait sortir en 1.
  Le ré-effacement écrit un nouvel objet ; la lecture garde un compte une fois, au plus ancien.
- Ni `docs/features.md` ni `docs/models-spec.md` n'ont de ligne à prendre : la liste n'est pas un
  modèle, et la spec de l'effacement ne décrit pas la procédure de restauration.
