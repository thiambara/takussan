---
id: TCK-605
title: "Une saisie reste du texte dans TOUS les e-mails : fermer le relais d'hameçonnage anonyme de `lead.received`, puis chaque notification qui rend une saisie en Markdown (suite de TCK-599, B1)"
status: todo
phase: P0
family: bug
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#16-crm--relation-client
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#67-propertycontactlead-
tags: [back, securite, notifications, e-mail, markdown, hameconnage, public, garde]
---

# TCK-605 — Une saisie reste du texte dans tous les e-mails

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai.** Aucun commit ne cite TCK-605 hors sa création (a7bf71cef) ; TCK-2704 et
TCK-2633 (done) le citent comme « ligne à suivre » sans le fermer. Les deux contact-lead restent
anonymes (`routes/api/public.php:176`, `:235`), `NotificationRenderer` n'échappe toujours rien.

- Fermé entre-temps (sans fermer le défaut) : `ConversationInviteNotification` supprimée (2f853f3b7,
  TCK-861 → code `message.group_invite`) et `NewBookingNotification` supprimée (5f98fcf0c → codes
  `booking.*`, gabarit éditable `booking_confirmed`). Les deux passent désormais par
  `CodedNotification` + `NotificationRenderer` : le correctif s'y **concentre**.
- Reste à faire :
  - échapper les paramètres `PARAM_TEXT` sur `mail_body` dans `NotificationRenderer` (`format`,
    `reasonCode`, `templateData`), jamais sur `mail_subject` / SMS / cloche ;
  - `MarkdownText::escape` à la source dans les 8 classes hors code de l'inventaire ;
  - `SaisieDansTousLesEmailsTest` (parcours de `NotificationCode::cases()` + réflexion sur
    `app/Notifications` et `app/Mail`, exemptions motivées) et ablations.
- Aucune décision du porteur attendue.

## Objectif utilisateur

Un agent, un bailleur ou le personnel de la plateforme qui reçoit un e-mail de Takussan n'y trouve
jamais un lien ni une image qu'un tiers a écrits : ce qu'un visiteur ou un client a saisi s'y lit
comme du texte.

## Contexte

TCK-599 a fermé l'injection Markdown dans **ses** e-mails (verif-599 B1 et B1-bis) en posant
`App\Support\MarkdownText::escape`. La passe 3 de verif-599 a reproduit le même défaut **hors de
599**, sur un chemin **anonyme** déjà sur `dev`, et l'a renvoyé à un ticket prioritaire
(`BILAN-FINAL.md`, « Au porteur, en priorité », point 1).

**Reproduction de verif-599 passe 3 (sonde `q06`).** `POST /api/public/properties/{slug}/contact-lead`,
sans compte, `name` = `[Payez ici](https://evil.example/lead)`, `message` portant une image et un
lien Markdown : l'e-mail `lead.received` reçu par l'agent contient **3 liens ou images vivants** vers
`evil.example`, signés Takussan. Même chaîne par `POST /api/public/agents/{slug}/contact-lead` (non
rejouée). L'API n'est pas en production : aucune exposition aujourd'hui, mais le défaut part avec la
première mise en production (TCK-288).

**Re-mesure sur `839be671` (2026-10-08).** Le chemin tient tel que verif-599 l'a décrit :

- `routes/api/public.php:176` et `:235` *(relevé 2026-11-16 ; `:161` et `:216` le 2026-10-08)* — les deux `contact-lead`, sans `auth`.
- `ContactLeadService::notifyReceived` (`app/Services/Lead/ContactLeadService.php:576-583`, relevé 2026-11-16) passe
  `name` et `message` bruts à `NotificationCode::LeadReceived`.
- `CodedNotification::toMail` (`app/Notifications/CodedNotification.php:251-267`, relevé 2026-11-16) découpe
  `render('mail_body')` et passe chaque ligne à `->line()`, rendu en Markdown, **sans échappement**.
- `NotificationRenderer::format` (`app/Services/Notifications/NotificationRenderer.php`, l.85 au 2026-11-16) rend un
  paramètre texte tel quel pour **toutes** les surfaces ; `reasonCode` (l.197) y recolle le motif
  libre ; `templateData` (l.396) le donne aussi aux gabarits éditables du super-admin.
- `MarkdownText::escape` n'est appelé que par `FavoriteChangesNotification` et
  `SavedSearchMatchesNotification` (et les deux gabarits de résumé). **36** classes de
  `app/Notifications` ont un `toMail` (37 le 2026-10-08) ; les 34 autres n'échappent rien.

**Inventaire des chemins atteignables** (verif-599 passe 3, lecture de code, plus la re-mesure) :

| Notification | Champ saisi | Qui le contrôle |
|---|---|---|
| `lead.received` (`CodedNotification`) | nom, message | **visiteur anonyme** |
| `message.received` (`CodedNotification`) | nom de l'expéditeur, extrait | compte créé par soi-même |
| `AgencyUpgradeRequestSubmittedNotification` | nom d'agence, prénom, nom | compte créé par soi-même → personnel plateforme |
| `message.group_invite` (`CodedNotification`) — ex-`ConversationInviteNotification`, supprimée par 2f853f3b7 (TCK-861) | sujet, invitant | créateur d'un groupe |
| `booking.created` / `booking.confirmed` (`CodedNotification`, gabarit éditable `booking_confirmed`) — ex-`NewBookingNotification`, supprimée par 5f98fcf0c | titre du bien | annonceur |
| `BookingExpiredNotification` | titre du bien | annonceur |
| `TaskDueReminderNotification` | titre de la tâche | personnel d'agence |
| `UrgentMaintenanceCreatedNotification` | titre de la demande | locataire actif |
| `LeaseDepositRefundNotification` | motif, **nom des pièces jointes** (l.85) | agence |
| `LeaseRentReviewedNotification` | motif | agence |
| `AgencyUpgradeRejectedNotification` | commentaire | personnel plateforme |
| `SuperAdminInvitedBroadcast` | nom, e-mail de l'invité | super-admin |
| `PropertyRejectedNotification` (`NotificationRenderer`) | complément libre du motif | modérateur |

L'inventaire n'est pas réputé complet : c'est la garde d'AC4 qui le rend exhaustif.

## Contrat de données

Aucun endpoint, aucune migration. Le remède existe : `MarkdownText::escape` (TCK-599). Le ticket
le porte au **point de rendu** des e-mails, et pose la garde qui empêche une notification nouvelle
d'y échapper.

## Contraintes strictes (métier)

1. **L'échappement vaut pour le corps Markdown d'un e-mail, et pour lui seul** : `->line()`,
   `->greeting()`, le corps d'un gabarit Markdown ou éditable. Jamais pour le **sujet** (un
   en-tête, pas du Markdown : une barre oblique y serait affichée), ni pour le SMS, WhatsApp, la
   cloche ou le broadcast (le front rend du texte). `MarkdownText::escape` ne touche pas `& < > "`,
   que Blade échappe déjà (en-tête de la classe).
2. **Un seul point pour les notifications par code** : `NotificationRenderer` échappe les
   paramètres **texte** (le `default` de `format`, le complément libre de `reasonCode`, les
   variables texte de `templateData`) quand la surface est `mail_body`. Les paramètres générés
   (montant, date, compte, référence, URL) ne changent pas. Le texte du gabarit lui-même
   (`lang/` ou éditeur du super-admin) n'est pas échappé : c'est le Markdown voulu.
3. **Chaque notification hors code échappe ses saisies à la source**, au moment de les passer à
   `__()` ou à `->line()`.
4. **Une saisie échappée se lit à l'identique** : `Awa & Fils [SARL]` s'affiche `Awa & Fils [SARL]`
   dans l'e-mail rendu, sans barre oblique visible ni entité doublée (le test
   `test_l_echappement_ne_double_pas_les_entites` de 599 en est le modèle).

## Delta à produire

- [x] `NotificationRenderer::format` / `render` : échappement des paramètres texte sur la surface
      `mail_body` (et `mail_subject` **exclu**), y compris le complément libre de `reasonCode` et les
      variables texte de `templateData`. `CodedNotification`, `PropertyApprovedNotification` et
      `PropertyRejectedNotification` en héritent sans autre changement.
- [x] Les classes hors code de l'inventaire : `MarkdownText::escape` sur chaque saisie passée au
      corps (`->line()`, `->greeting()`, paramètres de `__()` rendus dans le corps).
      ~~`NewBookingNotification` : les variables du gabarit éditable rendues dans le corps.~~ — caduc
      depuis 5f98fcf0c : `templateData` (premier Delta) couvre `booking_confirmed`.
- [x] `app/Mail/*` : relu ; `InvitationMailable` ne rend aujourd'hui que des libellés (le rôle) et
      les deux résumés échappent déjà (599) — la garde d'AC4 les couvre quand même.
- [x] Tests : `tests/Feature/Notifications/SaisieDansTousLesEmailsTest` (AC1 à AC5).

## Critères d'acceptation

La charge utile de référence, notée `P` : `[Payez ici](https://evil.example/l) ![x](https://evil.example/i.png) **gras** # titre`.
« Vivant » = un `href` ou un `src` vers `evil.example` dans le HTML rendu par `MailMessage::render()`
(ou le `Mailable` rendu).

- [x] **AC1 (le relais anonyme, rouge sur `839be671`).** `POST /api/public/properties/{slug}/contact-lead`
      sans compte, `name` = `P`, `message` = `P` : l'e-mail `lead.received` de l'agent ne contient
      **aucun** lien ni image vivant, et le texte de `P` y est lisible. Même assertion par
      `POST /api/public/agents/{slug}/contact-lead`. *Rouge aujourd'hui : 3 liens ou images vivants.*
- [x] **AC2 (toutes les notifications par code, garde structurelle).** Un test parcourt
      **`NotificationCode::cases()`** — pas une liste écrite à la main — et, pour chaque code,
      remplit **chaque** paramètre de type texte de `P` (les autres de valeurs valides), rend
      `CodedNotification::toMail` pour un `User` et pour un `AnonymousNotifiable` : zéro lien ou
      image vivant. Un code ajouté demain est couvert sans toucher au test.
- [x] **AC3 (l'échappement ne déborde pas).** Pour les mêmes codes : le **sujet** de l'e-mail, le
      texte SMS (`toSms`) et le corps de la cloche (`toBroadcast`) portent `P` **à l'identique**,
      sans barre oblique ajoutée. Et `Awa & Fils [SARL]` se lit à l'identique dans l'e-mail rendu.
      *Un correctif qui échapperait toutes les surfaces rougit ici.*
- [x] **AC4 (l'inventaire est exhaustif par construction).** Un test énumère par réflexion **toutes**
      les classes de `app/Notifications` qui définissent `toMail`, et toutes celles de `app/Mail`.
      Chacune figure soit dans le jeu de données du test d'injection (un cas qui construit la
      notification avec `P` dans chaque champ saisi, et affirme zéro lien ou image vivant), soit
      dans une table d'exemption **avec sa raison** (« aucune saisie : libellés et références
      générés »). Une classe absente des deux rougit le test, avec son nom. *Une notification
      ajoutée sans échappement ne peut pas passer en silence.*
- [x] **AC5 (chaque cas de l'inventaire mord).** Les 8 classes hors code du tableau du Contexte
      ont leur cas dans le jeu de données d'AC4 ; les codes du tableau (dont `message.group_invite`
      et `booking.confirmed`, ex-classes) sont couverts par AC2 *(« les 12 classes » jusqu'au
      2026-11-16)*. Ablation, consignée dans les Notes : retirer
      l'échappement de `NotificationRenderer` rougit AC1 et AC2 ; le retirer de chacune des
      classes hors code rougit **son** cas. Une ablation verte est un test à resserrer, pas un
      constat.
- [x] **AC6.** `php artisan test tests/Feature/Search/SaisieDansLesEmailsTest.php` reste vert (les
      e-mails de 599 ne sont pas doublement échappés).

## Hors périmètre

- La validation des champs (`name`, `message`) : une saisie libre reste libre ; c'est son rendu qui
  change.
- Les gabarits éditables eux-mêmes (TCK-588) : leur texte est écrit par le super-admin.
- Le rendu des mêmes champs dans le front (texte React, non concerné).
- Les e-mails de Laravel lui-même (réinitialisation du mot de passe) : aucune saisie d'un tiers.

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Un seul point pour les codes** : `NotificationRenderer::render()` échappe, sur `mail_body` seul, tout paramètre
  hors `money`/`date`/`datetime`/`count`/`url` — donc `text`, mais aussi `person`, le complément libre de
  `reason_code` et de `booking_rejection_reason`, et la valeur brute qu'un libellé inconnu laisse passer (`role`,
  `month`, pièce, créneau, réponse) — ainsi que `user.first_name` des gabarits éditables. `format()` (public, lu par
  les variables Meta WhatsApp) reste brut.
- **Hors code, à la source, et au-delà des 8 de l'inventaire** : la réflexion d'AC4 a trouvé cinq classes de plus qui
  rendaient une saisie (`AgentTenantInventoryReminder` nom du locataire, `SuperAdminAcceptedBroadcast` nom/e-mail,
  `InvitationAccepted`/`InvitationExpired` contact invité, `ActivityLogExportReady` nom de fichier) : échappées aussi.
  Le sujet n'est jamais échappé.
- `PayoutBeneficiaryNotificationsTest` lisait la référence dans la SOURCE Markdown (`introLines`) : il la lit désormais
  dans l'e-mail rendu.
- Preuves : `tests/Feature/Notifications/SaisieDansTousLesEmailsTest.php` (8 tests, 2403 assertions). AC1 : deux
  tests `ac1_*` (bien et agent). AC2 : `ac2_aucun_code…` (tous les `cases()`, `User` et `AnonymousNotifiable`, avec et
  sans facultatifs) + `ac2_les_gabarits_editables…`. AC3 : `ac3_sujet_sms_et_cloche…` + `ac3_une_saisie_echappee…`.
  AC4 : `ac4_toute_classe…` (réflexion `app/Notifications` + `app/Mail`, exemptions motivées). AC5 : `ac5_chaque_classe…`
  (17 cas). AC6 : `SaisieDansLesEmailsTest` vert (6).
- Ablations, toutes rouges puis restaurées (md5) : échappement des paramètres du rendu (rougit AC1 ×2 et AC2), prénom
  du gabarit (rougit le test des gabarits), échappement restreint à `text` (rougit AC2 : `person` etc.), échappement
  étendu à toutes les surfaces (rougit AC3), chacune des 13 classes hors code (rougit AC5), les pièces jointes seules
  du remboursement de dépôt et le seul chemin non escaladé de la maintenance urgente (rougissent AC5), une exemption
  retirée (rougit AC4).

