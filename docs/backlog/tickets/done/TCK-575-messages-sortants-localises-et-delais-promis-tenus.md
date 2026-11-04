---
id: TCK-575
title: "Messages sortants localisés et délais promis tenus : e-mail d'export dans la langue du destinataire, échéance réelle de la demande de réservation, aucun chiffre sans mécanisme"
status: done
phase: P2
family: full
estimate: M
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#21-authentification--comptes
  models: []
tags: [full, i18n, notifications, bookings, privacy, ux, confiance]
---

## Objectif utilisateur

Ce que Takussan dit à l'utilisateur, il le dit dans sa langue, et il le tient. L'e-mail « Votre
export est prêt » arrive en français, en anglais ou en wolof selon la langue du compte, et son
bouton ouvre une page qui marche. Après une demande de réservation, l'utilisateur lit **jusqu'à
quand** le propriétaire ou l'agent peut répondre, c'est-à-dire l'échéance que le serveur
appliquera pour cette agence, et non un « sous 48h » que rien ne tient. Aucun texte de l'interface
ne promet un délai chiffré sans un mécanisme du code derrière.

## Contexte

Ce ticket naît des vérifications du retour testeur du 2026-09-23 (TCK-560 à TCK-569). Ces défauts
ont été relevés hors périmètre de leurs tickets ; le porteur a délégué les décisions produit.

### a. E-mail « Votre export de données est prêt » : confirmé, deux défauts

- **Langue.** `DataExportReadyNotification::toMail()` écrivait quatre phrases françaises en dur.
  `User` implémente `HasLocalePreference` (`app/Models/User.php:39`, `preferredLocale()` →
  `preferred_language`, `:537`), et la pile de notification applique cette langue avant
  `toMail()`. Il suffisait donc de passer par `lang/`. Le test envoie par la vraie pile
  (`$user->notify()`, mailer `array`), avec une langue d'application volontairement différente de
  celle du destinataire. Remis en place, l'ancien fichier fait échouer 5 tests sur 6.
- **Lien.** Le bouton visait `url('/api/data-exports/{id}/download')`, soit l'hôte de l'API sous
  `auth:sanctum`. Un navigateur qui ouvre un lien depuis une messagerie n'a pas de jeton Bearer,
  d'où un **401**. Le bouton mène désormais à la page « Mes données » du front
  (`/app/account/privacy`), protégée par la session, où l'export prêt a son bouton.
- **Durée.** « Ce lien expire dans 7 jours » était écrit en dur. Elle est désormais lue sur
  `expires_at` de l'export (`trans_choice`) : un export à 3 jours affiche « 3 jours ».

**Le gabarit du framework, relevé par la vérification adverse du 2026-09-24.** `toMail()` traduit
ce qu'il écrit ; le gabarit de Laravel (`MailMessage::action()`) ajoute deux phrases qu'il n'écrit
pas — la note sous le bouton (*« If you're having trouble clicking the … button, copy and paste the
URL below into your web browser: »*) et le pied de page (*« All rights reserved. »*) —, traduites
par `lang/<locale>.json`. `lang/fr.json` et `lang/wo.json` ne portaient que deux clés : un
destinataire fr ou wo lisait ces deux phrases en anglais (journal du 2026-09-24,
`storage/logs/laravel.log`). Reproduit par un test qui cherche l'anglais dans les corps HTML et
texte : 7 rouges (fr, wo, et les cinq phrases du gabarit). Les cinq clés que les gabarits de
courriel du framework traduisent (`If you're having trouble…`, `All rights reserved.`, `Hello!`,
`Whoops!`, `Regards,`) sont désormais dans `lang/fr.json` et `lang/wo.json` (`en.json` en
identité). Le défaut touchait **toutes** les notifications du dépôt qui passent par `action()`
(14 fichiers), pas seulement celle-ci : c'est le dictionnaire qui manquait.

**Voisin, même cause (D-24).** Le 429 de `POST /api/me/data-exports` renvoyait une phrase
française sans code. Côté front, il tombait dans le libellé générique du limiteur, « Réessayez dans
quelques minutes », alors que l'attente peut aller jusqu'à 24 h. L'API renvoie désormais
`code: data_export_throttled`, `available_at` et `Retry-After`, avec un message localisé.
`DataExportsPanel` affiche le libellé du front avec la date.

### b. « Le propriétaire ou l'agent vous recontactera sous 48h » : confirmé

**Mesuré sur la pile locale le 2026-09-24 à 02:01 Z** : `POST /api/bookings` (le chemin du tunnel,
`useCreateBooking`), bien 829 de l'agence 3 passé temporairement en `daily`, puis remis à son
état, les trois demandes supprimées avec leurs notifications et leurs journaux.

| Réglage `booking_pending_expiry_hours` | `expires_at` rendu | Échéance réelle (`response_deadline`) |
|---|---|---|
| absent (48 h par défaut) | création + 7 j | **création + 48 h** |
| 12 | création + 7 j | **création + 12 h** |
| 0 (désactivé) | création + 7 j | **création + 7 j** |

**Deux mécanismes expirent une demande** (`routes/console.php:28-29`) :
`ExpirePendingBookingsJob`, toutes les 15 min, au seuil de l'agence compté depuis `created_at`
(`BookingExpirationService::getEligibleBookings`), et `ExpireBookings`, toutes les heures, à
`expires_at`. `expires_at` seul ne pouvait donc pas servir tel quel : il annonçait 7 jours pour
une agence à 48 h. Et « 0 = désactivé » n'annule pas l'expiration de la demande, puisque
`expires_at` s'applique encore. Afficher « aucun délai » dans ce cas aurait été faux.

**Décision.** L'API expose `response_deadline` sur `BookingResource`. C'est la **première** des
deux échéances (`BookingExpirationService::responseDeadline`), ou `null` si la demande n'est plus
en attente ou si rien ne la fera expirer (sans agence et sans `expires_at` : le cas de
`booking-request`, la demande publique). La confirmation du tunnel affiche « … a jusqu'au
**samedi 26 septembre 2026 à 02:01** pour y répondre. Sans réponse d'ici là, la demande expire
automatiquement. », ou, sans échéance, une phrase sans chiffre. Le chiffre ne vient plus du
dictionnaire.

### c. Autres promesses chiffrées des trois dictionnaires

Relevé de toutes les valeurs en forme de délai (« sous N », « within N », « valable N »,
« jusqu'à N », « ci N waxtu »…) et de toutes les durées chiffrées :

| Clé | Avant | Mécanisme | Suite |
|---|---|---|---|
| `bookings.tunnel.success.body` | « sous 48h » | aucun (délai par agence) | **vrai** : échéance de l'API (b) |
| `agency.upgrade.page.benefits.sla`, `nav.proUpgrade.pendingBody` | « sous 5 jours ouvrés », « sous 48h » | aucun SLA côté API | **neutre** (déjà fait par la session, non réintroduit) |
| `onboarding.host.steps.intent.professionalNotice.body` « nous configurons votre espace en moins de 24h » | 24 h | un simple `mailto:` | **neutre** |
| 4 × `*.onboarding…phone.sent.body`, `profile.contact.otpSent` | « jusqu'à 60 secondes pour arriver » | aucun : délai de livraison du SMS, que rien ne tient. Le 60 était le délai avant renvoi (`RESEND_COOLDOWN_SECONDS`) | **vrai** : « valable 5 minutes » = `PhoneVerificationService::CODE_TTL_SECONDS = 300` |
| `privacy.dataExports.throttled` (neuve) | — | `DataExportController` : une demande par `subDay()` | date lue sur `available_at` |
| `auth.forgotPassword.sentBody` | 60 minutes | `config/auth.php` `passwords.users.expire` = 60 | tenu |
| `account.deletion.dialog.codeSentHint` | 5 minutes | `DeletionStepUpService::CODE_TTL_SECONDS = 300` | tenu |
| `agency.tenantOnboardingPending.emptyDescription`, `dashboard.onboardingPending.subtitle` | 7 jours | `TenantOnboardingPendingController` `subDays(7)` | tenu |
| `superAdmin.integrations.webhooks.retention` | 30 jours | `IntegrationService` purge `subDays(30)` | tenu |
| `superAdmin.pages.users.impersonateDescription` | ≤ 1h | `IMPERSONATION_TTL_MINUTES = 60` | tenu |
| `superAdmin.moderation.staleWarning` | 7 jours | compte calculé, pas une promesse | tenu |
| `adminSettings.integrations.artp` | 22h–06h | `QuietHoursGuard` (`sms.quiet_hours`) | tenu (pas une promesse de délai) |
| `documents.share.ttl.*`, `reporting.periods.*`, `*.chartTitle`, `*30d` | — | options et périodes affichées | hors sujet |

`src/test/__tests__/promesses-de-delai.test.ts` garde cette règle dans les trois langues. Toute
valeur en forme de délai doit figurer dans un registre avec son mécanisme (fichier:ligne), et le
chiffre doit être celui que le mécanisme tient. Côté API, aucune promesse de ce type dans `lang/` :
voir « Hors périmètre » pour deux notifications d'administration.

## Critères d'acceptation

- [x] AC1 — l'e-mail de fin d'export part dans la langue du **destinataire** (fr / en / wo), testé
      par la vraie pile d'envoi, avec une langue d'application différente
      (`tests/Feature/Notifications/DataExportReadyNotificationTest.php`). Son bouton mène à
      `{frontend_url}/app/account/privacy`, et plus aucun `/api/data-exports/` n'apparaît dans le
      corps. La durée annoncée est lue sur `expires_at`. Remis en place, l'ancien fichier fait
      échouer 5 tests sur 6. **Aucune phrase anglaise du gabarit** dans les corps HTML et texte
      d'un e-mail fr ou wo (note sous le bouton, pied de page), et chaque phrase des gabarits de
      courriel du framework a sa traduction fr et wo — cherchée d'abord dans le gabarit, pour
      rougir si Laravel change la clé. Retirer les clés de `lang/fr.json` et `lang/wo.json` fait
      échouer 7 tests sur 11.
- [x] AC2 — le 429 de la demande d'export porte `code`, `available_at` et `Retry-After` (22 h
      restantes → `79200`), et sa prose suit `Accept-Language`. Le panneau affiche « …à partir du
      {date} » et non le « quelques minutes » générique. Rouge sans le correctif, côté API comme
      côté front.
- [x] AC3 — `BookingResource.response_deadline` = la première des deux échéances : 48 h par
      défaut, le seuil de l'agence (12 h), `expires_at` quand le seuil est plus tardif (168 h) ou
      désactivé (0) ; `null` si la demande n'est plus en attente ou n'a aucune échéance. Sous un
      sparse fieldset qui omet une colonne dont il dépend, le champ vaut `null` plutôt qu'une date
      fausse ; **et une lecture en sparse fieldset peut le demander** : les colonnes
      `BookingResource::CHAMPS_DE_L_ECHEANCE` (`status`, `agency_id`, `created_at`, `expires_at`,
      `expired_at`) sont toutes des champs permis. `expires_at` et `expired_at` ne l'étaient pas :
      `GET /api/bookings?fields[bookings]=…,expires_at` rendait **400** (vérification adverse du
      2026-09-24), si bien que le champ n'était atteignable que par la réponse de création. La
      demande publique (`booking-request`, sans `expires_at`) renvoie le seuil de l'agence
      (`BookingResponseDeadlineTest`, 9 tests ; `Booking::$queryFields` d'origine remis : 1 rouge,
      le 400). Le même comportement est mesuré en direct (tableau ci-dessus).
- [x] AC4 — la confirmation du tunnel affiche cette échéance, formatée dans la locale (fr / en), et
      plus jamais « 48h ». Sans échéance, ou avec une API antérieure qui ne renvoie pas le champ, une
      phrase sans chiffre. Aucun libellé de confirmation ne contient de chiffre dans les trois
      langues (`BookingTunnel.echeance.test.tsx`). Si le composant lit `expires_at` au lieu de
      `response_deadline`, 2 tests échouent.
- [x] AC5 — aucun délai chiffré des trois dictionnaires n'est promis sans mécanisme ; registre et
      chiffres gardés par `promesses-de-delai.test.ts`. Trois ablations le font échouer : registre
      amputé (fr / en / wo), « 60 » remis au lieu de « 5 » pour le SMS, et les douze phrases retirées
      reconnues par la forme. La forme reconnaît aussi, depuis la vérification adverse, le français
      « en N heures », « dans un délai de N », « après N jours », « au bout de N » et l'anglais
      « after N days » : six tournures qui passaient (6 rouges avant l'élargissement), sans qu'aucune
      valeur actuelle des trois dictionnaires ne devienne orpheline. **Et, depuis la reprise du
      2026-09-24**, un délai annoncé par deux-points (« Délai de réponse : 48h », « Response time:
      48 hours »), une fourchette (« sous 1–2 jours », « 48-72h », « 1 à 2 jours »), les
      abréviations « hrs », « mins », « secs », et les nombres **en lettres de 1 à 72** en français
      et en anglais (« sous quarante-huit heures », « within forty-eight hours ») : 14 sondes
      rouges sous l'ancienne forme, vertes sous la nouvelle ; 5 contre-sondes (phrases chiffrées
      qui ne promettent rien) vertes des deux côtés ; les dictionnaires rendent le **même**
      ensemble de clés avant et après (fr 12, en 12, wo 15 ; aucune nouvelle, aucune perdue).
      **Réparation 1** : la fourchette en barre oblique (« 24/48h »), « Temps de réponse /
      traitement … », « in under », et le nombre UN écrit comme un article (« within a day »,
      « sous une heure ») derrière une amorce **forte** seulement — « for one month » et « en un
      mois de janvier » ne sont plus pris pour des promesses : 9 sondes rouges sous la forme
      d'avant (55/55 sous la nouvelle), dictionnaires inchangés (fr 12, en 12, wo 15).
- [x] AC6 — rendu vérifié à 320, 360, 390 et 1280 px, sur le DOM réel du composant avec la CSS
      compilée de l'application (Chrome headless, CDP) : pas de défilement horizontal, cibles
      ≥ 44 px au doigt dans le panneau d'export (36 px auparavant, rouge sans `max-sm:min-h-11`).
      Confirmation en fr, en et wo.
- [x] AC7 — `check-i18n` et `check-i18n-namespaces` verts ; `eslint` et `tsc --noEmit` propres sur
      les fichiers touchés ; Pint propre.
- [x] AC8 — parcours complet dans un navigateur réel, du tunnel jusqu'à la confirmation, sur la
      pile. La base de démo n'a aucun bien loué `daily` ou `weekly` ; il suffisait d'en passer un
      temporairement en `daily`, comme pour la mesure de l'API — la version précédente de ce
      critère le disait impossible, à tort (vérification adverse). **Mesuré le 2026-09-24 vers
      03:05 Z** (Chrome headless, CDP, session du client de démo), bien 23
      (`espace-commercial-a-mermoz-7Q8a4j`) de l'agence 1 passé en `daily` :
      agence à **6 h**, fr à 320 px : « …a jusqu'au jeudi 24 septembre 2026 à 09:04 pour y
      répondre… » pour une demande créée à 03:04:50 Z (+6 h ; `expires_at` = +7 j) ; en à 1280 px :
      « …has until Thursday, 24 September 2026 at 09:06 to reply… » ; agence à **0**, wo à 360 px :
      « …am na ba jeudi 1 octobre 2026 à 03:06… » (= `expires_at`). `scrollWidth` = `innerWidth`
      dans les trois cas. Le vérificateur avait mesuré le même parcours (fr 320, en 390, wo 1280 et
      320). Nettoyé : demandes 532–534, client 569 (et son document Meilisearch), notifications
      9401–9403, journaux 24316–24319 ; réglages de l'agence 1 et période du bien 23 remis à
      `null`. ⚠ En wo, la date est formatée à la française (« jeudi 1 octobre ») : c'est un choix
      écrit de `src/lib/format.ts` (`ETIQUETTES_INTL.wo = 'fr-SN'` : les données CLDR de `wo` ne
      sont ni sénégalaises ni garanties par le runtime), dont l'écart est la dette TCK-347 — pas un
      défaut de ce ticket.

## Hors périmètre

- `ActivityLogExportReadyNotification` (« expire dans 24 heures ») et
  `ReportExportReadyNotification` (« expire dans 7 jours ») : e-mails d'administration encore en
  français en dur (D-24). Leurs durées n'ont pas été rapprochées de leur mécanisme ici.
  `ReportingController:120` pose bien `now()->addDays(7)` ; la durée de 24 h n'a pas été vérifiée.
- `UrgentMaintenanceCreatedNotification` (« depuis plus de 30 minutes ») : français en dur, même
  dette.
- La page de détail d'une réservation n'affiche pas `response_deadline`. Le champ est disponible
  si on le veut, y compris en sparse fieldset (demander `BookingResource::CHAMPS_DE_L_ECHEANCE`).
- La garde `promesses-de-delai` reconnaît une liste **fermée** de tournures, élargie deux fois le
  2026-09-24. Une paraphrase inédite (« répond en général le jour même ») passerait, comme
  « en une heure » (le nombre UN n'est lu comme un article que derrière une amorce forte), un
  nombre en lettres au-delà de 72 (« quatre-vingts jours ») et **tout nombre wolof écrit en
  lettres** : ses composés (« ñeent fukk ak juróom ñett ») n'ont pas de forme figée que la garde
  puisse énumérer sans la deviner.
- Les phrases du gabarit de courriel du framework sont traduites pour **tous** les e-mails qui
  passent par `MailMessage` ; leurs autres textes en dur (les trois notifications ci-dessus) restent
  la dette D-24.

## Note d'exploitation

**Après tout changement de `takussan-api/lang/*.json` (ou de `lang/<locale>/*.php`), redémarrer
les workers : `php artisan queue:restart`.** Un worker de file charge le traducteur une fois et
garde en mémoire le dictionnaire qu'il a lu au démarrage : les notifications mises en file
(`ShouldQueue`, dont les e-mails de ce ticket) continuent de partir avec l'**ancien** texte — les
phrases du gabarit en anglais, par exemple — tant que le worker n'a pas été relancé, alors qu'une
requête HTTP lit déjà le nouveau. Mesuré par la vérification adverse du 2026-09-24. En local, les
deux `queue:work` que lance `./dev.sh` (l. 821 et 823) le gardent jusqu'à `queue:restart` ou une
relance de `./dev.sh`. En préproduction et en production (ADR-0028), `lang/` est dans l'image : un
changement arrive par un redéploiement, qui recrée les conteneurs des workers ; et
`deploy/takussan/compose.api.yml` borne de toute façon chaque worker à `--max-time=3600`.

## Notes d'implémentation

- API : `lang/fr.json`, `lang/wo.json` (+ `en.json` en identité) — phrases des gabarits de courriel
  du framework. `Booking::$queryFields` + `expires_at`, `expired_at`.
  `BookingExpirationService::responseDeadline()`, `BookingResource::responseDeadline()`
  (qui garde le sparse fieldset, sauf pour un modèle `wasRecentlyCreated`), et `agency` chargé en
  avance par `BookingController::index/store/show` (pas de N+1 dans la liste).
  `Me\DataExportController::store` (code, `available_at`, `Retry-After`).
  `DataExportReadyNotification` (clés `notifications.data_export_ready.*`,
  `PAGE_MES_DONNEES`). Clés `account.data_export.errors.throttled` en fr / en / wo.
- Front : `types/booking.ts` (`response_deadline`), `BookingTunnel.tsx` (`useFormatteurs`,
  `dateStyle: full` et `timeStyle: short`), `DataExportsPanel.tsx`
  (`prochaineDemandePossible()`, `<EmptyState>`, cibles de 44 px).
- Clés i18n : `bookings.tunnel.success.{deadline,noDeadline}` et `body` sans délai,
  `privacy.dataExports.{throttled,emptyHint}`, cinq textes d’OTP, `onboarding.host.steps.intent.professionalNotice.body`.

## Reprise des défauts mineurs (2026-09-24)

Deux défauts mineurs laissés par les vérifications adverses de la vague 69, corrigés par l'unité M3.

**1. La garde des délais ne reconnaissait pas cinq formes courantes** — reproduit avant
correction : les cinq sondes ajoutées à `promesses-de-delai.test.ts` rougissaient (5 échecs sur 30)
sous l'ancienne forme.

| Forme | Cause | Correctif |
|---|---|---|
| « Délai de réponse : 48h. » | aucune amorce sans préposition | amorces `délai(s) …` et `response/reply/turnaround/processing/review time …` (≤ 30 caractères sans chiffre ni fin de phrase avant le nombre) |
| « Réponse sous 1–2 jours. » | un seul nombre attendu | fourchette `N–M`, `N-M`, `N à M`, `N to M`, `N ou M`, `N or M` |
| « We reply within 48 hrs. », « Réponse sous 48 hrs. » | `hrs` absent de l'unité | `hrs?`, `mins?`, `secs?` |
| « Réponse garantie sous quarante-huit heures. » | chiffres seuls | nombres de 1 à 72 **engendrés** en lettres, fr et en (144 formes, tirets et espaces interchangeables) |

Ablation : le bloc de l'ancienne forme remis dans le fichier neuf, **14 rouges** (les 5 sondes du
défaut et 9 voisines : « Response time: 48 hours », « forty eight hours », « vingt et un jours »,
« soixante-douze heures », « 1 à 2 jours », « 48-72h », « 5 mins », « en deux jours »…) ; restauré,
44/44, md5 identique. Cinq contre-sondes (« Un délai de réponse peut être configuré par agence. »,
« Délai de réponse : non renseigné. », « Sous-total : 48 biens. »…) restent vertes. Sonde des trois
dictionnaires (5804 valeurs chacun) par les deux formes : **même ensemble** de clés reconnues
(fr 12, en 12, wo 15), aucune valeur actuelle ne rougit à tort.

Non couvert, écrit dans « Hors périmètre » : nombres en lettres au-delà de 72, nombres wolof en
lettres.

**2. La note d'exploitation** (`queue:restart` après un changement de `lang/`) est ajoutée
ci-dessus.

## Reprise des défauts mineurs (2026-09-24) — réparation 1 (M3)

Défaut mineur de la vérification adverse : des formes voisines passaient, et le nombre « un / one »
pouvait faire des faux positifs. **Reproduit** par sonde sur la forme extraite du fichier
(`scratchpad/ablation/M3/sonde-formes.mjs`) : « Réponse sous 24/48h. », « Temps de réponse :
48h. », « Temps de traitement : 72 heures. », « We reply in under 24 hours. », « We reply within a
day. », « We reply within an hour. » **passaient** ; « Free for one month. » et « Offert en un mois
de janvier. » étaient **reconnues** comme promesses.

**Corrigé dans `promesses-de-delai.test.ts`** :

| Forme | Correctif |
|---|---|
| « 24/48h » | la barre oblique rejoint les séparateurs de fourchette |
| « Temps de réponse : 48h », « Temps de traitement : 72 heures » | amorce nommée `temps de/d' (réponse, traitement, validation, attente, livraison, intervention)`, jumelle de `response/reply/… time` (et `delivery time`) |
| « in under 24 hours » | amorces `in under`, `under` |
| « within a day », « within an hour », « sous une heure » | `un`, `une`, `one`, `a`, `an` lus comme le nombre UN (`ARTICLE`) **derrière une amorce forte seulement** (`sous`, `within`, `in under`, `moins de`, `d'ici`, `dans un délai de/d'`, `valable`, `délai…`, `temps de réponse…`…) |
| faux positifs « for one month », « en un mois de janvier » | « un » et « one » retirés des nombres en lettres (2 à 72 désormais) : derrière `for`, `en`, `in`, ils ne comptent plus |

**Sondes ajoutées** : 8 formes reconnues, 3 contre-sondes (« Free for one month. », « Offert en un
mois de janvier. », « Publiez en une heure de travail. »). `promesses-de-delai.test.ts` **55/55**.
**Ablation** (le bloc de la forme d'avant remis dans le fichier neuf, restauré par `cp`, md5
identique) : **9 rouges** — les 6 formes du défaut et les 3 contre-sondes. **Dictionnaires**, sonde
des deux formes sur les 5804 valeurs de chaque langue : même ensemble de clés reconnues (fr 12,
en 12, wo 15), aucune nouvelle, aucune perdue.

**Contrepartie assumée, écrite dans « Hors périmètre »** : « Réponse en une heure » passe désormais
(« en 1 heure » rougit).
