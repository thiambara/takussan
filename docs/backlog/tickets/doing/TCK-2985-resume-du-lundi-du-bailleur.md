---
id: TCK-2985
title: "Le résumé du lundi du bailleur : lundi 09:00 heure de Dakar, par agence, par WhatsApp en gabarit sinon par e-mail, seulement s'il gère un bien et l'a activé ; sa réponse revient dans un fil"
status: doing
phase: P2
family: back
estimate: M
wave: 98
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2980]
blocks: [TCK-2983]
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#99-notificationpreference-
    - docs/models-spec.md#55-notificationtemplate--extension-whatsapp-
tags: [back, notifications, pont, whatsapp, bailleur, diaspora, adr-0132]
---

## Objectif utilisateur

- **Le bailleur dont une agence gère les biens** (souvent à l'étranger) : chaque lundi matin, il reçoit sur
  WhatsApp, ou par e-mail, ce qui s'est passé sur ses biens la semaine écoulée. Il répond au message, et sa
  réponse arrive à son agence dans un fil.

## Contrat de données

Le contrat est [ADR-0132](../../../adr/0132-le-pont-whatsapp-et-sms-relaie-le-fil-et-les-liens-d-action-font-un-geste.md)
§ 6 (décision 5 du porteur) et § 2, étape 3, pour la réponse.

**Prémisses mesurées (2026-11-19, `6a26d9701`)** :
- `PreferenceResolver::EVENTS` (`app/Services/Notifications/PreferenceResolver.php:54`), `channelsFor()` et
  `whatsappOnlyEvents()` (un événement WhatsApp sans SMS, comme l'alerte de seuil) ; `DEFAULTS` par canal
  (`email` allumé par défaut) ;
- `WhatsappChannel` : téléphone vérifié exigé pour un compte, gabarit hors fenêtre par `TemplateResolver` ou
  `whatsappTemplate()`, `smsFallbackAllowed()` pour refuser le SMS ;
- `BailleurDuBien::est` (`app/Services/Property/BailleurDuBien.php`) : le bailleur d'un bien d'agence détient un
  profil propriétaire dans l'agence ;
- le planificateur : `routes/console.php` (`->weeklyOn(1, '04:10')->timezone('Africa/Dakar')` déjà employé).

**Événement** `owner_weekly_digest` : dans `PreferenceResolver::EVENTS`, canaux `email` et `whatsapp` seulement
(ni `sms`, ni `inapp` : `channelsFor()` rend toujours `inapp` et `email` aujourd'hui, `PreferenceResolver.php:240` —
une exception pour cet événement), **éteints par défaut** (`defaultFor()` rend `email = true` pour tout événement :
la façon de l'écrire est à mesurer). **Activé = la case `email` ou la case `whatsapp` allumée** : la case `inapp`
est toujours vraie (`shouldSend`, `PreferenceResolver.php:170`) et ne compte jamais ; le résumé n'entre pas dans
le fil des notifications.

**Commande** `owners:weekly-digest`, planifiée `weeklyOn(1, '09:00')->timezone('Africa/Dakar')`,
`withoutOverlapping`, idempotente par semaine (une notification par bailleur, par agence, par semaine ISO).

**Destinataires** : chaque compte qui a activé l'événement **et** est bailleur, au sens de `BailleurDuBien::est`
avec un profil propriétaire actif, d'au moins un bien d'agence. **Un résumé par (bailleur, agence).**

**Contenu** (`CodedNotification`, code `owner.weekly_digest`, paramètres bornés, ses seuls biens de cette
agence, semaine écoulée lundi 00:00 → dimanche 23:59, heure de Dakar) :
- loyers encaissés (nombre, total) et en retard (nombre, total) ;
- interventions ouvertes et closes (nombres) ;
- visites confirmées (nombre) ;
- le nom de l'agence. Rien d'un autre bailleur, aucune donnée nominative d'un locataire (des nombres et des totaux).

**Canal** : WhatsApp en gabarit `resume_hebdo_bailleur` si la case WhatsApp est allumée et l'envoi possible
(numéro vérifié, pas `opted_out`, gabarit approuvé) ; sinon e-mail, si une case est allumée ; **jamais de SMS**
(`smsFallbackAllowed() = false`). Un envoi WhatsApp écrit un relais `purpose = digest`, `agency_id` = l'agence du
résumé, `user_id` = le bailleur, `provider_message_id` (table de TCK-2980).

**La réponse** : un message reçu qui cite (`context.id`) un relais `digest` suit la règle d'ADR-0132 § 2, étape 3,
restreinte à l'agence du relais ; sans fil, un prospect au nom du compte pour cette agence (TCK-2980). Ce ticket
ajoute ce cas à `RoutageEntrant`.

## Contraintes strictes (métier)

- **Cloisonnement** : un résumé ne compte que les biens dont ce compte est le bailleur ET que cette agence gère
  (ADR-0031). Un bailleur de deux agences reçoit deux résumés, chacun sans l'autre.
- **Seulement s'il a activé** l'événement ; jamais par défaut, y compris par e-mail.
- **Semaine sans rien** : le résumé part quand même (« rien à signaler »), sauf si le bailleur n'a plus de bien
  géré dans l'agence.
- Montants : décimaux en base, formatés dans la langue du destinataire ; jamais ×100 (principe n° 3 : ce n'est
  pas une frontière de pilote de paiement).
- Texte côté API par les fichiers de langue des notifications (`fr`, `en` ; `wo` = le français).

## Delta à produire

- [ ] `owner_weekly_digest` dans `PreferenceResolver` (événement, canaux, défaut éteint) et `NotificationCode`
  (`owner.weekly_digest`, paramètres, `LangGroupParity`).
- [ ] `App\Services\Owners\ResumeDuLundi` (les comptes, en requêtes groupées), `OwnerWeeklyDigestNotification`
  (ou une entrée de `NotificationCode` envoyée par `NotificationService`, à mesurer), commande et planification.
- [ ] Relais `purpose = digest` à l'envoi WhatsApp ; cas `digest` dans `RoutageEntrant`.
- [ ] Gabarit `resume_hebdo_bailleur` (`notification_templates`, `fr`, `en`, non approuvé).
- [ ] Tests :
  - `ResumeDuLundiTest` : bailleur actif à deux agences → deux résumés cloisonnés ; bailleur sans bien géré →
    rien ; préférence éteinte → rien ; idempotence par semaine ; bornes de la semaine en heure de Dakar ;
  - canal : WhatsApp quand possible, e-mail sinon, jamais SMS ;
  - réponse au résumé → fil de l'agence du relais ;
  - la planification : `schedule:list` porte la commande lundi 09:00 `Africa/Dakar`.

## Critères d'acceptation

- [ ] **AC1** — Un bailleur de deux agences reçoit deux résumés ; chacun ne compte que les biens de son agence.
  *Ablation : retirer le filtre d'agence — rouge.*
- [ ] **AC2** — Un compte qui n'a pas activé l'événement ne reçoit rien, même par e-mail. *Ablation : défaut
  allumé — rouge ; activation jugée par `shouldSend(…, inapp)` — rouge (tout le monde le reçoit).*
- [ ] **AC3** — Sans WhatsApp possible, le résumé part par e-mail ; jamais par SMS. *Ablation : repli SMS
  autorisé — rouge.*
- [ ] **AC4** — Relancer la commande la même semaine n'envoie rien de plus.
- [ ] **AC5** — Une réponse au résumé arrive dans un fil de l'agence du résumé, pas d'une autre.
- [ ] **AC6** — Pint propre ; tests des fichiers touchés verts.

## Hors périmètre

- L'interrupteur à l'écran : TCK-2983.
- Les engagements de l'agence dans le résumé (lot 3).
- Le bailleur sans mot de passe (il n'a pas de préférences à régler).
- Un « bailleur de la diaspora » distingué par son pays : le résumé vaut pour tout bailleur qui l'active.

## Notes d'implémentation

**2026-11-19 (impl-2985)** — mesures et écarts :

- **Pas de `NotificationService::send`** : il écrit toujours une ligne `app_notifications` (la cloche) ; le résumé n'y
  entre pas. Le code `owner.weekly_digest` porte le texte (API fr/en/wo, front title/body), envoyé par
  `OwnerWeeklyDigestNotification` (canal `mail` seul) ou par le gabarit du pont.
- **Activation** : `PreferenceResolver::OPT_IN_EVENTS` (défaut éteint, e-mail compris), `channelsFor()` = `email`,
  `whatsapp` (sans `inapp`), `active()` lit les seules cases e-mail/WhatsApp. `UserObserver` sème les lignes de
  préférence d'un compte neuf aux défauts : elles naissent éteintes.
- **Idempotence** : table `owner_weekly_digests` (unique bailleur, agence, semaine `o-\WW`), réservée par
  `insertOrIgnore` avant l'envoi (une violation abandonnerait la transaction sous PostgreSQL).
- **« En retard »** : échéance `late`, `pending` ou `partially_paid` dont `due_date` < lundi du résumé ; « visites
  confirmées » : `confirmed_at` dans la semaine ; « closes » : `completed_at` dans la semaine, statut `completed`/`closed`.
- **Canal du pont** : le pilote dont le NOM est une case de l'événement allumée (`channelsFor()`, jamais `sms`), déclaré
  et actif dans `config/messagerie.php`, avec la capacité « gabarits », accord non `opted_out` ; `envoyerGabarit()`
  (contrat de TCK-2981, arrivé pendant l'implémentation). Envoyé : relais `digest` (agence, bailleur, identifiant) ;
  indisponible ou échec sûr : e-mail ; ambigu : pas d'e-mail.
- **La réponse** : `RoutageEntrant::agenceDuResume()` — le relais `digest` cité, ou le dernier relais récent s'il est un
  résumé, ADRESSÉ À CE COMPTE ; l'étape 3 se restreint à son agence, et sans fil le prospect va à cette agence
  (`PontEntrant`).
- Gabarit `resume_hebdo_bailleur` : migration `2026_11_19_298501` (fr, en, `pending`).
- Gardes mises à jour : `NotificationClassification`, `PreferenceCatalog::EVENT_PERSONAS` (bailleur),
  `RienPourUnCompteNonJoignableTest::COUPEES`, `SaisieDansTousLesEmailsTest` (cas d'injection), surface `sms` exigée
  par la parité (jamais envoyée).

