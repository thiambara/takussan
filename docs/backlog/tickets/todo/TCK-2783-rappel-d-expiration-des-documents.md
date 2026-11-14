---
id: TCK-2783
title: "Rappel d'expiration d'un document à J-60 et à J-7, par le planificateur — et la promesse du coffre rendue à l'écran"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, notifications, planificateur, coffre, suite-de-tck-2656]
---

## Objectif utilisateur

Le locataire, le bailleur ou le prestataire dont une pièce va expirer (pièce d'identité, passeport, assurance) est
prévenu 60 jours puis 7 jours avant, sans avoir à ouvrir son coffre pour s'en apercevoir.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 27 : ticket de suivi. Relevé ag (TCK-2656 L2) : « à prioriser
par le porteur ». **La priorité n'est pas décidée par ce ticket.** Il est rangé en P2 avec les autres suivis de la
vague. Le porteur le place dans la file, et le redressement et l'OCR, non prévus, restent hors de lui.

**Constat, relu sur l'arbre du 2026-11-13.**

- `documents.expiry_date` (date) n'est lu qu'à l'ouverture d'un écran :
  - la marque « expire dans N jours » du coffre (`DocumentVault::addUploaded`) ;
  - le compte `expiring_soon` (`Document::EXPIRING_SOON_DAYS = 60`, au jour de `Africa/Dakar`) ;
  - « À renouveler » ;
  - le filtre `filter[expiring_within_days]` de l'agence (TCK-2655).
- Aucune tâche planifiée ne le lit (`routes/console.php`), et aucun code de notification ne le vise
  (`NotificationCode` n'a que `kyc.expiring_soon`).
- La maquette du coffre promet « Nous vous préviendrons 60 jours avant ». TCK-2656 a retiré cette promesse de
  l'écran tant que le rappel n'existe pas.
- Le modèle existe pour le KYC : `KycExpiryService` (commande `kyc:expire-dossiers`, chaque jour à 06:00). Il
  mémorise les jalons envoyés dans `metadata.expiry_reminders` : un passage manqué rattrape au suivant, sans
  doubler.

## Direction UX / Artistique

Côté front, une seule chose change : la phrase de la maquette revient sur la fiche d'une pièce datée, et dans le
coffre, à l'endroit où TCK-2656 l'a retirée (« Nous vous préviendrons 60 jours avant »). Elle s'affiche seulement
quand le rappel s'applique à cette pièce et à ce lecteur. Le texte de la notification est porté par next-intl
(principe 5) : l'API émet un code et des paramètres.

## Contraintes strictes (métier)

- **Deux jalons : 60 et 7 jours avant `expiry_date`**, comptés au jour de Dakar (`Document::EXPIRY_TIMEZONE`),
  comme la marque du coffre. Un jalon n'est envoyé qu'une fois par document et par date d'expiration. Une nouvelle
  `expiry_date` (pièce remplacée ou date corrigée) réarme les jalons.
- **Rattrapage sans doublon**, comme le KYC : le jalon le plus proche non encore envoyé part, les plus anciens sont
  marqués envoyés sans notifier. Une pièce saisie à J-5 reçoit seulement le rappel de J-7.
- **Destinataire** :
  - une pièce dont le porteur est un `User` (« Mes pièces ») va à ce compte ;
  - toute autre pièce va à son téléverseur, s'il peut encore la lire (`DocumentPolicy::view`), jamais à quelqu'un
    qui ne la lirait pas : un membre du personnel parti n'est pas prévenu (règle d'auteur, TCK-2295) ;
  - un document interne (ADR-0099) ne part jamais à son sujet.
- **Aucune pièce déjà expirée, supprimée (soft delete) ou sans date** n'est notifiée.
- Le canal suit les préférences de notification (`NotificationService`, `NotificationPreference`), comme tout code.
- Le nom de la pièce et la date sont des paramètres typés du code (`PARAM_DATE`). La cible de la notification mène à
  la fiche de la pièce.

## Delta à produire

- [x] `NotificationCode::DocumentExpiringSoon` (`document.expiring_soon`) : paramètres `expires_at` (date),
  `document_name` et `days_left`, et sa cible.
- [x] Service `App\Services\Documents\DocumentExpiryReminder`, sur le modèle de `KycExpiryService`. Il mémorise
  `metadata.expiry_reminders`, avec la date visée, pour le réarmement.
- [x] Commande `documents:remind-expiring`, planifiée chaque jour à 07:00, `timezone('Africa/Dakar')`,
  `withoutOverlapping()`.
- [x] Gabarits de la notification fr et en. Le wo porte le texte français tel quel, le wolof étant en pause.
- [x] Front : la phrase de la promesse, sous la condition ci-dessus, sur la fiche de la pièce et dans le coffre.
- [x] Tests `RappelExpirationDocumentTest` : J-60, J-7, rattrapage, réarmement, document interne, personnel parti,
  pièce expirée, pièce supprimée, et fuseau (une pièce qui expire le lendemain à Dakar).

## Critères d'acceptation

- [x] AC1 — Une pièce « Mes pièces » qui expire dans 60 jours (jour de Dakar) produit, au passage de la commande,
  une notification `document.expiring_soon` à son compte, avec `days_left = 60`. Un second passage le même jour
  n'en produit pas d'autre.
  *Preuve : `RappelExpirationDocumentTest::test_j60_previent_le_porteur_une_seule_fois` (deux passages, une ligne, `updated_at` inchangé).*
- [x] AC2 — À J-7, une seconde notification part, avec `days_left = 7`.
  *Preuve : `test_j7_envoie_le_second_rappel`.*
- [x] AC3 — Une pièce créée à J-5 reçoit une seule notification, celle de J-7, et `metadata.expiry_reminders` marque
  les deux jalons.
  *Preuve : `test_rattrapage_sans_doublon` (`days_left = 5`, `sent = [60, 7]`, métadonnées existantes gardées).*
- [x] AC4 — Après `expiry_date` repoussée d'un an, la pièce reçoit de nouveau son rappel de J-60 à la nouvelle date.
  *Preuve : `test_une_nouvelle_date_rearme_les_jalons`.*
- [x] AC5 — Une pièce téléversée par un membre du personnel parti n'est notifiée à personne. Une pièce interne d'une
  fiche n'est jamais notifiée à son sujet.
  *Preuve : `test_le_personnel_parti_n_est_pas_prevenu` et `test_le_document_interne_ne_va_jamais_a_son_sujet`, chacun avec son témoin positif (agent actif prévenu).*
- [x] AC6 — Front : la phrase « Nous vous préviendrons 60 jours avant » s'affiche sur une pièce datée de « Mes
  pièces », et nulle part ailleurs.
  *Preuve : `takussan-web/src/components/documents/__tests__/promesse-du-rappel.tck-2783.test.tsx` (fiche : 60 jours, 7 jours à J-60 et J-8, rien à J-7, le jour même, sans date, expirée, autre porteur ; ajout au coffre : les trois paliers et le rangement). Ablation du seuil de 7 jours : rouge.*
- [x] AC7 — Vérifié par ablation. Un jalon compté en UTC, et non au jour de Dakar, rend le test de fuseau rouge. Une
  mémoire sans la date visée rend AC4 rouge.
  *Preuve : ablations rouges, fichier restauré et md5 vérifié — jour du serveur au lieu de Dakar (`today()` → `now()->startOfDay()`) : le test de fuseau rougit, le processus étant placé à Tokyo, parce que Dakar est à UTC+0 et qu'un « jour UTC » ne peut pas en différer ; mémoire sans date visée : AC4 rougit. Plus deux : sans la porte `DocumentPolicy::view`, AC5 (2 tests) rougit ; sans la mémoire de jalon, AC1 à AC3 rougissent.*

## Hors périmètre

- Le redressement de la photo et l'OCR (« Lu sur la photo ») : non prévus (relevé ag).
- Un rappel au personnel de l'agence pour les pièces de ses clients. La pastille `expiring_soon` existe déjà, et un
  envoi demanderait une décision du porteur.
- Le KYC, qui garde son propre rappel.

## Notes d'implémentation

- **Destinataire** : `DocumentExpiryReminder::destinataire()` choisit le porteur `User`, sinon le téléverseur, puis
  le passe par `Gate::forUser()->allows('view')`. Cette seule porte couvre le personnel parti, le document interne
  (`readsInternalOf` : personnel actif, jamais le sujet, décision 9b) et la pièce de profil. Un membre du personnel
  actif dans deux agences n'était pas reconnu hors requête (`staffAgencyId()` sans profil actif rend `null`) :
  décision de la session du 2026-11-14, le personnel se juge sur l'agence DU DOCUMENT — le jugement se fait sous
  le profil de personnel actif du destinataire dans cette agence, s'il en a un ; la policy reste le seul juge.
  Tests : `test_le_membre_de_deux_agences_est_prevenu_sur_l_agence_du_document`,
  `test_le_membre_d_une_autre_agence_n_est_pas_prevenu`. Ablations rouges : jugement sans l'agence du document,
  profil pris dans une autre agence, interne ouvert au personnel de toute agence (`readsInternalOf`).
- **Mémoire** : `metadata.expiry_reminders = {expiry_date, sent}`, ajoutée aux métadonnées existantes. Elle est écrite par
  `DB::table()`, sans toucher `updated_at` ni réindexer (Scout n'indexe pas `metadata`). Le jalon ne se pose
  qu'après un envoi reçu (`send()` non nul), comme le KYC.
- **Interrupteur** : nouvel événement `document_expiring` (`PreferenceResolver::EVENTS`, groupe « alerts » de l'écran,
  libellés ×3). Le code n'est pas `mobile()` : ni SMS ni WhatsApp.
- **Cible** : nouveau genre `document` → `/app/documents/{id}`, classé `HORS_AGENCE` dans `AgenceDeLaCible` (la table
  `documents` n'a pas de colonne d'agence ; la fiche juge son lecteur), famille `systeme`, « à traiter », verbe
  « Renouveler ».
- **Le jour même** (`days_left = 0`, pièce pas encore expirée) : le rattrapage de J-7 part, s'il n'est pas déjà parti.
- **Promesse à l'écran** : seulement sur une pièce portée par le compte du lecteur, et elle dit le prochain
  rappel (`rappelAVenir`) : « 60 jours avant » au-delà de 60 jours, « 7 jours avant » entre 8 et 60 jours, rien
  à 7 jours ou moins. Décisions de la session du 2026-11-14 : 1 (a), 2 (a) complétée ainsi, 3 (a).
- `FormeDesDatesDeNotificationTest` éprouve le code par son émetteur réel.
