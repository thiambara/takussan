---
id: TCK-613
title: "ADR-0044 tenu au-delà du SQL : aucune exception ni pilote de journal n'écrit une donnée personnelle, et l'export du journal d'audit n'est plus un droit au porteur (suites de TCK-601 m2 et m4, TCK-602 passe 2)"
status: todo
phase: P2
family: back
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
tags: [back, front, donnees-personnelles, journal, exceptions, export, audit, adr-0044, securite]
---

# TCK-613 — Aucun journal n'écrit une donnée personnelle ; l'export d'audit n'est plus au porteur

## Objectif utilisateur

L'adresse e-mail, le numéro ou le lien de paiement d'une personne n'apparaissent dans aucun journal
applicatif ; le CSV du journal d'audit (e-mails et IP de tous les acteurs) ne se télécharge que par
celui qui l'a demandé, connecté, et une seule fois tracé.

## Contexte

Suites de **TCK-601** (verif-601 passe 1, m2 et m4, renvoyés à un ticket de suite par décision de
session ; ADR-0044 §2 « les limites connues […] relèvent d'un ticket de suite ») et de **TCK-602**
(verif-602 passe 2, observation sur les pilotes de journal), consignées dans `FILE-D-ATTENTE.md`
(13:10, 13:30, 19:10).

**Re-mesure sur `839be671` (2026-10-08)** :

1. **m4 — seule une `QueryException` passe par la forme sûre.** `bootstrap/app.php:140-145`
   remplace le rapport de `QueryException` par `SafeExceptionContext::of()` ; toute autre exception
   rapportée (requête HTTP qui lève, job échoué) passe par le rapport par défaut, qui écrit
   `getMessage()`. Sonde P7 de verif-601 : un `TransportException` SMTP (« 550 <p7.temoin@exemple.sn>:
   Recipient address rejected ») laisse l'adresse au journal. ADR-0044 §2 dit pourtant que
   `SafeExceptionContext` est « la **seule** forme d'une exception dans un journal ».
2. **`getMessage()` à la main**, hors du rapporteur : `OrangeSmsDriver.php:101`, `:251`,
   `MtargetSmsDriver.php:81`, `LAfricaMobileSmsDriver.php:84`, `CloudApiWhatsappDriver.php:85`
   (`Log::warning(…, ['error' => $e->getMessage()])`), `Jobs/Crm/SendProspectMatchDigest.php:81`,
   les jobs de médias (`ApplyWatermarkJob.php:122`, `RegenerateAgencyWatermarksJob.php:110`, `:123`,
   `RegeneratePhotoConversionsJob.php:91`). `SendSavedSearchAlerts` est fermé (TCK-599).
3. **Les pilotes de journal écrivent le message entier.** `LogSmsDriver`
   (`app/Services/Notifications/Sms/Drivers/LogSmsDriver.php:32-38`) et `LogWhatsappDriver`
   (`app/Services/Notifications/Whatsapp/LogWhatsappDriver.php:29`) journalisent `to` et `message` —
   lien porteur `/pay/{jeton}` compris — quand `SMS_LOG_FALLBACK` est actif (développement,
   préproduction).
4. **m2 — le lien d'export du journal d'audit est un droit au porteur.** `routes/api/audit-log.php:22-24` :
   `activity-logs/export/download` sous le seul groupe `api`, validé par signature. Sonde P4 de
   verif-601 : sans authentification 200, rejouable, par un bailleur 200, aucun téléchargement
   journalisé, fichier encore sur le disque après l'expiration. Le CSV porte l'e-mail et l'IP de tous
   les acteurs, jusqu'à 50 000 lignes. Émis par `CrossTenantAuditController.php:112` et
   `Jobs/Audit/ExportActivityLogJob.php:44`. Le dépôt a refusé ce modèle pour les pièces KYC
   (TCK-539 : « une URL présignée est un droit au porteur que la déconnexion ne révoque pas »).
   L'export de données personnelles (`routes/api/data-exports.php`) est, lui, sous `auth:sanctum`.

## Contraintes strictes (métier)

1. **Toute exception rapportée** passe par `SafeExceptionContext::of()` : classe, code, `fichier:ligne`,
   jamais le message ni les arguments de la trace. `dontReport` reste respecté. Un rapporteur externe
   (Sentry ou autre), s'il est branché, reçoit la même forme.
2. Les pilotes SMS/WhatsApp journalisent la classe et le code d'une erreur de transport, jamais son
   message ; les pilotes de journal écrivent le destinataire masqué (`+22177•••••12`) et la
   **longueur** du message, jamais son texte.
3. **Le téléchargement de l'export d'audit** exige `auth:sanctum`, est réservé à son demandeur
   (identifiant porté par le chemin signé et comparé à l'appelant), est journalisé
   (`activity('Audit')`, sans le contenu), et le fichier est purgé à l'expiration. Le front le passe
   par le BFF (un téléchargement avec en-tête), plus par un lien ouvert dans le navigateur.
4. ADR-0044 §2 est mis à jour : « toute exception », et la liste des limites connues disparaît.

## Delta à produire

- [ ] `bootstrap/app.php` : rapporteur `Throwable` (contrainte 1), en plus de celui de `QueryException`.
- [ ] Pilotes SMS/WhatsApp et jobs cités : `SafeExceptionContext::of($e)` à la place de `getMessage()`.
- [ ] `LogSmsDriver`, `LogWhatsappDriver` : contrainte 2.
- [ ] `routes/api/audit-log.php` : téléchargement sous `auth:sanctum` ; `ActivityLogExportController@download`
      vérifie le demandeur et journalise ; commande planifiée de purge des exports expirés.
- [ ] Front : `CrossTenantAuditTable.tsx` (et l'export d'agence) téléchargent par un route handler.
- [ ] ADR-0044 §2 amendé.
- [ ] Tests : `NoPersonalDataInLogsTest` (AC1 à AC3), `ActivityLogExportDownloadTest` (AC4).

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671`).** Rejeu de la sonde P7 : `report(new TransportException('… "550
      <p7.temoin@exemple.sn>: Recipient address rejected"'))` → le journal ne contient pas
      `p7.temoin@exemple.sn`, et contient la classe de l'exception.
- [ ] **AC2 (garde structurelle).** Un test balaie `app/` et rougit sur toute occurrence de
      `getMessage()` passée à `Log::` ou dans un tableau de contexte de journal, sauf une exemption
      motivée (commande console interactive). *Un pilote ajouté demain qui journalise `getMessage()`
      rougit.*
- [ ] **AC3.** Avec `SMS_LOG_FALLBACK` actif, l'envoi d'un SMS portant un lien `/pay/{jeton}` ne laisse
      au journal ni le jeton ni le numéro complet.
- [ ] **AC4 (rouge sur `839be671`).** Rejeu de la sonde P4 : sans authentification → 401 ; par un autre
      super-admin ou un bailleur → 403 ; par le demandeur → 200 et une ligne `activity_log` ; après
      l'expiration, le fichier n'est plus sur le disque.
- [ ] Ablations consignées : rapporteur `Throwable` retiré → AC1 rouge ; `auth:sanctum` retiré → AC4
      rouge ; une occurrence `getMessage()` réintroduite dans un pilote → AC2 rouge.

## Hors périmètre

- La rotation d'`APP_KEY` (TCK-614).
- Le chiffrement des colonnes (TCK-601, fait).
- `failed_jobs.payload` : gardé intact pour le rejeu (TCK-601) ; il est chiffré pour les notifications par code (TCK-602).

## Notes d'implémentation

_(à remplir par implementing-specs)_
