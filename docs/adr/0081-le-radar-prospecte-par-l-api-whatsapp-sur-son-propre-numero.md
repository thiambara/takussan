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

## Amendement du 2026-10-30 — l'appariement exact d'un envoi ambigu par jeton opaque (TCK-2436)

**Contexte.** Un envoi ambigu par délai ou 5xx (§ 3) n'a pas d'identifiant : ses accusés, s'il est parti, arrivent
sous un identifiant inconnu, et TCK-2427 les ignore — jamais de rattachement par déduction (décision B3 du porteur,
scénarios gardés par `RadarWhatsappReceiptGuardTest`). L'API Cloud accepte à l'envoi un champ
`biz_opaque_callback_data` (512 caractères au plus) et le rend dans les `statuses`. Relevé le 2026-10-30 :
l'ancienne référence de l'objet message le dit rendu « *as part of sent/delivered/read message webhooks* » — `failed`
n'y figure pas ; la [référence actuelle des accusés](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status)
le place dans la syntaxe commune de `statuses` (« *Only included if message sent with biz_opaque_callback_data* »),
sans restriction de statut mais sans l'étendre explicitement à `failed`. Constat complet dans TCK-2436.

**Décision.** Chaque envoi par l'API porte un **jeton aléatoire** (`provider_callback_token`, 40 caractères
hexadécimaux, unique), transmis en `biz_opaque_callback_data`. Il est écrit sur la ligne préparée et **commité avant
les verrous et l'appel**, par une écriture isolée, puis relu sous le verrou et repris tel quel par l'appel et la reprise
de la § 3. Aucune donnée personnelle, jamais journalisé, jamais exposé par l'API, absent de la vue
expurgée du journal des webhooks (liste blanche). Un accusé dont l'identifiant est inconnu **et** qui porte ce jeton
rattache son envoi si, et seulement si, cet envoi est de l'API, envoyé, **sans identifiant**, et que le destinataire
de l'accusé (`recipient_id`) est le numéro de son annonceur ; l'identifiant de Meta est alors écrit sur la ligne et le
statut avance selon les règles de TCK-2427. Tout autre accusé reste ignoré, comme avant : sans jeton, jeton inconnu,
envoi déjà identifié ou jamais parti, autre destinataire, annonceur purgé, identifiant déjà porté par une autre ligne.

Ce n'est pas une déduction : le jeton désigne une ligne, et une seule. B3 tient : c'est le filtre `sent_at` qui
protège, un jeton sur une ligne préparée n'apparie rien.

**Pourquoi avant l'appel (vérification de TCK-2436, I-1).** Dans le cas qui justifie la règle, le délai dépassé, Meta
remet souvent le message pendant que l'appel attend : `sent` puis `delivered` arrivent jusqu'à 10 s avant la fin de
l'envoi. Un jeton écrit seulement avec les colonnes du canal n'est alors sur aucune ligne : l'accusé est ignoré, le
webhook répond 200 et Meta ne rejoue pas. Commité avant l'appel, il fait trouver l'annonceur par la recherche hors
verrou ; le verrou de l'annonceur, que « J'ai envoyé » tient pendant l'appel, fait attendre l'accusé jusqu'au commit de
l'envoi (au plus le délai de l'appel) ; il relit alors un message envoyé et l'apparie. Ordre des verrous : l'annonceur,
puis le message — un sous-ensemble de celui de l'envoi, sans interblocage. Un jeton resté sur une ligne refusée (502)
ou envoyée à la main est inerte (l'appariement exige l'API et `sent_at`) et l'essai suivant le reprend.

**Un annonceur qui a dit STOP sans être purgé garde son numéro** : l'accusé d'un envoi antérieur au STOP s'apparie
encore. C'est voulu : un accusé est un fait de remise, jamais un contact ni une preuve d'accord.

**Ce que la documentation ne garantit pas.** Un `failed` est apparié de même **s'il porte le jeton** ; sinon il reste
ignoré et l'envoi `ambiguous` — aucune perte par rapport à TCK-2427. Le porteur mesure sur le compte Meta du Radar si
un accusé `failed` porte le champ ; si oui, rien ne change dans le code.

**Options écartées.**

- **Un jeton signé dérivé de l'identifiant de la ligne** (sans colonne) : il lie l'appariement à `APP_KEY`, dont la
  rotation rendrait muets les accusés en vol ; un jeton tiré au hasard et gardé ne dépend de rien.
- **Écrire le jeton avec les colonnes du canal, après l'appel** (premier état de TCK-2436) : il épargnait une
  écriture et ne laissait aucun jeton sur une ligne refusée, mais perdait les accusés reçus pendant l'appel (I-1
  ci-dessus) — précisément ceux d'un délai dépassé.
- **Se fier au jeton seul, sans le destinataire** : un message étranger au Radar sur le même numéro, ou un jeton
  rejoué, n'a pas à pouvoir désigner un envoi d'accord.

**Application.** `database/migrations/2026_10_30_396360_add_provider_callback_token_to_radar_outreaches.php`,
`RadarWhatsappDriver::sendTemplate($to, $template, $callbackData)`, `RadarWhatsappOutreach`,
`RadarWhatsappReceipts::ambiguousByToken()`. Tests : `tests/Feature/Radar/RadarWhatsappReceiptCallbackTest`,
`RadarWhatsappReceiptGuardTest` (B3), `RadarWhatsappOutreachTest` (AC3).
