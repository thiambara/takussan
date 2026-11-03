---
id: TCK-2427
title: "Radar : accusés de livraison du numéro WhatsApp du Radar, et cas d'évaluation des réponses reçues en texte"
status: done
phase: P3
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2395]
blocks: [TCK-2436]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, whatsapp, ia, adr-0077]
---

## Objectif utilisateur

L'opérateur sait si un message envoyé par l'API est arrivé, et la vérification des réponses texte est
mesurée comme celle des captures.

## Contexte

TCK-2395 envoie par l'API du numéro du Radar et lit les messages reçus sur son webhook
(`webhooks/whatsapp/radar/{token}`), mais :

- les **accusés de livraison** (`statuses` : `delivered`, `read`, `failed`) qui arrivent sur ce même
  webhook ne sont pas lus ; `radar_outreaches.provider_status` reste `accepted` ou `ambiguous` ;
- le prompt `v2` de `radar.verification_accord` classe une réponse texte, mais le jeu d'évaluation
  (`resources/ai/evals/radar.verification_accord`) ne porte que des captures : le texte n'est pas
  mesuré.

## Delta à produire

- [x] Lire les `statuses` du webhook du Radar : `provider_status` suit `delivered`, `read`, `failed`
      (avec le code Meta), apparié par `provider_message_id`. Un `failed` sur un envoi `ambiguous`
      dit qu'il n'est pas parti — seulement pour un envoi ambigu qui porte son identifiant (écriture défaite après
      l'envoi) ; un ambigu sans identifiant reste `ambiguous` (voir les décisions).
- [x] Des cas texte dans le jeu d'évaluation (accord, refus, STOP, question, ambigu, réponse en
      wolof) et le test du jeu étendu ; `php artisan ai:eval radar.verification_accord` joué par le
      porteur (appel payant) — **reste au porteur**, voir « Reste sur dev ».

## Critères d'acceptation

- [x] AC1 — Un accusé `failed` d'un message du Radar passe son `provider_status` à `failed`, journalisé.
      Prouvé par `RadarWhatsappReceiptTest` (`test_ac1_…`, 15 tests), ablations rouges.
- [x] AC2 — Le jeu d'évaluation joue les cas texte sur le rôle `raisonnement`.
      Prouvé par `RadarConsentVerificationEvalSetTest` (`test_un_jeu_a_blanc_…`, `test_chaque_cas_texte_…`), sur faux
      modèle ; ablation de `EvaluationRunner::roleOf()` rouge.

## Hors périmètre

- Le téléchargement des médias reçus (vocaux, images).

## Re-mesure (2026-10-30)

- Le webhook, `RadarWhatsappInbox` et `provider_status` (`accepted`, `ambiguous`) sont ceux que décrit TCK-2395 ; les
  `statuses` arrivaient et n'étaient pas lus (docblock de `RadarWhatsappWebhookController`).
- **Un envoi `ambiguous` par délai ou 5xx n'a PAS d'identifiant** (`RadarWhatsappOutreach`, `provider_message_id` nul) :
  apparié par `provider_message_id` seul, aucun accusé ne l'atteindrait, et « un `failed` sur un envoi `ambiguous` » ne
  vaudrait que pour l'envoi ambigu par écriture défaite (le seul qui garde l'identifiant). Une première version
  rattachait un accusé inconnu au seul envoi ambigu de l'annonceur (« adoption ») ; la vérification adverse l'a fait
  retirer (voir les décisions).
- La vue expurgée du journal des webhooks (`WebhookPayloadRedactor`, `whatsapp_cloud_radar`) lisait déjà les
  `statuses` (identifiant, statut, horodatage, code d'erreur, destinataire masqué), et le corps est vidé à la clôture.
- Le jeu d'évaluation exigeait des numéros `+22174…` dans chaque entrée ; une entrée texte n'en porte aucun
  (`textInput()`) : les cas texte n'ont donc aucun numéro, ni `+22174` ni `+22177` (que `check-ai-evals-pii.mjs`
  signalerait).

## Notes d'implémentation

- `App\Services\Radar\Whatsapp\RadarWhatsappReceipts` lit les `statuses` ; le contrôleur le joue avant
  `RadarWhatsappInbox`, et annote la ligne du journal (`event_type` `statuses` quand la requête ne porte que des
  accusés, `matched_count` = messages rangés + accusés appliqués).
- **Ordre** : `accepted`/`ambiguous` → `sent` → `delivered` → `read` ; `failed` remplace `accepted`, `ambiguous`, `sent`.
  Rien ne remplace `read` ni `failed`. Un doublon n'écrit rien.
- **Verrous** : l'annonceur, puis le message (sous-ensemble de l'ordre « annonces, annonceur, message ») ; deux accusés
  du même message se sérialisent. Un accusé reçu pendant l'envoi, avant que l'identifiant soit écrit, est ignoré comme
  tout identifiant inconnu : les accusés suivants de Meta mettent le statut à jour.
- **Identifiant inconnu** : ignoré, compté (`received`), `Log::info` par identifiant et statut seuls, jamais rattaché
  par inférence. `RadarWhatsappReceiptGuardTest` garde les deux scénarios qui ont fait retirer l'adoption (double envoi
  par la reprise m-3, message étranger sur le même numéro).
- **Journal** : `radar_whatsapp_delivery_failed` (identifiant, statut précédent, code Meta), jamais le texte
  de l'erreur ni le numéro ; `Log::warning` de même.
- Cas texte : 017 à 030, écrits par `resources/ai/evals/radar.verification_accord/text-cases.php` (déterministe).

### Décisions prises en autonomie, à revoir par le porteur

| Décision | Retenu | Écarté | Raison |
|---|---|---|---|
| Où garder le code Meta d'un `failed` | au journal d'activité (`provider_error_code`) et au `Log` | une colonne `provider_error` sur `radar_outreaches` | pas de migration ni de clé de ressource neuve ; une colonne s'ajoute plus tard si l'écran veut l'afficher |
| Journal d'activité | seulement les `failed` | chaque accusé | trois lignes par message pour `sent`/`delivered`/`read` noieraient le journal ; `provider_status` porte le dernier |
| `failed` après une remise | ignoré (`delivered`, `read` prouvent l'arrivée) | `failed` toujours gagnant, comme les notifications (`UpdateWhatsappDeliveryStatusJob`) | « un accusé ne fait jamais régresser un statut » ; un échec qui suit une remise la contredit, la remise est la preuve la plus forte |
| `failed` sur un envoi ambigu | `provider_status = failed`, `sent_at` gardé | défaire l'envoi (le rendre renvoyable) | l'opérateur juge ; défaire l'envoi rouvrirait un double envoi si l'accusé se trompe — réversible plus tard |
| Envoi ambigu sans identifiant (décision de la session déléguante après la vérification adverse, I-1) | un accusé d'identifiant inconnu est ignoré ; appariement exact futur par `biz_opaque_callback_data`, à vérifier dans la doc Meta avant tout usage (suite à ouvrir : TCK-2436) | l'« adoption » (rattacher l'accusé inconnu au seul envoi ambigu sans identifiant de l'annonceur), livrée puis retirée | reproduite par la vérification : l'accusé d'une relance dont l'écriture est défaite, adopté par un ancien ambigu, heurtait l'index unique et rouvrait le double envoi ; un message étranger au Radar sur le même numéro faisait d'un envoi jamais parti un message « lu » et y rattachait un « Oui » |
| Ordre webhook | les accusés avant les messages | l'inverse | un STOP de la même requête révoque, ce qui ne change rien à ce qui a été remis |
| Un STOP exact dans les cas d'évaluation | absent ; `stop` dit autrement | un cas « STOP » | un STOP exact n'arrive jamais au modèle (révoqué à la réception) |
| Accord partiel, consigne glissée | deux cas `ambiguous` en plus des six familles du ticket | s'en tenir aux six | ce sont les deux erreurs qui coûtent : un accord lu là où il n'y en a qu'un morceau, une injection |
| « Ok » seul (cas 030, demandé par la vérification, m-2) | `ambiguous` | `consent` | le prompt v2 ne tranche pas le « ok » nu ; « dans le doute, `ambiguous` » — étiquette à revoir par le porteur |
| Numéro fictif des tests des accusés | `+221 77 123 45 67`, expliqué en commentaire | `+221 74 …` (règle de la nuit, m-1) | `PhoneMasker` refuse le préfixe 74 ; consigne de la session déléguante |
| Numéros des cas texte | aucun | `+221 77 123 45 67` (consigne de la session) | l'entrée texte n'en porte pas, et `check-ai-evals-pii.mjs` signale le préfixe 77 dans un jeu d'évaluation |

## Reste sur dev

- **L'évaluation payante est jouée** (2026-10-30, par la session sur cette branche, commit de la référence) :
  0,9917 sur 30 cas, 0 échec, 237,90 XOF — vision 0,9844 sur 16 cas (`claude-sonnet-5-5`), raisonnement
  1,0000 sur 14 cas texte (`claude-opus-5-5`). La référence porte désormais les deux rôles.
