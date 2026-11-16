# ADR-0084 — Hors du Radar, une empreinte HMAC sous `APP_KEY` s'écrit sous la clé courante et se lit aussi sous chaque clé d'`APP_PREVIOUS_KEYS`

- **Statut** : Accepté — décision de la session du 2026-10-30, validée par le porteur le 2026-11-01
- **Date** : 2026-10-30
- **Tickets** : [TCK-2430](../backlog/tickets/done/TCK-2430-empreintes-sous-app-key-hors-radar.md) ; la clé d'empreinte distincte et le ré-chiffrement restent à [TCK-614](../backlog/tickets/todo/TCK-614-rotation-d-app-key-et-cle-d-empreinte-distincte.md)
- **Amendement du 2026-11-16 ([TCK-614](../backlog/tickets/todo/TCK-614-rotation-d-app-key-et-cle-d-empreinte-distincte.md))** : les empreintes s'écrivent désormais sous une clé distincte, `APP_HMAC_KEY` ; `APP_KEY` et `APP_PREVIOUS_KEYS` restent lues comme clés héritées ; `security:rehash-fingerprints` réécrit ce qui se recalcule, `security:reencrypt` ré-chiffre les colonnes, et une ancienne `APP_KEY` peut enfin quitter `APP_PREVIOUS_KEYS`. Les liens de réclamation du Radar (`ClaimLinks`) restent sous `APP_KEY`. Voir [§ Amendement du 2026-11-16](#amendement-du-2026-11-16--la-clé-dempreinte-distincte-et-le-retrait-dune-ancienne-app_key-tck-614).
- **Dépend de** : [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) §1 (rotation d'`APP_KEY`, clé distincte pour une empreinte), [ADR-0082](0082-l-empreinte-des-refus-du-radar-a-sa-propre-cle.md) (le patron : écrire sous la clé courante, lire sous toutes)

## Contexte

Mesuré le 2026-10-30 sur `fix/empreintes-hors-radar-cle-dediee` (depuis `dev` `9f7bffea9`). Hors du Radar, les sites du
tableau ci-dessous calculaient chacun un `hash_hmac('sha256', …, config('app.key'))`. Laravel relit `APP_PREVIOUS_KEYS` pour déchiffrer
et pour vérifier une URL signée, jamais pour ces HMAC. Faire tourner `APP_KEY` rendait donc chaque empreinte en base
méconnaissable.

| Empreinte | Vit | Ce qu'une rotation cassait | Sens de la panne |
|---|---|---|---|
| `AlertSubscriber::contactHash()` | en base, tant que la demande vit | la désinscription laissait vivantes les demandes d'avant ; ni le rattachement à un compte ni la suppression du compte ne les trouvaient | **ouvert, durable** : des envois après une désinscription |
| `AlertSubscriber::mailboxHash()` | en base | les plafonds par boîte (5 ouvertes, 2 confirmations par 24 h) repartaient de zéro | ouvert, borné |
| `PhoneFingerprint::of()` (`credit_welcome_grants`) | en base, **après l'anonymisation du compte** | un numéro déjà crédité recevait une seconde bienvenue | **ouvert, durable, financier** |
| `PayoutMethod::fingerprint()` | dans `payouts.metadata` | un versement approuvé avant la rotation ne partait plus | fermé |
| `VisitNotifier` (plafond SMS de visite) | cache, 24 h au plus | compteurs remis à zéro | ouvert, borné à la fenêtre |
| `VisitorFingerprint` | 24 h (signalement d'un bien) ; avec l'avis (signalement, `ip_hash`) | un visiteur anonyme signale une fois de plus le même avis ; rapprochement d'IP perdu sur l'historique | ouvert, borné à un signalement |
| `WebhookJournal::bodyDigest()` | en base, 90 jours | aucun lecteur : la colonne n'est qu'écrite | sans effet |
| `PhoneVerificationService` (code haché) | cache, quelques minutes | codes en cours invalidés | fermé |

## Décision

**Une empreinte HMAC sous `APP_KEY` s'écrit sous la clé courante (`AppKeyHmac::of()`) ; une lecture qui décide d'un
droit la cherche sous la clé courante puis sous chaque clé d'`APP_PREVIOUS_KEYS` (`AppKeyHmac::all()`). Aucune clé
neuve, aucune variable d'environnement neuve.**

Retenu / écarté / raison :

1. **Lecture sous `APP_PREVIOUS_KEYS`** / une clé dédiée (`APP_HMAC_KEY`, TCK-614) dès ce ticket / ADR-0044 exige
   déjà de garder l'ancienne clé dans `APP_PREVIOUS_KEYS` jusqu'au ré-chiffrement, qui n'existe pas encore : la lecture
   tolérante ne coûte aucun secret de plus et rend une rotation sûre dès aujourd'hui. Une clé dédiée posée seule
   produirait la même perte qu'une rotation (le numéro d'un compte anonymisé ne se recalcule pas), et demande le
   repli que voici de toute façon.
2. **Une désinscription gagne toujours** : `eraseContact()` supprime sous l'empreinte stockée de la ligne ET sous
   toutes les empreintes reconnues de son contact. Un contact qui ne se déchiffre plus (ancienne clé perdue) n'empêche
   pas la désinscription : elle aboutit sous l'empreinte stockée (vérification adverse I1). Pour un abonné WhatsApp,
   la ligne `whatsapp_contacts` qu'avait posée l'alerte ne se retrouve plus sans le numéro en clair : la
   désinscription aboutit quand même (les demandes partent, plus rien n'est envoyé au titre de l'alerte), mais ce
   consentement reste en base (vérification adverse I2). Ce cas n'arrive que si l'ancienne clé a été perdue, contre la
   consigne ci-dessous. Le rattachement (`SavedSearchController::claim()`) et la
   suppression du compte (`AccountDeletionService`) cherchent de même.
3. **Les plafonds comptent sous toutes les clés** (`mailboxHashes()`). Le limiteur horaire par boîte vit une heure
   dans le cache : il repart sous la clé courante, borné.
4. **Le crédit de bienvenue cherche un octroi sous toutes les clés avant d'insérer** ; trouvé, rien n'est inséré.
   L'index unique de `phone_hash` garde la course entre deux octrois sous la clé courante. La relance d'activation
   du Radar, qui annonce les crédits à venir, lit de même.
5. **Le versement approuvé accepte l'empreinte approuvée sous une ancienne clé** (`PayoutMethod::fingerprints()`) :
   la même destination, rien de plus ; une destination changée reste refusée.
6. **Rien pour les autres empreintes du tableau** (plafond SMS de visite, empreinte de visiteur, empreinte du corps d'un webhook,
   code SMS) : leur panne est bornée à une fenêtre ou sans effet de droit. Ils passent par `AppKeyHmac::of()`,
   l'unique point qui calcule une empreinte sous `APP_KEY` hors du Radar.
7. **Une clé est lue telle qu'écrite ET sous sa forme base64 canonique** / la lire telle qu'écrite seulement, ou
   refuser une clé mal recopiée / Laravel lit une clé `base64:` par ses octets : recopiée sans son `=` final, elle
   déchiffre encore, et plus aucune empreinte écrite sous elle n'était reconnue, sans bruit (vérification adverse M3).
   La tolérance ne coûte rien à l'exploitant ; refuser la clé couperait le déchiffrement que Laravel accepte.
   L'écriture garde la chaîne telle qu'écrite. `RadarPhone` et `ClaimLinks` (ADR-0082) n'ont pas cette tolérance :
   la consigne « à l'identique » vaut pour eux.
8. **Pas de réécriture des empreintes anciennes** / une commande qui les réécrit sous la clé courante / tant que le
   ré-chiffrement d'ADR-0044 n'existe pas, l'ancienne clé ne quitte de toute façon pas `APP_PREVIOUS_KEYS` ; la
   réécriture va avec lui, dans TCK-614.

### Consigne de rotation

- **Faire tourner `APP_KEY`** : la neuve dans `APP_KEY`, l'ancienne **en tête** d'`APP_PREVIOUS_KEYS`, les plus
  anciennes derrière. Rien d'autre à lancer.
- **Une ancienne `APP_KEY` ne quitte jamais `APP_PREVIOUS_KEYS` tant que TCK-614 n'est pas livré** : sans elle, les
  colonnes chiffrées sous elle deviennent illisibles (ADR-0044), une désinscription redevient partielle, et chaque
  numéro crédité sous elle peut recevoir une seconde bienvenue.
- **Même après TCK-614**, un octroi de bienvenue dont le compte a été anonymisé ne se réécrit pas : son numéro
  n'existe plus. Retirer la clé qui l'a écrit rend une bienvenue à chacun de ces numéros. C'est une perte financière
  bornée (le montant de bienvenue par numéro), à peser au moment de retirer la clé.

## Conséquences

- **Une rotation d'`APP_KEY` est sûre dès aujourd'hui pour les alertes, la bienvenue et les versements**, pourvu que
  l'ancienne clé reste dans `APP_PREVIOUS_KEYS`.
- **Une clé fuitée reste en service** tant qu'elle figure dans `APP_PREVIOUS_KEYS` : Laravel s'en sert déjà pour
  déchiffrer et pour vérifier une URL signée. Ce n'est pas nouveau, puisqu'ADR-0044 l'exige pour les colonnes
  chiffrées. Mais cet ADR y ajoute une raison de plus de la garder. La clé distincte de TCK-614 sépare les deux.
- **Une lecture coûte un `whereIn` d'une empreinte par clé reconnue** (deux dans le cas courant), servi par les index
  existants (`alert_subscribers_contact_idx`, `credit_welcome_grants_phone_hash_unique`).
- **ADR-0044 §1 reste vrai sur le fond** : une empreinte devrait vivre sous une clé distincte d'`APP_KEY`. Cet ADR
  ne l'abroge pas : il rend la situation existante sûre en attendant TCK-614.

## Application

- `App\Support\AppKeyHmac` : `of()` (écriture), `all()` (lecture).
- `AlertSubscriber` : `contactHash()`, `contactHashes()`, `mailboxHash()`, `mailboxHashes()`, `scopeForContact()`,
  `eraseContact()` ; lecteurs : `SavedSearchController::claim()`, `AccountDeletionService`,
  `RecordPublicSearchAlert`.
- `PhoneFingerprint` : `of()`, `all()` ; lecteurs : `WelcomeCreditService::grant()`,
  `RadarActivationReminders::welcomeCredits()`.
- `PayoutMethod::fingerprints()` ; lecteur : `PayoutService::assertApprovedDestination()`.
- `VisitNotifier`, `VisitorFingerprint`, `WebhookJournal::bodyDigest()`, `PhoneVerificationService` : `AppKeyHmac::of()`.
- Garde : `tests/Unit/Architecture/AppKeyHmacPointUniqueTest` balaie `app/`, `config/`, `database/`, `routes/` et
  `bootstrap/` et refuse, hors d'`AppKeyHmac`, `RadarPhone`, `ClaimLinks` (ADR-0082) et `config/app.php` : les chaînes
  `app.key`, `app.previous_keys`, `APP_KEY`, `APP_PREVIOUS_KEYS` ; le tableau `app` (`config('app')`, `\config('app')`,
  `Config::get('app')`, `config()->get('app')`, `('app')[…]`, `['app']['key']`) ; `->getKey()` ou `?->getKey()` juste
  derrière `app('encrypter')`, `app(…Encrypter::class)` ou `Crypt::getFacadeRoot()` ; `Crypt::getKey()` ;
  `getPreviousKeys`, `getAllKeys`. **C'est un plancher**, et son docblock nomme ce qu'elle ne voit pas : la
  concaténation (`config('app.'.$k)`, `['app'][$k]`), un chiffreur rangé dans une variable ou injecté puis
  `->getKey()`, le tableau `app` obtenu par un autre chemin (`app('config')->all()`). Faux positifs acceptés :
  `'APP_KEY'` dans une liste de noms, un `getAllKeys()` sans rapport (le fichier va alors dans `PERMIS`, avec sa raison).
- Épreuves, chacune passée par une ablation : `SearchAlertAppKeyRotationTest`, `AppKeyHmacTest`,
  `WelcomeCreditOncePerPhoneTest::test_ac2_…`, `PayoutBypassTest::test_m4_une_rotation_…`,
  `RadarActivationReminderTest::test_un_numero_credite_avant_une_rotation_…`, `PhoneFingerprintTest::test_all_…`.

## Amendement du 2026-11-16 — la clé d'empreinte distincte, et le retrait d'une ancienne `APP_KEY` (TCK-614)

Décision du porteur du 2026-11-16, **option (a)** : les empreintes HMAC de ce document passent sous une clé distincte,
`APP_HMAC_KEY` ; la signature des liens de réclamation du Radar (`ClaimLinks`) reste sous `APP_KEY`. Cet amendement
remplace « aucune clé neuve » (Décision), le point 8 et la consigne de rotation ; il tient la promesse d'ADR-0044 §1
(« sous une clé **distincte** d'`APP_KEY` »).

### Décision

1. **Écriture sous `APP_HMAC_KEY`.** `AppKeyHmac::of()` calcule sous `config('app.hmac_key')` ; le nom de la classe
   est historique, elle reste le point unique (la renommer toucherait huit appelants pour rien). La clé se lit telle
   qu'écrite, sans la tolérance base64 du point 7 : elle n'a jamais servi à Laravel. Une clé vide ou absente vaut
   absente : **repli explicite sur `APP_KEY`**, c'est-à-dire le comportement d'avant cet amendement, à l'identique.
2. **Lecture : la clé dédiée, puis les clés héritées.** `AppKeyHmac::all()` cherche sous `APP_HMAC_KEY`, puis sous
   `APP_KEY` et chaque clé d'`APP_PREVIOUS_KEYS` (avec la tolérance du point 7). **Double lecture ET commande de
   recalcul, pas l'une ou l'autre** / la seule double lecture, ou la seule réécriture / certaines empreintes ne se
   recalculent jamais, comme l'octroi de bienvenue d'un compte anonymisé (numéro effacé). La double lecture garde ce
   qui passe par `all()` — alertes, bienvenue, versements, les lectures qui décident d'un droit (points 2 à 5) ; la
   commande réduit ce qui dépend encore des anciennes clés, et le compte. **Les sites qui n'appellent que `of()`**
   (`VisitorFingerprint`, `SearchJournal`, `WebhookJournal`, `VisitNotifier`, code SMS) **perdent une fois, à la pose
   de la clé**, ce qu'ils avaient écrit sous `APP_KEY` : codes SMS en cours invalidés, plafond SMS de visite remis à
   zéro, visiteurs du jour recomptés, un signalement d'avis de plus possible par visiteur anonyme, aucun lecteur pour
   le corps d'un webhook. Borné, sans effet de droit durable : le point 6 d'origine vaut toujours.
3. **`security:rehash-fingerprints {--dry-run}`, idempotente, jouée À LA MAIN une fois les conteneurs neufs démarrés.**
   Une **commande** et non une migration de données : une migration tourne pendant que les ANCIENS conteneurs servent
   (le release précède le démarrage), or l'ancien code ne lit que sous `APP_KEY` : réécrire alors lui rendrait les
   empreintes introuvables, et un retour d'image le rendrait durable. `docker/release.sh` ne la joue qu'**à blanc**
   (pour le refus du point 6). Après la réécriture, plus de retour à une image antérieure à TCK-614. Elle réécrit sous
   la clé courante :
   - `alert_subscribers.contact_hash` et `mailbox_hash`, recalculés depuis le `contact` déchiffré de la ligne ;
   - `credit_welcome_grants.phone_hash`, **seulement si** l'empreinte stockée figure parmi celles du numéro actuel de
     son titulaire (`PhoneFingerprint::all()`) ; sinon (compte anonymisé, numéro changé), la ligne est comptée
     `sans_source` et listée par son id ; une empreinte déjà prise par une autre ligne (index unique) est comptée en
     conflit, jamais réécrite ;
   - `payouts.metadata.approved_destination_fingerprint` des versements à venir (`PayoutStatus::upcoming()`),
     **seulement si** l'empreinte stockée figure parmi celles de la destination actuelle (`fingerprints()`). **C'est le
     point de sécurité** : recalculer depuis la destination courante blanchirait une destination changée depuis
     l'approbation. Une destination changée est comptée `changee` et reste refusée.
   Une source illisible est comptée et listée (modèle, id), jamais effacée. Elle écrit par `DB::table()` : ni
   observateur, ni journal d'audit, ni `updated_at`.
4. **`security:reencrypt {--dry-run} {--model=*}`** relit chaque valeur des colonnes chiffrées et la réécrit sous la
   clé courante. La liste des colonnes se **dérive des casts** (`encrypted*` et `AsEncrypted*`) de `app/Models`, par
   `App\Support\Security\ColonnesChiffrees`, que `backup:verify-encryption` partage. Elle travaille sur la chaîne
   chiffrée (`decryptString` sous toutes les clés, `encryptString` sous la courante), comme chacun de ces casts : un
   aller-retour par le cast réécrirait un JSON reformaté. « Déjà courante » se juge en déchiffrant sous la seule clé
   courante : c'est ce qui la rend idempotente. Une transaction par lot de 200 lignes ; une valeur indéchiffrable
   annule son lot entier, se nomme (modèle, id, colonne, **jamais la valeur**) et fait sortir la commande en échec.
   Chaque écriture compare l'ancienne valeur (`WHERE colonne = ancienne`) : une ligne réécrite entre-temps par
   l'application est laissée, elle l'est déjà sous la clé courante. Elle refuse de tourner quand
   `APP_PREVIOUS_KEYS` est vide : il n'y a rien à ré-chiffrer.
5. **`ClaimLinks` reste sous `APP_KEY`** (décision du porteur, a). C'est une signature à durée de vie bornée, pas une
   empreinte : une rotation la garde valide tant que l'ancienne clé est dans `APP_PREVIOUS_KEYS` ; le **retrait** de
   cette clé invalide les liens émis sous elle, que l'annonceur redemande. **Le repli de `RadarPhone` sur `APP_KEY`
   ne change pas** : il relève d'ADR-0082, qui interdit de le modifier (des refus purgés en dépendent).
6. **Le déploiement est refusé sans la clé.** Hors `local` et `testing` (préproduction en `staging` comprise),
   `security:rehash-fingerprints --dry-run` sort en 2 quand `APP_HMAC_KEY` manque, et `release.sh` arrête alors le déploiement
   avant que les services ne démarrent. Au démarrage du code de l'application, rien ne lève : le repli sur `APP_KEY`
   reste vrai pour un conteneur lancé hors de `release.sh`.

### Consigne de rotation (remplace celle ci-dessus)

- **Poser `APP_HMAC_KEY`** (`openssl rand -base64 48`), une valeur par environnement, rangée hors du serveur comme
  `APP_KEY`. Elle ne tourne pas : elle n'a pas d'`APP_HMAC_PREVIOUS_KEYS`. La faire tourner (après une fuite) demandera
  un ADR, car les empreintes non recalculables écrites sous elle seraient perdues.
- **Après la pose**, une fois les conteneurs neufs démarrés : `php artisan security:rehash-fingerprints` (puis
  `--dry-run` : `reecrites=0`).
- **Faire tourner `APP_KEY`** : la neuve dans `APP_KEY`, l'ancienne en tête d'`APP_PREVIOUS_KEYS`, redéployer, puis
  `security:rehash-fingerprints` (sans effet si la clé dédiée était déjà posée et la commande jouée). Puis `php artisan security:reencrypt --dry-run`, puis sans `--dry-run`
  jusqu'à une sortie en 0, puis une seconde fois : elle ne doit plus rien réécrire.
- **Retirer l'ancienne `APP_KEY`** d'`APP_PREVIOUS_KEYS` seulement alors, après avoir relu le dernier bilan de
  `security:rehash-fingerprints` : ses `sans_source` sont ce que le retrait perd (une seconde bienvenue possible par
  numéro anonymisé, une désinscription d'alerte qui ne trouve plus une demande illisible), et les liens de
  réclamation du Radar émis sous elle tombent. Les jobs en file chiffrés sous elle doivent avoir été consommés, et
  les entrées de cache chiffrées à la main (secret 2FA en renouvellement, 10 min ; code vocal, minutes) expirées.
  Procédure pas à pas : `docs/infra/hebergement.md`.

### Application (amendement)

- `config/app.php` : `hmac_key` (`APP_HMAC_KEY`) ; `.env.example` et `.env.docker` (commentée) ; gabarit
  `deploy/takussan/env.api.production.example` ; action de déploiement
  `docs/deploiement/actions/2026-11-16-cle-d-empreinte-app-hmac-key.md`.
- `App\Support\AppKeyHmac` (`of`, `all`, `hasDedicatedKey`) ; `App\Support\Security\ColonnesChiffrees` ;
  `security:rehash-fingerprints`, `security:reencrypt` ; `docker/release.sh`.
- Garde `AppKeyHmacPointUniqueTest` : `app.hmac_key` et `APP_HMAC_KEY` ne se lisent que dans `AppKeyHmac` et
  `config/app.php` ; `security:reencrypt` est permise (elle lit les clés du chiffreur pour juger « déjà courante »).
- Épreuves : `AppKeyHmacTest`, `HmacKeyRotationTest`, `ReencryptCommandTest`,
  `PayoutBypassTest::test_tck614_…`.
