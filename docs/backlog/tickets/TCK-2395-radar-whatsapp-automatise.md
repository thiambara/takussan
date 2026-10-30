---
id: TCK-2395
title: "Radar lot 5 : démarchage par l'API WhatsApp Cloud sur un numéro dédié, réponses reçues par webhook et preuve par identifiant de message"
status: doing
phase: P3
family: back
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-30
depends_on: [TCK-2388]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#54-whatsappcontact-"
tags: [api, radar, whatsapp, webhook, adr-0077]
---

## Objectif utilisateur

Le démarchage passe à l'échelle : les messages partent sans geste manuel, les réponses arrivent
seules, et l'accord est prouvé par l'identifiant du message.

## Contexte

Lot 5 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots), canal « automatisé »
d'ADR-0077 § 5. L'envoi par l'API Cloud existe (`CloudApiWhatsappDriver`, TCK-282), pas la
réception (le modèle `WhatsappContact` l'annonce « future »).

Re-mesuré le 2026-10-30 sur `feat/radar-revocation-purge` (`dev` + TCK-2391) :

- `CloudApiWhatsappDriver` lit ses identifiants dans l'intégration `whatsapp_cloud` (agence, ou
  plateforme) par `IntegrationLocator` : c'est le numéro des notifications.
- Le webhook WhatsApp existant (`webhooks/whatsapp/status/{token}`, TCK-283) ne lit que les
  accusés de livraison ; il passe par le journal des webhooks (`webhook.journal`, TCK-602).
- Le schéma du Radar attend déjà ce lot : `radar_outreaches.channel` (défaut `whatsapp_manual`),
  `radar_consents.provider_message_id`, le cas `RadarConsentProof::ProviderMessage`, et l'usage
  `radar.verification_accord` qui joue `raisonnement` sans capture.
- `VerifyRadarConsentReply` exige une capture (`radar.verification.no_capture`) ; le prompt `v1`
  ne parle que de captures.

## Contraintes strictes (métier)

- **Numéro Meta distinct de celui des notifications**, configuré à part ; aucun chemin de code ne
  peut envoyer un message du Radar par le numéro des notifications.
- Modèle de message validé par Meta, clauses fixes identiques à la v1 manuelle.
- Webhook entrant signé, journalisé avant traitement (journal des webhooks existant).

## Delta à produire

- [ ] **Le numéro du Radar** : `config/radar_whatsapp.php`, lu dans l'environnement et vide par
      défaut (identifiant du numéro, jeton, trois secrets du webhook), pilote `log` par défaut.
      Un pilote `cloud` propre au Radar, qui ne lit QUE cette configuration, et refuse un identifiant
      de numéro égal à celui d'une intégration des notifications.
- [ ] **L'envoi par l'API** : `POST /api/admin/radar/outreaches/{outreach}/send` envoie le gabarit
      Meta de la version de clauses du message ; ses paramètres sont les parties variables du texte
      enregistré (salutation, résumé, liens), dans l'ordre du fichier de clauses. Mêmes règles que
      « J'ai envoyé » ; le message garde `channel = whatsapp_cloud` et l'identifiant rendu par Meta.
      `php artisan radar:whatsapp-template` imprime le corps à soumettre à Meta.
- [ ] **Le webhook du Radar** : `webhooks/whatsapp/radar/{token}` (POST, et GET de vérification
      d'abonnement), jeton d'URL, signature `X-Hub-Signature-256` sous le secret de l'application
      du Radar, journal des webhooks avant traitement, rejouable.
- [ ] **La réponse reçue** : rattachée au message envoyé par l'API (par `context.id`, à défaut par
      le numéro), elle crée une réponse `provider_message` (identifiant du message reçu, texte en
      transcription), idempotente, puis met la vérification en file.
- [ ] **La vérification d'une réponse texte** par `radar.verification_accord` (prompt `v2`) : le
      modèle ne classe que la réponse ; le numéro (celui de l'expéditeur authentifié par Meta) et les
      clauses (envoyées par le gabarit) sont jugés par le code.
- [ ] **La confirmation humaine conservée** : rien ne change dans `recordOutcome`.

## Critères d'acceptation

- [ ] AC1 — **Un message du Radar ne part jamais par le numéro des notifications** (tests) :
      (a) numéro du Radar non configuré, intégration des notifications configurée → 422
      `radar.whatsapp.not_configured`, aucune requête HTTP, message toujours préparé ;
      (b) identifiant du Radar égal à celui d'une intégration `whatsapp_cloud` → 422
      `radar.whatsapp.same_number`, aucune requête ; (c) configuré → une seule requête, vers
      `/{identifiant du Radar}/messages`, avec le jeton du Radar ; (d) garde d'architecture : aucun
      fichier du Radar ne référence le pilote, le canal ni le localisateur d'intégration des
      notifications.
- [ ] AC2 — **Une réponse « OUI » reçue par le webhook crée une preuve à confirmer, avec
      l'identifiant du message** : `proof = provider_message`, `provider_message_id` = l'identifiant
      reçu, `verification_status = pending`, `confirmed_at` nul, sur le message envoyé par l'API ;
      la vérification part en file ; aucune annonce ne change d'étape.
- [ ] AC3 — **Webhook** : jeton faux → 404 ; secret vide, signature absente ou fausse → 403 ;
      chaque requête laisse sa ligne au journal (`whatsapp`, `whatsapp_cloud_radar`) ; le même
      identifiant reçu deux fois ne crée qu'une réponse ; un message adressé à un autre numéro que
      celui du Radar n'est pas lu ; une ligne authentifiée se rejoue par le même chemin.
- [ ] AC4 — **Envoi** : le texte obtenu en substituant les paramètres envoyés dans le corps du
      gabarit est exactement `message` ; le message passe envoyé avec l'identifiant de Meta, ses
      annonces `contacted` ; un refus franc de Meta n'écrit rien (502 `radar.whatsapp.send_failed`) ;
      un échec ambigu (délai, 5xx) marque envoyé sans identifiant (`provider_status = ambiguous`)
      pour ne jamais écrire deux fois au même annonceur.
- [ ] AC5 — **Vérification texte** : sans capture, le job joue `raisonnement`, le verdict porte
      `number_matches = true` et toutes les clauses (jugés par le code), et une réponse classée
      `consent` se confirme sans motif ; une réponse classée autrement exige un motif, comme une
      capture discordante.
- [ ] AC6 — **Le pilote par défaut n'envoie rien** sur le réseau.

## Hors périmètre

- Le démarchage manuel, qui reste disponible.
- L'écran de la console (bouton « Envoyer par l'API », réponse reçue en texte) : TCK-2426.
- Les accusés de livraison du numéro du Radar, et les cas d'évaluation texte : TCK-2427.

## Prérequis hors code, à la charge du porteur

- Un **numéro WhatsApp Business dédié au Radar**, dans une application Meta à part de celle des
  notifications, et son jeton d'utilisateur système.
- Le **gabarit `takussan_radar_accord_v2`** (fr, en) soumis et approuvé par Meta, avec le corps
  exact que rend `php artisan radar:whatsapp-template fr` (et `en`).
- Le webhook de l'application Meta du Radar abonné au champ `messages`, sur
  `https://<api>/api/webhooks/whatsapp/radar/<RADAR_WHATSAPP_WEBHOOK_URL_TOKEN>`.
- Les variables `RADAR_WHATSAPP_*` posées sur Dokploy, `RADAR_WHATSAPP_DRIVER=cloud` en dernier.
- La question de politique Meta (ADR-0077, « contexte ») : un premier message d'entreprise exige un
  consentement préalable du destinataire ; un numéro lu sur une annonce n'en est pas un.

## Notes d'implémentation

_(à remplir par implementing-specs)_
