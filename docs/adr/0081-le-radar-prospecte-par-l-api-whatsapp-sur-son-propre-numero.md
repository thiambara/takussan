# ADR-0081 — Le Radar prospecte par l'API WhatsApp sur son propre numéro : envoi synchrone sous verrou, ambigu vaut envoyé, STOP appliqué à la réception

- **Statut** : Accepté
- **Date** : 2026-10-30
- **Tickets** : TCK-2395 (lot 5 du [plan Radar et socle IA](../plans/2026-10-26-radar-et-socle-ia.md)) ; suites TCK-2426, TCK-2427
- **Dépend de** : [ADR-0077](0077-le-radar.md) § 5 (deux canaux ; le numéro des notifications ne prospecte jamais),
  [ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md) (journal des webhooks)

## Contexte

ADR-0077 § 5 prévoit un second canal de démarchage, l'API Cloud de Meta, sur un **numéro distinct** de celui
des notifications. Mesuré sur la branche le 2026-10-30 :

- **Le numéro des notifications vit dans une ligne `Integration`** (`whatsapp_cloud`), que lit
  `IntegrationLocator`. Son pilote (`CloudApiWhatsappDriver`) et son webhook (`WhatsappStatusController`) ne
  connaissent que les accusés de livraison : aucun message entrant n'est lu.
- **« J'ai envoyé »** (`RadarOutreachWorkflow::markSent`) rejuge toutes les règles d'envoi sous les verrous
  annonces → annonceur → message, puis écrit : `sent_at`, annonces `contacted`, décision de la suggestion.
- **Les réponses passaient toutes sous les yeux de l'opérateur**, qui les déposait lui-même (captures).
  Avec l'API, elles arrivent seules en base.
- **Le journal des webhooks** garde le corps brut, chiffré, 30 jours (`whatsapp`), pour le rejeu.
- **La politique de confidentialité promet** que le droit d'opposition s'exerce « en répondant STOP »,
  et qu'après un STOP « ne subsiste qu'une empreinte chiffrée de votre numéro ».
- **Meta** refuse un gabarit dont le corps commence ou finit par une variable, et un corps hydraté de plus de
  1024 caractères.

## Décision

**Le Radar envoie et reçoit par son propre numéro, configuré hors de toute `Integration` ; l'envoi se fait
sous les verrous de « J'ai envoyé », un échec ambigu vaut envoyé, et un STOP reçu révoque l'annonceur dès la
réception.**

1. **La configuration hors `Integration`.** Le numéro du Radar vit dans `config/radar_whatsapp.php`
   (`RADAR_WHATSAPP_*`), et nulle part ailleurs. Le code refuse (422 `radar.whatsapp.same_number`) un
   identifiant de numéro **ou un jeton** égal à celui d'une intégration WhatsApp des notifications, active ou
   non, supprimée comprise : un même jeton désigne la même application Meta, donc le même compte, qu'une
   restriction pour « spam » frappe en entier. Le pilote `log` (défaut, n'envoie rien) est refusé hors
   `local` et `testing` (422 `radar.whatsapp.not_configured`). Une garde d'architecture interdit à tout
   fichier du Radar de nommer le pilote, le canal, le localisateur ou le modèle `Integration` des
   notifications, et de router une notification vers le canal `whatsapp`.

2. **L'envoi est synchrone, sous les verrous de « J'ai envoyé ».** `markSent` reçoit l'envoi en fermeture,
   l'appelle après avoir rejugé toutes les règles et avant toute écriture. Un refus franc de Meta lève et
   n'écrit rien (502 `radar.whatsapp.send_failed`). Le texte envoyé est le texte enregistré, ou rien : le
   gabarit est le fichier de clauses, ses marqueurs numérotés, et le rendu doit redonner `message` (409
   `radar.whatsapp.message_mismatch`).

   **Une réponse non tranchée arrête tout envoi vers l'annonceur.** Rien ne part vers lui — ni préparation, ni
   envoi par l'API, ni « J'ai envoyé », quelle que soit l'annonce — tant qu'une de ses réponses reçues par l'API
   (`provider_message`) n'est ni confirmée ni pourvue d'une issue (409 `radar.outreach.reply_pending`, jugé sous
   le verrou de l'annonceur, dans l'ordre de verrous existant) : une opposition probable (« Stop svp ») vaut pour
   l'annonceur, pas pour une annonce. Une réponse par capture ne compte pas ; le canal manuel pur reste libre.

3. **Ambigu vaut envoyé.** Un délai dépassé ou un 5xx marque le message envoyé, sans identifiant
   (`provider_status = ambiguous`) : Meta a pu le remettre, et écrire deux fois au même annonceur expose le
   numéro aux signalements. De même, une écriture qui échoue **après** l'acceptation de Meta ne laisse pas le
   message « préparé » : `outreach_id` et l'identifiant de Meta sont journalisés avant toute écriture, puis le
   message est marqué envoyé, ambigu, avec cet identifiant, sans rappeler Meta.

4. **Le webhook est synchrone, et son corps ne survit pas au traitement.** Signé (`X-Hub-Signature-256` sous
   le secret de l'application du Radar), journalisé avant le contrôleur, idempotent sur l'identifiant du
   message. Une réponse devient une preuve **à confirmer** (`proof = provider_message`) ; seul
   `recordOutcome` confirme. Le corps d'une ligne du journal du Radar est **vidé à la clôture, quelle que
   soit l'issue** (`IntegrationWebhookLog::BODY_DROPPED_AT_CLOSE`) : il porte le texte, le numéro et le nom de
   profil de quiconque écrit au numéro, tiers compris. La ligne garde sa vue expurgée et ne se rejoue pas :
   Meta rejoue lui-même ce qu'il n'a pas vu accepté.

5. **Le STOP reçu est appliqué automatiquement.** Un texte qui vaut exactement STOP (aux espaces, à la casse
   et à la ponctuation finale près) applique `AdvertiserRevocation` dès la réception, sous l'ordre des verrous
   du Radar ; le message auquel il répond prend l'issue `stop`, sans auteur. Tout autre texte, refus compris,
   reste une réponse que l'opérateur tranche. Interrupteur : `RADAR_WHATSAPP_AUTO_STOP` (vrai par défaut).

### Options écartées

- **Une ligne `Integration` de plus pour le Radar** : `IntegrationLocator` la verrait, et une erreur de
  fournisseur ou d'agence suffirait à faire prospecter par le numéro des baux.
- **Un envoi en file** : le retour de Meta (identifiant ou refus) décide de ce qui s'écrit ; en file, il
  faudrait un état « en cours d'envoi » et une reprise qui risque le double envoi.
- **Ne rien écrire sur un échec ambigu** : le message resterait « préparé », et un second clic l'enverrait
  une seconde fois.
- **Garder le corps du journal 30 jours pour le rejeu** : contraire à la promesse de la politique après un
  STOP, et garde les messages de tiers qui n'ont rien demandé.
- **Laisser l'opérateur poser le STOP** : la réponse attend qu'un écran (TCK-2426) la montre ; la promesse
  « en répondant STOP » ne serait pas tenue entre-temps.
- **Un traitement du webhook en file** : volume faible ; Meta rejoue sur toute réponse autre que 200.

## Conséquences

- **Un appel HTTP se fait sous verrou de ligne** : un Meta lent tient les verrous de l'annonceur et du message
  autant (`timeout` de 10 s). Acceptable au volume du Radar ; à revoir si l'envoi devient massif.
- **Une ligne du Radar au journal ne se rejoue pas.** Un échec de traitement se rattrape par le rejeu de Meta,
  pas par la console.
- **Un STOP mal écrit (« stop svp ») n'est pas automatique** : il reste une réponse à trancher, et arrête
  tout envoi vers cet annonceur, quelle que soit l'annonce (règle 2), en attendant.
- **Le porteur doit** créer le numéro et l'application Meta du Radar, faire approuver le gabarit
  `takussan_radar_accord_v3` (clauses `accord.v3`, relues par l'avocat), abonner le webhook, poser les
  `RADAR_WHATSAPP_*` sur Dokploy et, en dernier, `RADAR_WHATSAPP_DRIVER=cloud`.

## Application

- `takussan-api/config/radar_whatsapp.php`, `app/Services/Radar/Whatsapp/` (`RadarWhatsappNumber`,
  `RadarWhatsappOutreach`, `RadarWhatsappInbox`, `RadarWhatsappTemplate`), `RadarOutreachWorkflow::markSent`,
  `RadarWhatsappWebhookController`, `IntegrationWebhookLog::BODY_DROPPED_AT_CLOSE`, `WebhookJournal::close`.
- Garde : `tests/Unit/Architecture/RadarNeProspectePasParLeNumeroDesNotificationsTest`.
- Tests : `tests/Feature/Radar/RadarWhatsappOutreachTest`, `tests/Feature/Radar/RadarWhatsappReplyTest`.
- Clés : `.env.example`, `.env.docker` (parité gardée par `scripts/check-env-parity.mjs` et
  `scripts/check-webhook-env-keys.mjs`), `docs/infra/hebergement.md`.
