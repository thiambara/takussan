---
id: TCK-2395
title: "Radar lot 5 : démarchage par l'API WhatsApp Cloud sur un numéro dédié, réponses reçues par webhook et preuve par identifiant de message"
status: done
phase: P3
family: back
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-30
depends_on: [TCK-2388]
blocks: [TCK-2426, TCK-2427]
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

- [x] **Le numéro du Radar** : `config/radar_whatsapp.php`, lu dans l'environnement et vide par
      défaut (identifiant du numéro, jeton, trois secrets du webhook), pilote `log` par défaut.
      Un pilote `cloud` propre au Radar, qui ne lit QUE cette configuration, et refuse un identifiant
      de numéro égal à celui d'une intégration des notifications.
- [x] **L'envoi par l'API** : `POST /api/admin/radar/outreaches/{outreach}/send` envoie le gabarit
      Meta de la version de clauses du message ; ses paramètres sont les parties variables du texte
      enregistré (salutation, résumé, liens), dans l'ordre du fichier de clauses. Mêmes règles que
      « J'ai envoyé » ; le message garde `channel = whatsapp_cloud` et l'identifiant rendu par Meta.
      `php artisan radar:whatsapp-template` imprime le corps à soumettre à Meta.
- [x] **Le webhook du Radar** : `webhooks/whatsapp/radar/{token}` (POST, et GET de vérification
      d'abonnement), jeton d'URL, signature `X-Hub-Signature-256` sous le secret de l'application
      du Radar, journal des webhooks avant traitement, rejouable.
- [x] **La réponse reçue** : rattachée au message envoyé par l'API (par `context.id`, à défaut par
      le numéro), elle crée une réponse `provider_message` (identifiant du message reçu, texte en
      transcription), idempotente, puis met la vérification en file.
- [x] **La vérification d'une réponse texte** par `radar.verification_accord` (prompt `v2`) : le
      modèle ne classe que la réponse ; le numéro (celui de l'expéditeur authentifié par Meta) et les
      clauses (envoyées par le gabarit) sont jugés par le code.
- [x] **La confirmation humaine conservée** : rien ne change dans `recordOutcome`.

## Critères d'acceptation

- [x] AC1 — **Un message du Radar ne part jamais par le numéro des notifications** (tests) :
      (a) numéro du Radar non configuré, intégration des notifications configurée → 422
      `radar.whatsapp.not_configured`, aucune requête HTTP, message toujours préparé ;
      (b) identifiant du Radar égal à celui d'une intégration `whatsapp_cloud` → 422
      `radar.whatsapp.same_number`, aucune requête ; (c) configuré → une seule requête, vers
      `/{identifiant du Radar}/messages`, avec le jeton du Radar ; (d) garde d'architecture : aucun
      fichier du Radar ne référence le pilote, le canal ni le localisateur d'intégration des
      notifications.
- [x] AC2 — **Une réponse « OUI » reçue par le webhook crée une preuve à confirmer, avec
      l'identifiant du message** : `proof = provider_message`, `provider_message_id` = l'identifiant
      reçu, `verification_status = pending`, `confirmed_at` nul, sur le message envoyé par l'API ;
      la vérification part en file ; aucune annonce ne change d'étape.
- [x] AC3 — **Webhook** : jeton faux → 404 ; secret vide, signature absente ou fausse → 403 ;
      chaque requête laisse sa ligne au journal (`whatsapp`, `whatsapp_cloud_radar`) ; le même
      identifiant reçu deux fois ne crée qu'une réponse ; un message adressé à un autre numéro que
      celui du Radar n'est pas lu ; une ligne authentifiée se rejoue par le même chemin.
- [x] AC4 — **Envoi** : le texte obtenu en substituant les paramètres envoyés dans le corps du
      gabarit est exactement `message` ; le message passe envoyé avec l'identifiant de Meta, ses
      annonces `contacted` ; un refus franc de Meta n'écrit rien (502 `radar.whatsapp.send_failed`) ;
      un échec ambigu (délai, 5xx) marque envoyé sans identifiant (`provider_status = ambiguous`)
      pour ne jamais écrire deux fois au même annonceur.
- [x] AC5 — **Vérification texte** : sans capture, le job joue `raisonnement`, le verdict porte
      `number_matches = true` et toutes les clauses (jugés par le code), et une réponse classée
      `consent` se confirme sans motif ; une réponse classée autrement exige un motif, comme une
      capture discordante.
- [x] AC6 — **Le pilote par défaut n'envoie rien** sur le réseau.

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

- **L'envoi par l'API est « J'ai envoyé » dont le code fait l'envoi** : `RadarOutreachWorkflow::markSent()`
  reçoit un `$dispatch` appelé sous les verrous, toutes règles rejugées, avant toute écriture. Un appel
  HTTP borné à 10 s sous le verrou de l'annonceur : ADR-0077 n'interdit sous verrou que le modèle. Un
  refus franc lève et la transaction n'écrit rien ; aucune réservation intermédiaire à nettoyer.
- **Le texte reçu par l'annonceur est le texte enregistré, ou rien** : `RadarWhatsappTemplate::for()`
  recompose le corps du gabarit avec les paramètres et refuse (409 `radar.whatsapp.message_mismatch`)
  s'il ne redonne pas `message` à l'octet près.
- **Un échec ambigu (délai, 5xx) marque envoyé**, sans identifiant (`provider_status = ambiguous`) :
  un double message à un prospect expose le numéro aux signalements « spam » ; la file des relances
  reprend un message sans réponse.
- **Le prompt `v2`** de `radar.verification_accord` reprend `v1` mot pour mot et ajoute une section
  « réponse en texte » : le modèle ne classe que le texte, `RadarConsentVerdict::fromProviderMessage()`
  pose le numéro et les clauses par le code. Le jeu d'évaluation n'a pas de cas texte (TCK-2427).
- **⚠ Meta refuse, d'après sa documentation, un corps de gabarit qui commence ou finit par une
  variable.** `accord.v2` commence par `{salutation}` : si Meta refuse la soumission, il faudra une
  version de clauses (`accord.v3`) qui s'ouvre sur un texte fixe, relue par l'avocat, et sa ligne dans
  `config/radar_whatsapp.php` (`templates`). Le code suit la version enregistrée de chaque message.

### Décisions prises en autonomie, à revoir

| Décision | Retenue | Écartée | Pourquoi |
|---|---|---|---|
| Où vit le numéro du Radar | `config/radar_whatsapp.php`, variables `RADAR_WHATSAPP_*`, vides | une ligne `Integration` d'un nouveau fournisseur | Une config à part ne peut pas être confondue avec l'intégration des notifications ; le brief la demandait vide par défaut. |
| Pilote par défaut | `log` (aucun réseau, identifiant fictif) | `cloud` | Rien ne part tant que le porteur n'a pas posé `cloud` ; même patron que les SMS. |
| Numéro des notifications saisi pour le Radar | refusé (422 `radar.whatsapp.same_number`), intégration active ou non, de toute agence | laisser passer | La contrainte du ticket ; une erreur de saisie ne doit pas suffire. |
| Envoi synchrone ou en file | synchrone, sous verrou, 10 s au plus | un job après le commit | Pas d'état « en cours d'envoi » à rattraper ; l'opérateur voit tout de suite le refus de Meta. Un job reste possible pour l'envoi en lot. |
| Échec ambigu | marqué envoyé, sans identifiant | laisser préparé (renvoi possible) | Écrire deux fois au même annonceur coûte plus cher (signalements) qu'une relance. |
| Rattachement d'une réponse | `context.id`, sinon le dernier message envoyé par l'API à ce numéro, puis sa dernière relance envoyée | le dernier message, tous canaux | Un message `wa.me` est parti d'un autre téléphone : une réponse au numéro du Radar ne peut pas lui répondre. |
| Plusieurs messages de l'annonceur | une réponse par message reçu, chacune vérifiée | une seule réponse en attente par message (règle du dépôt de captures) | Le « oui » qui suit un « bonjour » ne doit pas se perdre ; la confirmation lit la dernière réponse. |
| Réponse sur un message clos | gardée | ignorée | Un STOP après un accord est une révocation : l'opérateur doit la voir. |
| STOP reçu par l'API | classé par le modèle, posé par l'opérateur | appliqué d'office | « Confirmation humaine conservée » ; l'automatiser est réversible et se décide après la mesure. |
| Vocal, image | gardé comme réponse (`[audio]`), vérification en échec `radar.verification.no_text`, rien téléchargé | ignoré | L'opérateur sait qu'une réponse existe ; le téléchargement des médias est un autre sujet. |
| Acteur de l'appel IA d'une réponse reçue | l'opérateur qui a envoyé le message | aucun (appel refusé) | La passerelle exige un acteur qui détient `platform.radar.operate`. |
| Webhook : traitement | synchrone dans la requête | un job | Quelques écritures ; aucune donnée personnelle dans la table des jobs. |
| `WhatsappContact` | inchangé | y noter le dernier message reçu | Il ancre la fenêtre de service du numéro des NOTIFICATIONS ; un message au numéro du Radar n'en ouvre aucune. |
| Prompt | `v2` = `v1` + une section texte | un second usage | Le ticket nomme `radar.verification_accord` ; la partie captures reste mot pour mot. |
| Noms des gabarits | dans `config/radar_whatsapp.php` (`takussan_radar_accord_v2`), pas en variable | une variable par gabarit | Ce ne sont pas des secrets ; une nouvelle version de clauses s'ajoute par une ligne relue. |
