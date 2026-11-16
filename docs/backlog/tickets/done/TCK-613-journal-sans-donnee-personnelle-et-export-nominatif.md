---
id: TCK-613
title: "ADR-0044 tenu au-delà du SQL : aucune exception ni pilote de journal n'écrit une donnée personnelle, et l'export du journal d'audit n'est plus un droit au porteur (suites de TCK-601 m2 et m4, TCK-602 passe 2)"
status: done
phase: P2
family: back
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
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

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** `git log --grep=TCK-613` → seule la création (a7bf71cef).

- Fermé entre-temps : `LogSmsDriver` (TCK-1025, suffixe + longueur) ; `SendProspectMatchDigest`
  (TCK-941, « jamais `getMessage()` ») ; purge horaire des exports d'audit expirés (TCK-1143,
  3b022b4d5) ; la phrase « la seule forme » d'ADR-0044 §2 est corrigée.
- Toujours vrai : le rapporteur `Throwable` de TCK-2356 (`bootstrap/app.php:193-203`) écrit la
  forme sûre sur le canal `exceptions` **en plus** du rapport par défaut, qui garde `getMessage()` ;
  ~15 sites journalisent `getMessage()` ; `LogWhatsappDriver` écrit `to` et `text` ; le
  téléchargement d'export reste hors `auth:sanctum`, sans contrôle du demandeur ni journal.
- Reste à faire :
  - rapport par défaut **remplacé** par la forme sûre (hors `dontReport`), AC1 ;
  - `SafeExceptionContext::of($e)` dans les sites de `getMessage()` + garde AC2 ;
  - `LogWhatsappDriver` : destinataire masqué + longueur ;
  - téléchargement sous `auth:sanctum`, demandeur = appelant, `activity('Audit')`, front par BFF ;
    ADR-0044 §2 amendé (supprimer la liste « Limites connues », l.91-97) ;
  - à ajouter (renvoyé par TCK-692) : la colonne `causer_email` de l'export d'audit.
- Aucune décision du porteur attendue (le ticket tranche déjà l'élargissement du rapporteur
  qu'ADR-0044 renvoyait à « une décision à part »).

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
   (`:209-211` au 2026-11-16) remplace le rapport de `QueryException` par `SafeExceptionContext::of()` ; toute autre exception
   rapportée (requête HTTP qui lève, job échoué) passe par le rapport par défaut, qui écrit
   `getMessage()`. Sonde P7 de verif-601 : un `TransportException` SMTP (« 550 <p7.temoin@exemple.sn>:
   Recipient address rejected ») laisse l'adresse au journal. ADR-0044 §2 dit pourtant que
   `SafeExceptionContext` est « la **seule** forme d'une exception dans un journal ».
   *Relevé 2026-11-16 : un rapporteur `Throwable` existe depuis TCK-2356 (l.193-203), mais il écrit
   sur le canal `exceptions` **en plus** du rapport par défaut, qui garde `getMessage()`.*
2. **`getMessage()` à la main**, hors du rapporteur (numéros du 2026-11-16) : `OrangeSmsDriver.php:110`,
   `:269`, `MtargetSmsDriver.php:90`, `LAfricaMobileSmsDriver.php:101`, `CloudApiWhatsappDriver.php:86`
   (`Log::warning(…, ['error' => $e->getMessage()])`), ~~`Jobs/Crm/SendProspectMatchDigest.php:81`~~
   (caduc depuis TCK-941), les jobs de médias (`ApplyWatermarkJob.php:124`,
   `RegenerateAgencyWatermarksJob.php:110`, `:123`, `RegeneratePhotoConversionsJob.php:91`).
   **Apparus depuis** : `Services/Auth/Voice/LAfricaMobileVoiceCodeSender.php:54` (TCK-2940),
   `PropertyVisitController.php:302`, `Services/Media/PdfImageEmbedder.php:53`,
   `MediaUrlResolver.php:71`, `WatermarkTrace.php:121`, `:131` (la garde d'AC2 les attrapera).
   `SendSavedSearchAlerts` est fermé (TCK-599).
3. **Les pilotes de journal écrivent le message entier.** ~~`LogSmsDriver`
   (`app/Services/Notifications/Sms/Drivers/LogSmsDriver.php:32-38`)~~ — caduc depuis TCK-1025
   (suffixe + longueur) ; `LogWhatsappDriver`
   (`app/Services/Notifications/Whatsapp/LogWhatsappDriver.php:29-33`) journalise `to` et `text` —
   lien porteur `/pay/{jeton}` compris — quand `SMS_LOG_FALLBACK` est actif (développement,
   préproduction).
4. **m2 — le lien d'export du journal d'audit est un droit au porteur.** `routes/api/audit-log.php:22-24` (`:21-23` au 2026-11-16) :
   `activity-logs/export/download` sous le seul groupe `api`, validé par signature. Sonde P4 de
   verif-601 : sans authentification 200, rejouable, par un bailleur 200, aucun téléchargement
   journalisé, ~~fichier encore sur le disque après l'expiration~~ (caduc depuis TCK-1143, purge horaire). Le CSV porte l'e-mail et l'IP de tous
   les acteurs, jusqu'à 50 000 lignes. Émis par `Admin/CrossTenantAuditController.php` et
   `Jobs/Audit/ExportActivityLogJob.php:44`. Le dépôt a refusé ce modèle pour les pièces KYC
   (TCK-539 : « une URL présignée est un droit au porteur que la déconnexion ne révoque pas »).
   L'export de données personnelles (`routes/api/data-exports.php`) est, lui, sous `auth:sanctum`.

## Contraintes strictes (métier)

1. **Toute exception rapportée** passe par `SafeExceptionContext::of()` : classe, code, `fichier:ligne`,
   jamais le message ni les arguments de la trace. `dontReport` reste respecté. Un rapporteur externe
   (Sentry ou autre), s'il est branché, reçoit la même forme.
2. Les pilotes SMS/WhatsApp journalisent la classe et le code d'une erreur de transport, jamais son
   message ; le pilote de journal WhatsApp (`LogSmsDriver` : tenu par TCK-1025) écrit le destinataire masqué (`+22177•••••12`) et la
   **longueur** du message, jamais son texte.
3. **Le téléchargement de l'export d'audit** exige `auth:sanctum`, est réservé à son demandeur
   (identifiant porté par le chemin signé et comparé à l'appelant), est journalisé
   (`activity('Audit')`, sans le contenu), et le fichier est purgé à l'expiration. Le front le passe
   par le BFF (un téléchargement avec en-tête), plus par un lien ouvert dans le navigateur.
4. ADR-0044 §2 est mis à jour : « toute exception », et la liste des limites connues disparaît.
   *Relevé 2026-11-16 : « la seule forme » est déjà corrigé ; reste à supprimer la liste « Limites
   connues » (l.91-97).*

## Delta à produire

- [x] `bootstrap/app.php` : le rapporteur `Throwable` existant (TCK-2356, l.193-203) devient un
      **remplaçant** du rapport par défaut (`->stop()` ou équivalent), en respectant `dontReport`
      (contrainte 1).
- [x] Pilotes SMS/WhatsApp et jobs cités : `SafeExceptionContext::of($e)` à la place de `getMessage()`.
- [x] ~~`LogSmsDriver`,~~ `LogWhatsappDriver` : contrainte 2 (`LogSmsDriver` — caduc depuis TCK-1025).
- [x] `routes/api/audit-log.php` : téléchargement sous `auth:sanctum` ; `ActivityLogExportController@download`
      vérifie le demandeur et journalise ; ~~commande planifiée de purge des exports expirés~~
      (tenu par TCK-1143, `routes/console.php:131`, relevé 2026-11-16).
- [x] Front : `CrossTenantAuditTable.tsx` (et l'export d'agence) téléchargent par un route handler.
- [x] ADR-0044 §2 amendé.
- [x] Tests : `NoPersonalDataInLogsTest` (AC1 à AC3), `ActivityLogExportDownloadTest` (AC4).

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671`).** Rejeu de la sonde P7 : `report(new TransportException('… "550
      <p7.temoin@exemple.sn>: Recipient address rejected"'))` → le journal ne contient pas
      `p7.temoin@exemple.sn`, et contient la classe de l'exception.
- [x] **AC2 (garde structurelle).** Un test balaie `app/` et rougit sur toute occurrence de
      `getMessage()` passée à `Log::` ou dans un tableau de contexte de journal, sauf une exemption
      motivée (commande console interactive). *Un pilote ajouté demain qui journalise `getMessage()`
      rougit.*
- [x] **AC3.** Avec `SMS_LOG_FALLBACK` actif, l'envoi d'un SMS portant un lien `/pay/{jeton}` ne laisse
      au journal ni le jeton ni le numéro complet.
- [x] **AC4 (rouge sur `839be671`).** Rejeu de la sonde P4 : sans authentification → 401 ; par un autre
      super-admin ou un bailleur → 403 ; par le demandeur → 200 et une ligne `activity_log` ; après
      l'expiration, le fichier n'est plus sur le disque (déjà vrai depuis TCK-1143 : gardé comme
      non-régression).
- [x] Ablations consignées : rapporteur `Throwable` retiré → AC1 rouge ; `auth:sanctum` retiré → AC4
      rouge ; une occurrence `getMessage()` réintroduite dans un pilote → AC2 rouge.

## Hors périmètre

- La rotation d'`APP_KEY` (TCK-614).
- Le chiffrement des colonnes (TCK-601, fait).
- `failed_jobs.payload` : gardé intact pour le rejeu (TCK-601) ; il est chiffré pour les notifications par code (TCK-602).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Rapporteur** : un rapporteur `Throwable` enregistré EN DERNIER remplace (`->stop()`) le rapport
  par défaut (`exception` + `SafeExceptionContext`) ; la ligne JSON de TCK-2356 et `query_exception`
  restent devant lui. `dontReport` est jugé par le framework avant tout rapporteur.
  Preuve : `NoPersonalDataInLogsTest` (AC1, dont un cas `dontReport`) ; ablation du rapporteur → rouge.
- **AC2** : la garde est un lexeur (`token_get_all`) sur `app/`, qui voit `getMessage()` et la
  variable d'exception passée telle quelle (`=> $e`, `(string) $e`) dans un `Log::…`/`logger(…)` ;
  son détecteur a son propre test sur des formes fautives et sûres. Aucune exemption. ⚠ Elle juge
  l'INSTRUCTION de journal : un message porté par un objet puis journalisé ailleurs lui échappe —
  relevé à la main : seuls les `AiUnavailable` (dont le message EST un code, `AiErrorCode`) suivent
  ce chemin, et `MtargetDlrPuller`, corrigé.
  Ablation : `getMessage()` réintroduit dans `OrangeSmsDriver` → rouge sur `OrangeSmsDriver.php:111`.
  `MtargetDlrPuller` (erreur relayée à `Log::error` par `sms:pull-mtarget-dlr`) ne porte plus que la classe.
- **AC3** : `LogWhatsappDriver` écrit `phone_suffix` et `text_length`, comme `LogSmsDriver` ; le cas
  SMS passe par le routeur avec une chaîne `log`. Ablation (texte remis au journal) → rouge.
- **AC4** : route sous `auth:sanctum`, demandeur signé = appelant, ligne `export` /
  `audit_export_downloaded` (famille `export`, 5 ans — le registre des exports, plutôt que
  `activity('Audit')` qu'aucune purge par famille ne nomme). Signature RELATIVE : le BFF relaie.
  Le lien du courriel vise le front (`/api/activity-logs/export/download`, route handler : sans
  session, la connexion qui ramène ; une requête `RSC` n'atteint pas l'API) ; la console télécharge
  par `/api/super-admin/audit/export/download` (route API `admin.audit.export.download`). Lu dans
  `fetch-server-response.js` de Next 16 : une réponse non-RSC fait repasser le routeur en navigation
  complète ; `api` est dans `SEGMENTS_NON_LOCALISES`. Effet de bord : un téléchargement compte parmi
  les « gestes sensibles » de la console.
  Preuve : `ActivityLogExportDownloadTest` ; ablations `auth:sanctum` retiré → rouge (500 au lieu de
  401), contrôle du demandeur retiré → rouge (200 au lieu de 403).
- **`causer_email`** : remplacée par `causer_id` + `causer_name` — décidé par analogie avec
  TCK-2763 (l'auteur par son nom, jamais par son adresse), le ticket n'en fixant aucun traitement :
  à confirmer. L'en-tête du CSV change. `user#<id>`, `deleted#<id>`, `system` gardent leur sens.
- `MediaUrlResolver` n'a pas été touché : supprimé par TCK-2463 pendant ce lot.
