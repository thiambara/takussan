---
id: TCK-2426
title: "Radar : la console envoie un message d'accord par l'API WhatsApp et montre la réponse reçue en texte"
status: done
phase: P3
family: front
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2395]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [front, radar, whatsapp, adr-0077]
---

## Objectif utilisateur

L'opérateur envoie le message d'accord sans quitter la console, et lit la réponse de l'annonceur
reçue par l'API comme il lit celle d'une capture.

## Contexte

TCK-2395 livre l'API : `POST /api/admin/radar/outreaches/{outreach}/send`, le canal du message
(`channel`, `provider_status` dans `RadarOutreachResource`) et les réponses `proof = provider_message`
(texte dans `transcript`, aucune capture). La fiche annonceur (`RadarAdvertiserCard`) ne connaît que
le lien `wa.me` et les captures.

## Delta à produire

- [x] Un bouton « Envoyer par l'API » sur un brouillon prêt, à côté du lien `wa.me`. Les libellés
      des refus (`radar.whatsapp.*`, `radar.outreach.reply_pending`) existent déjà
      (`codes-radar.ts`, TCK-2395) : l'écran les affiche.
- [x] Le canal d'un message envoyé (manuel, API, envoi ambigu) sur sa carte.
- [x] Une réponse `provider_message` montrée par sa transcription, sans galerie de captures ;
      `radar.verification.no_text` (vocal, image) dit que la réponse n'est pas lisible ici.
- [x] N'offrir le bouton que si la fiche annonceur rend `whatsapp_api_available = true` (TCK-2395 :
      pilote `cloud` configuré, ou pilote `log` en `local`/`testing`).

## Critères d'acceptation

- [x] AC1 — Le bouton envoie, et la carte passe « envoyé » par l'API sans recharger la fiche.
- [x] AC2 — Une réponse reçue s'affiche en texte, et l'issue se pose comme pour une capture.

## Hors périmètre

- L'envoi en lot (plusieurs annonceurs d'un geste) : une décision du porteur, après la mesure du
  taux d'acceptation de `radar.verification_accord`.

## Notes d'implémentation

- **Re-mesure** : le lot 5 (TCK-2395) livrait l'API (`POST …/outreaches/{outreach}/send`, `channel`, `provider_status`,
  `whatsapp_api_available`) et les libellés des refus ; aucun écran ne les lisait (types sans ces clés, aucune fonction
  d'envoi, `ReponseVerdict` sans branche `provider_message`). Rien n'était déjà fait côté front. Aucun changement d'API.
- **« Envoyer par l'API »** (`ApercuMessage`) : offert si `whatsapp_api_available`, ouvert aux mêmes conditions que le
  lien `wa.me` (`wa_me_url` non nul), après une confirmation. La réponse de `POST …/send` est posée dans la fiche avant
  la relecture : la carte passe dans le suivi sans attendre (AC1). Un envoi ambigu le dit en avertissement.
- **Réponse reçue non tranchée** (TCK-2395, I-1, I-5) : `reponseRecueEnAttente()` rejoue
  `RadarOutreachWorkflow::refuseIfReplyPending()` sur la fiche lue, à l'échelle de l'annonceur (toutes ses annonces) :
  la fiche le dit, et ni la préparation, ni la relance, ni le lien `wa.me`, ni « J'ai envoyé », ni l'envoi par l'API ne
  s'offrent ; l'issue reste posable. Un 409 `radar.outreach.reply_pending` venu d'une préparation ou d'un envoi se dit à
  l'échelle de l'annonceur, pas dans les mots du dépôt. L'API n'expose aucun indicateur sur la fiche : la règle est
  recopiée.
- **Canal** : `CanalMessage`, sur la carte du suivi (avec l'explication d'un envoi non confirmé) et dans l'historique.
- **Réponse `provider_message`** : « Reçue par l'API WhatsApp le … », texte affiché d'emblée (`break-words` : un lien
  long débordait à 375 px), aucune galerie ; `radar.verification.no_text` dit que la réponse n'est pas lisible ici.
  L'issue se pose par le même dialogue (AC2).

### Décisions prises en autonomie, à revoir par le porteur

| Décision | Retenu | Écarté | Raison |
|---|---|---|---|
| Confirmation avant l'envoi par l'API | un dialogue, comme « J'ai envoyé » | envoi au clic | le message part chez un vrai annonceur, sans retour possible |
| Geste principal | « Envoyer par l'API » plein, « J'ai envoyé » en contour quand l'API est offerte | deux boutons pleins | un seul geste principal par zone ; rien n'est retiré |
| Réponse reçue non tranchée | prédite par le front sur la fiche lue (règle de l'API recopiée, échelle de l'annonceur), gestes de démarchage fermés, une phrase sur la fiche | un indicateur rendu par l'API sur la fiche | l'API n'en expose pas ; elle reste juge, son 409 est libellé ; réversible en une fonction |
| Lien `wa.me` pendant une réponse non tranchée | retiré | laissé | « J'ai envoyé » serait refusé : le message partirait sans trace (scénario I-5) |
| Arrivée d'une réponse par le webhook | relecture de la fiche toutes les 30 s (`RADAR_REPLY_POLL_MS`) tant que la chaîne d'un message ouvert contient un envoi par l'API sans issue (une réponse se rattache à la relance, même envoyée à la main), dans une fenêtre de 15 min (`RADAR_REPLY_WINDOW_MS`) rouverte à l'arrivée, au retour sur l'onglet et à chaque envoi par l'API | aucune relecture (seulement au retour sur l'onglet), ou une relecture sans fin | rien d'autre ne signale la réponse ; jamais en arrière-plan (défaut de TanStack Query) ; deux constantes à changer |
| Libellé du 409 `reply_pending` d'un envoi | clé `message.replyPending`, propre au brouillon | le libellé commun du dépôt | « une réponse de ce message » désigne le mauvais message pour une relance |
| Réponse sans texte (vocal, image) | « écoutez-la ou regardez-la dans WhatsApp, sur le numéro du Radar » | « sur le téléphone du Radar » | un numéro de l'API Cloud ne s'ouvre pas forcément dans un téléphone (hors coexistence) |
| Cliquet `check:i18n-namespaces` après la fusion de `dev` | plafond de `(super-admin)/super-admin` porté de 52 à 57 %, la valeur que `--update` calcule (part 52,0 % + 5 points), seule ligne changée | `--update` complet (resserre aussi 37 autres frontières) ; raccourcir les textes | aucun espace de noms n'est entré (18 servis, comme sur `dev` à 51,8 %) : la part monte par les seules clés neuves de `superAdmin` ; ne pas resserrer les autres frontières sous les branches en vol |
| Échec de vérification d'une réponse reçue | « Lisez le texte reçu vous-même » (`failedReceived`) | « Lisez les captures » | il n'y a pas de captures |

## Reste sur dev

- La règle de `docs/features.md` § 2.12 (envoi par l'API depuis la console, canal, réponse reçue en texte, démarchage
  fermé tant qu'une réponse reçue de l'annonceur n'est pas tranchée) : écrite par la PR de spec commune.
- Le porteur : un premier envoi réel depuis la console en préproduction, une fois le pilote `cloud` configuré
  (prérequis de TCK-2395), et la relecture des décisions ci-dessus.
