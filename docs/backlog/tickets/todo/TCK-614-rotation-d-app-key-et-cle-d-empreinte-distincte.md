---
id: TCK-614
title: "`APP_KEY` se tourne sans rien perdre : clé d'empreinte distincte pour les recherches HMAC, commande de ré-chiffrement, sauvegarde et procédure écrites (ADR-0044, suites de TCK-599 et TCK-601)"
status: todo
phase: P1
family: technique
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
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

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** Le cœur du ticket — clé distincte, réécriture des empreintes,
`security:reencrypt` — reste à faire.

- **Fermé** : point unique d'empreinte et lecture sous les anciennes clés par TCK-2430 (ADR-0084,
  `App\Support\AppKeyHmac`) ; vérification de lisibilité d'une sauvegarde par TCK-882
  (`backup:verify-encryption`, lit sans écrire) ; `hebergement.md` porte la sauvegarde d'`APP_KEY`
  (`:125`) et la rotation **sans retrait** (`:332-347`).
- **Hors du point unique** : `ClaimLinks.php:104,115` (signature des liens Radar, HMAC sous `app.key`)
  et le repli de `RadarPhone` sur `app.key` (`:254,272`). 17 modèles à cast chiffré (et non 12).
- **Reste** : amender ADR-0044 (ou ADR-0084) ; `APP_HMAC_KEY` (config, `.env.example`, `.env.docker`,
  gabarits `deploy/takussan/env.*.production.example`) et `AppKeyHmac` qui bascule dessus ; migration
  des empreintes ; `security:reencrypt` (réutiliser la découverte de `BackupVerifyEncryption`) ;
  procédure de **retrait** d'une ancienne clé. Patron à suivre : `RADAR_PHONE_HMAC_KEY` +
  `radar:rehash-phones` (ADR-0082).
- **Mise en prod** : variable `APP_HMAC_KEY` à poser dans Dokploy (préproduction, puis production F3).
- **Décision attendue du porteur** (légère) : les liens `ClaimLinks` (signature, pas empreinte)
  **(a)** restent sous `APP_KEY` et une rotation les invalide, ou **(b)** passent sous `APP_HMAC_KEY` ?
- **Décision du porteur (2026-11-16) : option (a).** Les empreintes HMAC recensées ici (alertes, bienvenue,
  versements, plafonds, signalements, journaux) passent sous une clé distincte, `APP_HMAC_KEY` ; les liens de
  réclamation du Radar (`ClaimLinks`) restent signés sous `APP_KEY`, et le retrait d'une ancienne `APP_KEY` invalide
  ceux émis sous elle. La rotation d'`APP_KEY` reste possible par `APP_PREVIOUS_KEYS` sans rien casser de chiffré.

## Objectif utilisateur

Le porteur peut changer la clé de l'application (fuite, départ d'une personne, incident) sans rendre
illisible un RIB ni perdre un abonné aux alertes, et sait la sauvegarder et la restaurer.

## Contexte

[ADR-0044](../../../adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)
(TCK-601) chiffre des colonnes sous `APP_KEY` et renvoie la commande de ré-chiffrement « au ticket qui
fera la première rotation ». Il écrit aussi : « **Pas d'empreinte HMAC** […] Si le besoin naît, ce sera
une colonne `<col>_hmac` (HMAC-SHA256 sous une clé **distincte** d'`APP_KEY`), par ADR. » Le besoin est
né, et la clé distincte n'a pas été posée. `BILAN-FINAL.md` (« Au porteur, en priorité », point 2) :
« Les empreintes HMAC […] ne sont pas couvertes par `APP_PREVIOUS_KEYS`. La commande de rotation
d'ADR-0044 n'existe pas encore. Sauvegarder la clé. » ADR-0050, décision 2 (TCK-599) le note aussi.

**Re-mesure sur `839be671` (2026-10-08)** — `grep -rn "config('app.key')" app` :

> *2026-11-16* : les numéros de ligne ci-dessous ne pointent plus un `config('app.key')` : ces sites
> passent tous par `AppKeyHmac::of/all`. Les appelants sont huit fichiers : `AlertSubscriber`,
> `PayoutMethod`, `PhoneFingerprint`, `VisitorFingerprint`, `PhoneVerificationService`, `VisitNotifier`,
> `WebhookJournal` et **`SearchJournal`** (absent du tableau). Hors du point unique : `ClaimLinks`
> (`:104`, `:115`, HMAC sous `app.key` écrit à la main) et le **repli** de `RadarPhone` sur `app.key`
> (`:254`, `:272`, quand `RADAR_PHONE_HMAC_KEY` manque).

| Site | Durée de vie | Effet d'une rotation |
|---|---|---|
| `AlertSubscriber.php:79`, `:95` (contact, boîte) — TCK-599 | **persistant** (recherche par contact) | abonnés introuvables, désinscription impossible, borne par contact contournée |
| `PayoutMethod.php:68` (empreinte de destination) — TCK-594 | **persistant** (~~unicité,~~ vérification) | ~~doublons de destination non détectés~~ *(2026-11-16 : l'empreinte ne sert à aucune unicité ; seul le contrôle « destination approuvée » la lit, `PayoutService.php:264` et `:884-891` — un versement approuvé avant la rotation ne se paierait plus)* |
| `WebhookJournal.php:108` (empreinte du corps) — TCK-602 | persistant (90 j) | rejeu ou rapprochement par empreinte faux sur l'historique |
| `VisitNotifier.php:297` (borne SMS par numéro) — TCK-590 | cache horaire | borne remise à zéro, sans gravité |
| `VisitorFingerprint.php:26` (vues) — TCK-598 | cache court | compte de vues du jour, sans gravité |
| `PhoneVerificationService.php:294` (code) — TCK-589 | 5 min | codes en cours invalidés, sans gravité |

Et ~~**12**~~ **17** (relevé 2026-11-16) modèles portent un cast chiffré (`grep -rln "'encrypted'\|encrypted:array\|encrypted:object\|AsEncrypted"
app/Models`) : `APP_PREVIOUS_KEYS` les lit après une rotation, mais aucune commande ne les ré-chiffre,
donc aucune clé ne peut jamais quitter `APP_PREVIOUS_KEYS`. Aucune commande n'existe
(`ls app/Console/Commands | grep -i -E "encrypt|key"` : rien). `docs/infra/hebergement.md` cite
`APP_KEY` à la création de l'environnement (`:123`), jamais sa sauvegarde ni sa rotation.
*(2026-11-16 : `backup:verify-encryption` (TCK-882) lit et compte, aucune commande n'**écrit** ;
`hebergement.md` porte la sauvegarde hors VPS (`:125`) et la rotation sans retrait (`:332-347`).)*

**Mise à jour du 2026-10-30 ([TCK-2430](../done/TCK-2430-empreintes-sous-app-key-hors-radar.md),
[ADR-0084](../../../adr/0084-les-empreintes-sous-app-key-se-lisent-sous-ses-anciennes-cles.md))** — les empreintes sous
`APP_KEY` passent toutes par `App\Support\AppKeyHmac` (le point unique de la contrainte 2), et les lectures qui
décident d'un droit cherchent aussi sous `APP_PREVIOUS_KEYS` : alertes (désinscription, rattachement, suppression de
compte, plafonds), crédit de bienvenue (`PhoneFingerprint`, absent du tableau ci-dessus) et versement approuvé. Une
rotation avec l'ancienne clé gardée ne perd donc plus rien ; reste à ce ticket ce qui permet de **retirer** une ancienne
clé : la clé distincte, la réécriture des empreintes et le ré-chiffrement. Les octrois de bienvenue des comptes
anonymisés ne se réécrivent pas (numéro effacé) : la contrainte 3 doit les compter.

## Contraintes strictes (métier)

1. **Une clé d'empreinte distincte** (`APP_HMAC_KEY`, clé serveur, jamais `NEXT_PUBLIC_*`) sert
   **toutes** les empreintes persistantes ; `APP_KEY` ne sert plus qu'au chiffrement et aux
   signatures de Laravel. Les empreintes éphémères suivent la même clé, par simplicité.
2. **Un seul point** calcule une empreinte : `App\Support\Empreinte::de(string $contexte, string $valeur)`
   (contexte séparé de la valeur, comme les deux formes d'`AlertSubscriber`). Plus aucun
   `hash_hmac(…, config('app.key'))` dans `app/`. *(2026-11-16 : ce point unique existe déjà sous le
   nom `App\Support\AppKeyHmac` (`of`/`all`, TCK-2430) : le faire passer sur `APP_HMAC_KEY`, renommé
   ou non, plutôt que créer une seconde classe ; `ClaimLinks` et le repli de `RadarPhone` restent à
   trancher.)*
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

- [x] ADR-0044 amendé (contraintes 1, 4, 6).
- [x] `config/app.php` : `hmac_key` (`APP_HMAC_KEY`) ; `.env.example` et `.env.docker` : la clé
      (gardées par `scripts/check-env-parity.mjs`) ; démarrage refusé en production si elle manque.
- [x] `App\Support\Empreinte` ; les six sites du tableau y passent. — *2026-11-16 : les sites passent déjà
      par `AppKeyHmac` (TCK-2430) ; reste à le basculer sur `APP_HMAC_KEY`, `SearchJournal` compris.*
- [x] Migration de données : recalcul des empreintes persistantes (contrainte 3) — alertes, versements,
      bienvenue, journal des webhooks, journal de recherche.
- [x] Commande `security:reencrypt {--dry-run} {--model=*}` (contraintes 4, 5).
- [x] `docs/infra/hebergement.md` : procédure de sauvegarde et de rotation (contrainte 6). — sauvegarde et
      rotation sans retrait faites (`:125`, `:332-347`) ; reste la procédure de **retrait** d'une
      ancienne clé après `security:reencrypt`.
- [x] Tests : `EmpreinteTest`, `ReencryptCommandTest`, `HmacKeyRotationTest`.

## Critères d'acceptation

- [x] **AC1 (garde structurelle).** Un test balaie `app/` : aucune occurrence de `config('app.key')`
      hors du fournisseur de chiffrement de Laravel. *Une empreinte ajoutée demain sous `APP_KEY`
      rougit.* (2026-11-16 : la garde exempte `AppKeyHmac` ou son successeur et vise `ClaimLinks` et
      le repli de `RadarPhone`.)
- [x] **AC2 (rouge sur `839be671`).** Abonné aux alertes sans compte créé, puis `APP_KEY` changée
      (l'ancienne dans `APP_PREVIOUS_KEYS`) : la désinscription par son lien et la recherche par contact
      le retrouvent ; la borne par contact le compte toujours. — avec l'ancienne clé gardée : tenu par
      TCK-2430, relevé 2026-11-16. Reste : le même résultat **après `security:reencrypt` et retrait de
      l'ancienne clé** d'`APP_PREVIOUS_KEYS`.
- [x] **AC3.** ~~Même scénario pour une destination de versement : une seconde destination identique est
      encore refusée comme doublon après la rotation.~~ *(prémisse fausse, relevé 2026-11-16 : aucune
      unicité ne lit l'empreinte)* Un versement approuvé avant la rotation se paie après
      `security:reencrypt` et retrait de l'ancienne clé (contrôle `approved_destination_fingerprint`).
- [x] **AC4.** `security:reencrypt` après rotation : chaque valeur des modèles chiffrés se déchiffre
      **sans** `APP_PREVIOUS_KEYS` ; `--dry-run` n'écrit rien et compte ; une seconde exécution
      n'écrit rien (idempotente).
- [x] **AC5.** Un modèle ajouté demain avec un cast chiffré entre dans la commande sans la modifier
      (test sur un modèle de fixture).
- [x] **AC6.** Une valeur indéchiffrable : la commande sort en échec, la nomme (modèle, id, colonne,
      jamais la valeur), et n'a réécrit aucune ligne de ce lot.
- [x] Ablations consignées : un site rendu à `config('app.key')` → AC1 rouge ; recalcul des empreintes
      retiré → AC2 rouge.

## Hors périmètre

- Une rotation réelle en préproduction : elle se décide par le porteur, procédure en main.
- Le chiffrement de nouvelles colonnes.
- Les secrets des intégrations (chiffrés par le même cast : couverts par AC4, sans changement de forme).

## Notes d'implémentation

- Transition : **double lecture ET commande de recalcul**, pas l'une ou l'autre. Certaines empreintes ne se
  recalculent jamais (octroi d'un compte anonymisé) : `all()` les garde sous `APP_KEY`/`APP_PREVIOUS_KEYS` pour les
  lectures qui décident d'un droit (alertes, bienvenue, versements). Les sites en `of()` seul (visiteur, journal de
  recherche, webhook, plafond SMS, code SMS) perdent une fois, à la pose, ce qu'ils avaient écrit : borné, écrit dans
  l'action de déploiement. La « migration de données » est une **commande** idempotente
  (`security:rehash-fingerprints`) jouée à la main **après** le démarrage des conteneurs neufs : une migration (ou le
  release) tourne pendant que l'ancien code, qui ne lit que sous `APP_KEY`, sert encore.

## Livré (2026-11-16)

- `AppKeyHmac` (nom gardé : huit appelants) écrit sous `APP_HMAC_KEY` ; vide ou absente → **repli explicite sur
  `APP_KEY`** (le comportement d'avant). `.env.example` porte la clé **commentée** (la CI éprouve le repli, aucune
  valeur de test) ; les tests neufs posent `config(['app.hmac_key' => …])`. ADR-0084 amendé, ADR-0044 §1 renvoie.
- « Démarrage refusé » : hors `local`/`testing` (préproduction `staging` comprise), `security:rehash-fingerprints --dry-run`
  (le release ne la joue qu'à blanc) sort en 2 sans la clé et `docker/release.sh` arrête le déploiement avant que les services démarrent ; rien ne lève au
  démarrage du code (un `artisan` cassé partout aurait été pire). Action : `docs/deploiement/actions/2026-11-16-cle-d-empreinte-app-hmac-key.md`.
- Le recalcul ne **blanchit** rien : un octroi de bienvenue ou un versement approuvé n'est réécrit que si l'empreinte
  stockée est l'une de celles de la source actuelle ; sinon compté (`sans_source`, `changees`), jamais réécrit.
- `security:reencrypt` travaille sur la chaîne chiffrée, lot de 200 par transaction, écriture contre l'ancienne valeur ;
  colonnes dérivées des casts (`encrypted*` et `AsEncrypted*`) par `ColonnesChiffrees`, partagée avec `backup:verify-encryption`.
- `ClaimLinks` et le repli de `RadarPhone` inchangés (décision a ; ADR-0082) ; la garde les permet toujours et interdit
  désormais `app.hmac_key`/`APP_HMAC_KEY` hors `AppKeyHmac`.
- Preuves : AC1 `AppKeyHmacPointUniqueTest` (ablation : `VisitNotifier` rendu à `config('app.key')` → rouge) ;
  AC2 `HmacKeyRotationTest::test_ac2_*` (ablation : écritures du recalcul retirées → 2 rouges) ; AC3
  `PayoutBypassTest::test_tck614_ac3_*` (même ablation → rouge) et `test_tck614_le_recalcul_ne_blanchit_pas_*`
  (contrôle de source retiré → rouge) ; AC4-AC6 `ReencryptCommandTest` (ablation : lot réécrit malgré une illisible →
  AC6 rouge) ; `AppKeyHmacTest` (écriture rendue à `APP_KEY` → 2 rouges).
