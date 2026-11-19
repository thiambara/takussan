---
titre: "Ouvrir le pont WhatsApp : poser le secret d'application du webhook, re-mesurer les deux jetons, abonner le champ messages, faire approuver les quatre gabarits du pont"
type: cle-env
tickets: [TCK-2980]
cles: [WHATSAPP_WEBHOOK_APP_SECRET, WHATSAPP_WEBHOOK_URL_TOKEN, WHATSAPP_WEBHOOK_VERIFY_TOKEN]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

Le pont entrant ([ADR-0132](../../adr/0132-le-pont-whatsapp-et-sms-relaie-le-fil-et-les-liens-d-action-font-un-geste.md)
§§ 0, 1 et 7, TCK-2980) lit les messages reçus par le webhook de la messagerie, `/api/webhooks/messagerie/whatsapp/{jeton}`.
L'ancienne URL `/api/webhooks/whatsapp/status/{jeton}` reste un **alias** (même pilote, même garde) tant que l'URL de
rappel n'a pas été déplacée chez Meta (étape C).
Le code est écrit et vérifié **sans clé** (faux transport, requêtes signées par un secret de test). Sans les gestes
ci-dessous, tout webhook WhatsApp de l'environnement est refusé en 403 et **rien n'entre** : le pont est fermé, rien
ne casse. `takussan-api/docker/release.sh` relu : il ne touche ni aux clés ni à Meta, rien de ce qui suit n'y a sa place.

**A. Le secret d'application** — `WHATSAPP_WEBHOOK_APP_SECRET`, dans l'onglet Environment du Compose de l'API
(`takussan-api-preview`, puis `takussan-api-production` en phase F). C'est le **secret de l'application Meta** (Paramètres
de l'application → Général → Clé secrète), qui signe `X-Hub-Signature-256`. Le relevé de la préproduction
(`docs/infra/hebergement.md`, « connexion, webhooks, Radar ») nomme le jeton d'URL et le jeton de vérification, **pas ce
secret** : sans lui, `WhatsappStatusController::verifySignature` refuse tout (`webhook.signature_not_configured`).

**B. Re-mesurer les deux jetons** — `WHATSAPP_WEBHOOK_URL_TOKEN` (le segment `{jeton}` de l'URL de rappel) et
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` (le défi d'abonnement). Vérifier qu'ils sont posés et non vides, sans les afficher
(un script qui n'imprime qu'un code). La vérification d'abonnement doit rendre le défi :
`GET /api/webhooks/messagerie/whatsapp/{jeton}?hub.mode=subscribe&hub.verify_token=…&hub.challenge=42` → `42`
(l'alias `…/whatsapp/status/{jeton}` répond de même).

**C. Déplacer l'URL de rappel et abonner le champ `messages`** — dans l'application Meta du numéro des notifications
(WhatsApp → Configuration → Webhook) : URL de rappel `https://<api>/api/webhooks/messagerie/whatsapp/{jeton}` (Meta la
vérifie par le `GET` de B sur la nouvelle URL), jeton de vérification de B, puis **cocher le champ `messages`** (il porte à la fois
les statuts et les messages reçus). Le numéro du Radar a sa propre application et son propre webhook (ADR-0081) : ne
pas les mélanger.

**D. Le numéro d'entreprise** — le pont ne lit que les numéros des intégrations `whatsapp_cloud` **actives**
(`credentials.phone_number_id`). Vérifier dans l'administration des intégrations que l'intégration de la plateforme
(ou de l'agence) porte le `phone_number_id` du numéro abonné en C.

**E. Les quatre gabarits du pont, en `fr` et en `en`** (catégorie *Utility*), à faire approuver par Meta avant
d'ouvrir le relais sortant (TCK-2981, TCK-2982, TCK-2985) — l'entrée (ce ticket) n'en a pas besoin :
- `pont_invitation` — l'invitation à recevoir les messages d'un fil, avec le bouton de réponse « Accepter les messages » ;
- `pont_nouveau_message` — un message du fil hors fenêtre : `{{1}}` l'auteur, `{{2}}` l'agence, `{{3}}` l'extrait borné à 500 caractères (TCK-2981) ;
- `pont_lien_action` — un geste attendu (TCK-2982). Corps : `{{1}}` l'agence, `{{2}}` le geste (« confirmer la
  visite », « accepter l'intervention », « signer l'état des lieux »), puis le texte de `pont.lien_action_gabarit` (`lang/fr`,
  `lang/en`). **Un bouton d'URL dynamique** (type *Visit website*, URL *Dynamic*) : préfixe
  `https://<front de l'environnement>/fr/fil/a/` (`/en/fil/a/` pour le gabarit `en`), suffixe `{{1}}`, qui reçoit le
  **jeton** du lien (43 caractères ; `RelaisSortant::envoyer(…, boutonUrl:)`, jamais une variable du corps — `meta_variables` = `agence`, `geste`). Exemple
  demandé par Meta : un jeton fictif quelconque de 43 caractères `[A-Za-z0-9_-]`, jamais un jeton réel. Le préfixe
  suit `FRONTEND_URL` : un gabarit approuvé pour la préproduction ne sert pas en production ;
- `resume_hebdo_bailleur` — le résumé du lundi du bailleur.

**F. La vérification** — envoyer « Bonjour » au numéro depuis un téléphone **inconnu** de l'environnement : une demande
`whatsapp_inbound` apparaît dans la boîte des demandes de l'agence du numéro (sans agence : visible du seul
super-admin). Puis « STOP » : `whatsapp_contacts.opt_in_status = opted_out`, source `pont_stop`. Puis « START ».
Quand la nouvelle URL est vérifiée, l'alias peut être retiré par un ticket (aucun appel ne doit plus y arriver :
`integration_webhook_logs`, `route_name = whatsapp.webhook.status`).

## Historique
- 2026-11-19 · preview · a-faire · Claude (session, pour le porteur) · B fait après la promotion #1703 (`6bf1deb37`, fusionnée 2026-11-19 10:02:23 Z, `images.yml` vert, `X-Build-Sha` relu sur l'API et le front) : `WHATSAPP_WEBHOOK_URL_TOKEN` et `WHATSAPP_WEBHOOK_VERIFY_TOKEN` posés, le défi d'abonnement rend `42` sur `/api/webhooks/messagerie/whatsapp/{jeton}` et sur l'alias `/api/webhooks/whatsapp/status/{jeton}`. Restent A (`WHATSAPP_WEBHOOK_APP_SECRET`, vide dans Dokploy : secret de l'application Meta, à fournir par le porteur), C, D, E et F (console Meta).
