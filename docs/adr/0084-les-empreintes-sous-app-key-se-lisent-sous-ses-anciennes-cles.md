# ADR-0084 — Hors du Radar, une empreinte HMAC sous `APP_KEY` s'écrit sous la clé courante et se lit aussi sous chaque clé d'`APP_PREVIOUS_KEYS`

- **Statut** : Proposé — **décision de la session, prise en autonomie le 2026-10-30, à revoir par le porteur**
- **Date** : 2026-10-30
- **Tickets** : [TCK-2430](../backlog/tickets/TCK-2430-empreintes-sous-app-key-hors-radar.md) ; la clé d'empreinte distincte et le ré-chiffrement restent à [TCK-614](../backlog/tickets/TCK-614-rotation-d-app-key-et-cle-d-empreinte-distincte.md)
- **Dépend de** : [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) §1 (rotation d'`APP_KEY`, clé distincte pour une empreinte), [ADR-0082](0082-l-empreinte-des-refus-du-radar-a-sa-propre-cle.md) (le patron : écrire sous la clé courante, lire sous toutes)

## Contexte

Mesuré le 2026-10-30 sur `fix/empreintes-hors-radar-cle-dediee` (depuis `dev` `9f7bffea9`). Hors du Radar, sept
sites calculent un `hash_hmac('sha256', …, config('app.key'))`. Laravel relit `APP_PREVIOUS_KEYS` pour déchiffrer
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
   toutes les empreintes reconnues de son contact. Le rattachement (`SavedSearchController::claim()`) et la
   suppression du compte (`AccountDeletionService`) cherchent de même.
3. **Les plafonds comptent sous toutes les clés** (`mailboxHashes()`). Le limiteur horaire par boîte vit une heure
   dans le cache : il repart sous la clé courante, borné.
4. **Le crédit de bienvenue cherche un octroi sous toutes les clés avant d'insérer** ; trouvé, rien n'est inséré.
   L'index unique de `phone_hash` garde la course entre deux octrois sous la clé courante. La relance d'activation
   du Radar, qui annonce les crédits à venir, lit de même.
5. **Le versement approuvé accepte l'empreinte approuvée sous une ancienne clé** (`PayoutMethod::fingerprints()`) :
   la même destination, rien de plus ; une destination changée reste refusée.
6. **Rien pour les quatre autres** (plafond SMS de visite, empreinte de visiteur, empreinte du corps d'un webhook,
   code SMS) : leur panne est bornée à une fenêtre ou sans effet de droit. Ils passent par `AppKeyHmac::of()`,
   l'unique point qui calcule une empreinte sous `APP_KEY` hors du Radar.
7. **Pas de réécriture des empreintes anciennes** / une commande qui les réécrit sous la clé courante / tant que le
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
- Garde : `tests/Unit/Architecture/AppKeyHmacPointUniqueTest` refuse un `config('app.key')` dans `app/` hors
  d'`AppKeyHmac`, `RadarPhone` et `ClaimLinks` (ADR-0082).
- Épreuves, chacune passée par une ablation : `SearchAlertAppKeyRotationTest`,
  `WelcomeCreditOncePerPhoneTest::test_ac2_…`, `PayoutBypassTest::test_m4_une_rotation_…`,
  `RadarActivationReminderTest::test_un_numero_credite_avant_une_rotation_…`, `PhoneFingerprintTest::test_all_…`.
