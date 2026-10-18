---
id: TCK-941
title: "Résumé quotidien et e-mail brut sans appelant retirés ; pause et reprise d'un boost réclamées ; récapitulatif de rapprochement idempotent avant l'envoi"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#16-crm--relation-client"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-5--jobs-planifiés-et-files"
tags: [back, jobs, notifications, boost, idempotence, logs, pistes]
---

## Contexte

Piste P05.08 du fichier de pistes (`docs/plans/2026-10-15-pistes-d-amelioration.md`), « Petits
écarts entre docblock et code ». Le chemin des agents était fermé : retirer le résumé quotidien
supprime son test, ce que la garde de l'implémenteur refuse. La piste est donc traitée en session.

Décision du porteur, recopiée de la ligne Statut :

> porteur (2026-10-18) : traité hors agents, en session : retrait du code mort (`SendDailyNotificationDigest` et son test, l'appelant mort de `SendRawNotificationEmailJob`), réclamation par `UPDATE … WHERE` dans `boosts:tick`, clé posée avant l'envoi et `SafeExceptionContext::of($e)` dans `SendProspectMatchDigest`

Re-mesuré sur l'arbre du 2026-10-18 (branche `feat/pistes-session-2026-10-18`, parent `ab982dbcc`) :

1. `SendDailyNotificationDigest` n'est ni dans `routes/console.php` (`php artisan schedule:list` ne
   montre que `SendNotificationDigestJob` et `SendProspectMatchDigest`) ni dispatché : seul
   `NotificationDigestTest` l'instancie. Son Mailable `DailyNotificationDigest` et sa vue
   `emails/notifications/digest.blade.php` ne sont atteints que par lui (et par un cas de
   `SaisieDansLesEmailsTest`).
2. `SendRawNotificationEmailJob` n'est dispatché que par `NotificationService::sendEmail()`, appelé
   par `notify()`, elle-même appelée seulement par `notifyMany()`. Aucun appel de
   `notify()`/`notifyMany()` du service dans `app/`, `routes/`, `config/`, `database/` (les
   `->notify(` restants sont ceux de `Notifiable`, à un argument, ou le `notify()` privé de
   `LeaseSignatureService`). Le constat « `$tries` et `backoff()` inopérants » ne tenait plus :
   TCK-770 l'avait réparé. Sans appelant, le job part avec son test.
3. `BoostLifecycle::pause()`/`resume()` écrivaient le modèle chargé (`forceFill()->save()`), quand
   `end()` et `closeWithRefund()` réclament par `UPDATE … WHERE status IN`. Le docblock de
   `BoostsTick` (« transitions réclamées par `UPDATE … WHERE` ») était faux pour elles.
4. `SendProspectMatchDigest` appelait `send()` puis seulement `?->update(['data' => …])` : la clé
   d'idempotence du jour était posée après l'envoi. Il journalisait `'message' => $e->getMessage()`,
   ce que TCK-601 interdit (`App\Support\Logging\SafeExceptionContext`).

## Objectif utilisateur

- Un boost clos par un passage n'est pas ranimé par un autre qui l'avait lu avant ; une reprise
  rejouée ne rend pas le temps déjà couru d'un boost payé.
- Un récapitulatif de rapprochement dont l'envoi échoue n'est pas renvoyé au rejeu du jour.
- Aucun journal ne recopie le message d'une exception du rapprochement.
- Le dépôt ne porte plus deux chemins d'envoi que rien n'appelle.

## Delta

- Retirés : `app/Jobs/SendDailyNotificationDigest.php`, `app/Mail/DailyNotificationDigest.php`,
  `resources/views/emails/notifications/digest.blade.php`,
  `tests/Feature/Notifications/NotificationDigestTest.php` ; `SaisieDansLesEmailsTest` ne rend
  plus que le gabarit vivant (`NotificationDigestMail`).
- Retirés : `NotificationService::notify()`, `notifyMany()`, `sendEmail()`, la table
  `TYPE_TO_EVENT` et la dépendance `PreferenceResolver` qu'elles seules utilisaient ;
  `app/Jobs/SendRawNotificationEmailJob.php` et `tests/Feature/Jobs/SendRawNotificationEmailJobTest.php`.
- `BoostLifecycle::pause()`/`resume()` passent par `claimTransition()` (`UPDATE … WHERE status =
  <état lu> AND <valeur lue dont dépend l'écriture>` : `ends_at` pour la pause, `remaining_seconds`
  pour la reprise), rendent `bool`, et `reconcile()` ne compte que les transitions réclamées.
- `NotificationService::send(…, ?array $data = null)` : `data` écrit à la création de la ligne
  `app_notifications`. `SendProspectMatchDigest` y passe sa clé, et journalise par
  `SafeExceptionContext::of($e)`.
- Tests : `tests/Feature/Boost/BoostTransitionClaimTest.php` (neuf), deux cas ajoutés à
  `tests/Feature/Crm/SendProspectMatchDigestTest.php`.

## Critères d'acceptation

- [x] **AC1** — Un boost clos par un autre passage entre la lecture de `reconcile()` et sa pause
      reste `ended`, et `reconcile()` ne compte pas la transition perdue. *`BoostTransitionClaimTest`
      (l'autre passage joué par un écouteur `PropertyBoost::retrieved`) : avant, « Failed asserting
      that two variables reference the same object » (le boost repassait `paused`) ; après, vert.*
- [x] **AC2** — Deux reprises concurrentes : celle qui a lu `paused` après qu'une autre a repris un
      jour plus tôt n'écrit rien, la fin reste celle de la première. *Même classe : avant, fin à
      `1792663200` au lieu de `1792576800` (un jour rendu) ; après, vert.*
- [x] **AC3** — Un premier envoi qui échoue (exception sur `NotificationSending`) puis un rejeu
      laissent une seule notification, qui porte `kind` et `digest_date`. *`SendProspectMatchDigestTest` :
      avant, `MultipleRecordsFoundException` (deux notifications) ; après, vert.*
- [x] **AC4** — L'échec du rapprochement d'un bien se journalise avec `property_id` et la classe
      d'exception, sans son message. *Même classe : avant, `InvalidCountException` (le contexte
      portait `awa.diop@…`) ; après, vert.*
- [x] **AC5** — Cas ABA : une ligne revenue au même statut avec une autre valeur (fin repoussée
      pendant qu'elle est `active`, reste à courir changé pendant qu'elle est `paused`) n'est pas
      écrite sur la valeur lue ; le passage suivant rejoue la transition sur la ligne à jour, sans
      perdre les jours ajoutés. *`BoostTransitionClaimTest`, deux cas : réclamation sur le seul
      statut → « Failed asserting that 1 is identical to 0 » (transition prise sur la valeur
      périmée) ; avec `ends_at`/`remaining_seconds` dans le `WHERE` → verts, et la pause rejouée
      porte `remaining_seconds` = 864 000 (10 jours), la reprise rejouée une fin à +10 jours.*
- [x] **AC6** — Une réclamation perdue laisse l'instance conforme à la ligne (statut, `ends_at`,
      rien de modifié). *`BoostTransitionClaimTest` (`pause()` appelée par réflexion) : sans le
      `refresh()`, « Failed asserting that two variables reference the same object » ; avec, vert.*
- [x] **AC7** — Aucune référence aux classes retirées ne subsiste. *`grep -rn
      "SendDailyNotificationDigest\|DailyNotificationDigest\|SendRawNotificationEmailJob" app routes
      config database bootstrap resources tests --include='*.php'` → seules deux mentions de fixture
      de `TranslationUsage` (chemins écrits dans un dossier temporaire) ; `php artisan schedule:list`
      inchangé ; `tests/Feature/Notifications`, `tests/Feature/Crm`, `tests/Unit/Architecture`,
      `SaisieDansLesEmailsTest` et les tests de boost voisins : 212 verts.*

## Hors périmètre

- `ProseLitteraleScanner` garde sa position (b) (`->notify(`/`->notifyMany(` à quatre arguments) :
  elle n'a plus de cible, et reste une garde contre leur retour.
- Les docblocks de `SavedSearchMatchesNotification`, `SendSavedSearchAlerts` et les ADR-0032/0050
  qui nomment `NotificationService::notify()` racontent un passé : non réécrits.
- Les clés `notifications.digest.*` restent : la vue vivante `notification-digest.blade.php` les lit.

## Notes d'implémentation

- **Compromis de la clé posée avant l'envoi** (choix de la piste) : la ligne `app_notifications`
  porte la clé dès sa création, avant `$user->notify()`. Un envoi qui échoue après elle n'est pas
  rejoué : le récapitulatif du jour est perdu pour ce destinataire, plutôt que reçu deux fois. La
  cloche, elle, existe.
- `claimTransition()` remplit l'instance, réclame par `UPDATE … WHERE` avec ses seuls attributs
  modifiés, puis `syncOriginal()` si la ligne est prise, `refresh()` sinon : l'instance suit toujours
  la ligne. La valeur lue est prise par `getRawOriginal()` (la forme exacte de la base), avant le
  `forceFill()` ; `null` se compare par `whereNull`.
- **Vérification adverse** : la première version ne réclamait que sur le statut ; le vérificateur a
  reproduit le cas ABA (pause calculée sur un `ends_at` lu avant une prolongation concurrente :
  `remaining_seconds` 432 000 au lieu de 691 200, trois jours payés perdus). Corrigé par AC5 ; AC6
  garde le `refresh()`, que rien ne gardait.
- **Ablation** : `pause()`/`resume()` rendus à `forceFill()->save()` → les deux cas de
  `BoostTransitionClaimTest` rouges, mêmes messages qu'avant ; `SendProspectMatchDigest` rendu à
  sa version d'origine (le paramètre `$data` de `send()` gardé) → AC3 et AC4 rouges ; restaurés par
  `cp`, empreintes `md5` égales, verts. Après correction : la ligne `->when(...)` (valeur lue dans le
  `WHERE`) retirée → les deux cas ABA rouges ; le `refresh()` retiré → AC6 rouge ; restauré, `md5`
  `4c9aed25ef564c7c69eccc91a64a0f52` égal à la copie, 5 verts. `tests/Feature/Boost` et
  `tests/Feature/Credits` entiers : 156 verts (charge 14,23 / 16,14 / 10,90 sur 8 cœurs).
- `BoostLifecycle.php` est aussi modifié par TCK-942 (tranches de remboursement) : régions disjointes.
