---
id: TCK-614
title: "`APP_KEY` se tourne sans rien perdre : clé d'empreinte distincte pour les recherches HMAC, commande de ré-chiffrement, sauvegarde et procédure écrites (ADR-0044, suites de TCK-599 et TCK-601)"
status: todo
phase: P1
family: technique
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#87-alertsubscriber-
    - docs/models-spec.md#76-payoutmethod-
tags: [back, infra, securite, chiffrement, hmac, app-key, rotation, adr-0044, sauvegarde]
---

# TCK-614 — `APP_KEY` se tourne sans rien perdre

## Objectif utilisateur

Le porteur peut changer la clé de l'application (fuite, départ d'une personne, incident) sans rendre
illisible un RIB ni perdre un abonné aux alertes, et sait la sauvegarder et la restaurer.

## Contexte

[ADR-0044](../../adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)
(TCK-601) chiffre des colonnes sous `APP_KEY` et renvoie la commande de ré-chiffrement « au ticket qui
fera la première rotation ». Il écrit aussi : « **Pas d'empreinte HMAC** […] Si le besoin naît, ce sera
une colonne `<col>_hmac` (HMAC-SHA256 sous une clé **distincte** d'`APP_KEY`), par ADR. » Le besoin est
né, et la clé distincte n'a pas été posée. `BILAN-FINAL.md` (« Au porteur, en priorité », point 2) :
« Les empreintes HMAC […] ne sont pas couvertes par `APP_PREVIOUS_KEYS`. La commande de rotation
d'ADR-0044 n'existe pas encore. Sauvegarder la clé. » ADR-0050, décision 2 (TCK-599) le note aussi.

**Re-mesure sur `839be671` (2026-10-08)** — `grep -rn "config('app.key')" app` :

| Site | Durée de vie | Effet d'une rotation |
|---|---|---|
| `AlertSubscriber.php:79`, `:95` (contact, boîte) — TCK-599 | **persistant** (recherche par contact) | abonnés introuvables, désinscription impossible, borne par contact contournée |
| `PayoutMethod.php:68` (empreinte de destination) — TCK-594 | **persistant** (unicité, vérification) | doublons de destination non détectés |
| `WebhookJournal.php:108` (empreinte du corps) — TCK-602 | persistant (90 j) | rejeu ou rapprochement par empreinte faux sur l'historique |
| `VisitNotifier.php:297` (borne SMS par numéro) — TCK-590 | cache horaire | borne remise à zéro, sans gravité |
| `VisitorFingerprint.php:26` (vues) — TCK-598 | cache court | compte de vues du jour, sans gravité |
| `PhoneVerificationService.php:294` (code) — TCK-589 | 5 min | codes en cours invalidés, sans gravité |

Et **12** modèles portent un cast chiffré (`grep -rln "'encrypted'\|encrypted:array\|AsEncrypted"
app/Models`) : `APP_PREVIOUS_KEYS` les lit après une rotation, mais aucune commande ne les ré-chiffre,
donc aucune clé ne peut jamais quitter `APP_PREVIOUS_KEYS`. Aucune commande n'existe
(`ls app/Console/Commands | grep -i -E "encrypt|key"` : rien). `docs/infra/hebergement.md` cite
`APP_KEY` à la création de l'environnement (`:123`), jamais sa sauvegarde ni sa rotation.

## Contraintes strictes (métier)

1. **Une clé d'empreinte distincte** (`APP_HMAC_KEY`, clé serveur, jamais `NEXT_PUBLIC_*`) sert
   **toutes** les empreintes persistantes ; `APP_KEY` ne sert plus qu'au chiffrement et aux
   signatures de Laravel. Les empreintes éphémères suivent la même clé, par simplicité.
2. **Un seul point** calcule une empreinte : `App\Support\Empreinte::de(string $contexte, string $valeur)`
   (contexte séparé de la valeur, comme les deux formes d'`AlertSubscriber`). Plus aucun
   `hash_hmac(…, config('app.key'))` dans `app/`.
3. **Migration des empreintes existantes** : recalculées depuis la valeur en clair (déchiffrée) sous la
   nouvelle clé, par lots, de façon idempotente ; une ligne dont la source n'est plus lisible est
   comptée et listée, jamais effacée en silence.
4. **Ré-chiffrement** : une commande relit chaque valeur chiffrée à travers son cast et la réécrit sous
   la clé courante, par lots, reprenable, avec `--dry-run` et un bilan par modèle ; elle refuse de
   tourner si `APP_PREVIOUS_KEYS` est vide (rien à faire) ou si une valeur ne se déchiffre sous aucune
   clé (bilan d'échec, aucune écriture partielle par ligne).
5. La liste des modèles chiffrés n'est pas écrite à la main : elle se dérive des casts.
6. ADR-0044 est amendé (clé d'empreinte, commande) **avant** le code ; `docs/infra/hebergement.md`
   porte la procédure (sauvegarde des deux clés hors de l'hébergeur, rotation pas à pas, restauration
   d'une base avec les clés de la même époque).

## Delta à produire

- [ ] ADR-0044 amendé (contraintes 1, 4, 6).
- [ ] `config/app.php` : `hmac_key` (`APP_HMAC_KEY`) ; `.env.example` et `.env.docker` : la clé
      (gardées par `scripts/check-env-parity.mjs`) ; démarrage refusé en production si elle manque.
- [ ] `App\Support\Empreinte` ; les six sites du tableau y passent.
- [ ] Migration de données : recalcul des empreintes persistantes (contrainte 3).
- [ ] Commande `security:reencrypt {--dry-run} {--model=*}` (contraintes 4, 5).
- [ ] `docs/infra/hebergement.md` : procédure de sauvegarde et de rotation (contrainte 6).
- [ ] Tests : `EmpreinteTest`, `ReencryptCommandTest`, `HmacKeyRotationTest`.

## Critères d'acceptation

- [ ] **AC1 (garde structurelle).** Un test balaie `app/` : aucune occurrence de `config('app.key')`
      hors du fournisseur de chiffrement de Laravel. *Une empreinte ajoutée demain sous `APP_KEY`
      rougit.*
- [ ] **AC2 (rouge sur `839be671`).** Abonné aux alertes sans compte créé, puis `APP_KEY` changée
      (l'ancienne dans `APP_PREVIOUS_KEYS`) : la désinscription par son lien et la recherche par contact
      le retrouvent ; la borne par contact le compte toujours.
- [ ] **AC3.** Même scénario pour une destination de versement : une seconde destination identique est
      encore refusée comme doublon après la rotation.
- [ ] **AC4.** `security:reencrypt` après rotation : chaque valeur des modèles chiffrés se déchiffre
      **sans** `APP_PREVIOUS_KEYS` ; `--dry-run` n'écrit rien et compte ; une seconde exécution
      n'écrit rien (idempotente).
- [ ] **AC5.** Un modèle ajouté demain avec un cast chiffré entre dans la commande sans la modifier
      (test sur un modèle de fixture).
- [ ] **AC6.** Une valeur indéchiffrable : la commande sort en échec, la nomme (modèle, id, colonne,
      jamais la valeur), et n'a réécrit aucune ligne de ce lot.
- [ ] Ablations consignées : un site rendu à `config('app.key')` → AC1 rouge ; recalcul des empreintes
      retiré → AC2 rouge.

## Hors périmètre

- Une rotation réelle en préproduction : elle se décide par le porteur, procédure en main.
- Le chiffrement de nouvelles colonnes.
- Les secrets des intégrations (chiffrés par le même cast : couverts par AC4, sans changement de forme).

## Notes d'implémentation

_(à remplir par implementing-specs)_
