---
id: TCK-605
title: "Une saisie reste du texte dans TOUS les e-mails : fermer le relais d'hameçonnage anonyme de `lead.received`, puis chaque notification qui rend une saisie en Markdown (suite de TCK-599, B1)"
status: todo
phase: P0
family: bug
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
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

- `routes/api/public.php:161` et `:216` — les deux `contact-lead`, sans `auth`.
- `ContactLeadService::notifyReceived` (`app/Services/Lead/ContactLeadService.php:355-360`) passe
  `name` et `message` bruts à `NotificationCode::LeadReceived`.
- `CodedNotification::toMail` (`app/Notifications/CodedNotification.php:144-160`) découpe
  `render('mail_body')` et passe chaque ligne à `->line()`, rendu en Markdown, **sans échappement**.
- `NotificationRenderer::format` (`app/Services/Notifications/NotificationRenderer.php:94`) rend un
  paramètre texte tel quel pour **toutes** les surfaces ; `reasonCode` (`:155`) y recolle le motif
  libre ; `templateData` (`:234`) le donne aussi aux gabarits éditables du super-admin.
- `MarkdownText::escape` n'est appelé que par `FavoriteChangesNotification` et
  `SavedSearchMatchesNotification` (et les deux gabarits de résumé). **37** classes de
  `app/Notifications` ont un `toMail` ; les 35 autres n'échappent rien.

**Inventaire des chemins atteignables** (verif-599 passe 3, lecture de code, plus la re-mesure) :

| Notification | Champ saisi | Qui le contrôle |
|---|---|---|
| `lead.received` (`CodedNotification`) | nom, message | **visiteur anonyme** |
| `message.received` (`CodedNotification`) | nom de l'expéditeur, extrait | compte créé par soi-même |
| `AgencyUpgradeRequestSubmittedNotification` | nom d'agence, prénom, nom | compte créé par soi-même → personnel plateforme |
| `ConversationInviteNotification` | sujet, invitant | créateur d'un groupe |
| `NewBookingNotification` | titre du bien (gabarit éditable `booking_confirmed`) | annonceur |
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

- [ ] `NotificationRenderer::format` / `render` : échappement des paramètres texte sur la surface
      `mail_body` (et `mail_subject` **exclu**), y compris le complément libre de `reasonCode` et les
      variables texte de `templateData`. `CodedNotification`, `PropertyApprovedNotification` et
      `PropertyRejectedNotification` en héritent sans autre changement.
- [ ] Les classes hors code de l'inventaire : `MarkdownText::escape` sur chaque saisie passée au
      corps (`->line()`, `->greeting()`, paramètres de `__()` rendus dans le corps).
      `NewBookingNotification` : les variables du gabarit éditable rendues dans le corps.
- [ ] `app/Mail/*` : relu ; `InvitationMailable` ne rend aujourd'hui que des libellés (le rôle) et
      les deux résumés échappent déjà (599) — la garde d'AC4 les couvre quand même.
- [ ] Tests : `tests/Feature/Notifications/SaisieDansTousLesEmailsTest` (AC1 à AC5).

## Critères d'acceptation

La charge utile de référence, notée `P` : `[Payez ici](https://evil.example/l) ![x](https://evil.example/i.png) **gras** # titre`.
« Vivant » = un `href` ou un `src` vers `evil.example` dans le HTML rendu par `MailMessage::render()`
(ou le `Mailable` rendu).

- [ ] **AC1 (le relais anonyme, rouge sur `839be671`).** `POST /api/public/properties/{slug}/contact-lead`
      sans compte, `name` = `P`, `message` = `P` : l'e-mail `lead.received` de l'agent ne contient
      **aucun** lien ni image vivant, et le texte de `P` y est lisible. Même assertion par
      `POST /api/public/agents/{slug}/contact-lead`. *Rouge aujourd'hui : 3 liens ou images vivants.*
- [ ] **AC2 (toutes les notifications par code, garde structurelle).** Un test parcourt
      **`NotificationCode::cases()`** — pas une liste écrite à la main — et, pour chaque code,
      remplit **chaque** paramètre de type texte de `P` (les autres de valeurs valides), rend
      `CodedNotification::toMail` pour un `User` et pour un `AnonymousNotifiable` : zéro lien ou
      image vivant. Un code ajouté demain est couvert sans toucher au test.
- [ ] **AC3 (l'échappement ne déborde pas).** Pour les mêmes codes : le **sujet** de l'e-mail, le
      texte SMS (`toSms`) et le corps de la cloche (`toBroadcast`) portent `P` **à l'identique**,
      sans barre oblique ajoutée. Et `Awa & Fils [SARL]` se lit à l'identique dans l'e-mail rendu.
      *Un correctif qui échapperait toutes les surfaces rougit ici.*
- [ ] **AC4 (l'inventaire est exhaustif par construction).** Un test énumère par réflexion **toutes**
      les classes de `app/Notifications` qui définissent `toMail`, et toutes celles de `app/Mail`.
      Chacune figure soit dans le jeu de données du test d'injection (un cas qui construit la
      notification avec `P` dans chaque champ saisi, et affirme zéro lien ou image vivant), soit
      dans une table d'exemption **avec sa raison** (« aucune saisie : libellés et références
      générés »). Une classe absente des deux rougit le test, avec son nom. *Une notification
      ajoutée sans échappement ne peut pas passer en silence.*
- [ ] **AC5 (chaque cas de l'inventaire mord).** Les 12 classes du tableau du Contexte ont leur cas
      dans le jeu de données d'AC4. Ablation, consignée dans les Notes : retirer
      l'échappement de `NotificationRenderer` rougit AC1 et AC2 ; le retirer de chacune des
      classes hors code rougit **son** cas. Une ablation verte est un test à resserrer, pas un
      constat.
- [ ] **AC6.** `php artisan test tests/Feature/Search/SaisieDansLesEmailsTest.php` reste vert (les
      e-mails de 599 ne sont pas doublement échappés).

## Hors périmètre

- La validation des champs (`name`, `message`) : une saisie libre reste libre ; c'est son rendu qui
  change.
- Les gabarits éditables eux-mêmes (TCK-588) : leur texte est écrit par le super-admin.
- Le rendu des mêmes champs dans le front (texte React, non concerné).
- Les e-mails de Laravel lui-même (réinitialisation du mot de passe) : aucune saisie d'un tiers.

## Notes d'implémentation

_(à remplir par implementing-specs)_
