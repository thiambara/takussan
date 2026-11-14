---
id: TCK-2812
title: "« Tout télécharger » du coffre au-delà du seuil synchrone : l'archive se bâtit sur la file media et se remet par un lien signé"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2770, TCK-2811]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#27-médias--fichiers"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, archive, file-media, suite-de-tck-2770, audit-ux, app]
---

## Objectif utilisateur

Le bailleur dont le dossier « Relevés et attestations » compte plus de quarante documents les récupère quand même
en un seul geste. Il n'a pas à les télécharger un par un.

## Contrat de données

**Origine.** Écart ouvert de TCK-2770 (notes, « ⚠ Écart ouvert : pas de voie asynchrone ») : le porteur ouvre le
ticket de suite.

**Constat, relu dans l'arbre de TCK-2770 le 2026-11-14 (non commité à cette date).**

- L'archive (`ArchiveDuCoffre`) se bâtit pendant la requête, bornée à 40 entrées et 100 Mo de pièces. Au-delà,
  422 `document.archive_too_large`, et le front dit de télécharger les documents un par un.
- Seuil mesuré par TCK-2770 sous `dompdf`, 8 cœurs, contre `max_execution_time = 60` : 40 quittances en 12,8 à
  13,6 s, 39 relevés en 13,0 à 14,4 s (charges 4 à 7). Commande de mesure dans ses notes.
- Sous `cloudflare`, onze rendus d'affilée dépassent la limite de débit du pilote (TCK-2811).
- Modèle existant de la voie asynchrone : `ExportActivityLogJob` (export du journal d'audit, lien signé).

## Direction UX / Artistique

Au-delà du seuil, « Tout télécharger » ne dit plus « trop gros ». Il dit que l'archive se prépare, et la remet quand
elle est prête, sans que la personne ait à rester sur la page. Une archive qui échoue le dit, avec de quoi
recommencer.

## Contraintes strictes (métier)

- **Le travail ne juge rien de neuf** : il prend les entrées du dossier par `DocumentVault::for()` pour l'appelant,
  comme l'archive synchrone. Le jugement se fait au moment de la construction, pas au moment de la demande : une
  entrée devenue illisible entre-temps n'y entre pas.
- **Le lien est signé, à durée courte, et ne s'ouvre qu'à son demandeur** (authentifié, le même compte). Il ne porte
  ni identifiant de document ni chemin. Le fichier vit sur le disque des médias privés (R2 en production,
  ADR-0029), jamais en `getPath()` local, et il est purgé à l'expiration du lien.
- **Sous impersonation, refusé** (403 `impersonation.read_only`), comme l'archive synchrone (ADR-0055 §3).
- **File `media`** (consommée par `worker-media`, `scripts/check-queues.mjs` garde la règle). Une limite de débit du
  pilote PDF (TCK-2811) se traite par un nouvel essai différé dans le travail, pas par un échec de l'archive.
- Une demande identique en cours n'en lance pas une seconde.
- Les mêmes règles d'exclusion que TCK-2770 : interne (TCK-2759), règle d'auteur, profil bloqué en lecture seule.

## Delta à produire

- [x] ADR (ou amendement de celle de TCK-2770 si elle en a une) : seuil synchrone/asynchrone, durée du lien, purge.
- [x] Endpoint de demande d'archive asynchrone pour un dossier du coffre ; 202 avec l'état de la préparation.
- [x] Job `BatirLArchiveDuCoffreJob` sur la file `media`, qui réutilise `ArchiveDuCoffre` pour écrire le `.zip`.
- [x] Notification à l'appelant quand l'archive est prête, et en cas d'échec. Sa cible ouvre le coffre
  (`/app/documents`) : un genre ajouté à `NotificationTarget::PATHS` et classé dans `AgenceDeLaCible::HORS_AGENCE`
  (`AgenceDeLaCibleTest` l'exige).
- [x] Route signée de téléchargement, réservée au demandeur ; purge planifiée des archives expirées.
- [x] Front : « Tout télécharger » au-delà du seuil passe par la préparation, avec son état et son échec.
- [x] Tests `ArchiveAsynchroneDuCoffreTest` et tests vitest du geste.

## Critères d'acceptation

- [x] AC1 — Un dossier de 41 quittances : la demande rend 202 (plus 422) ; le travail exécuté, le `.zip` contient
  exactement les 41 entrées que le coffre liste dans ce dossier (noms comparés un à un).
- [x] AC2 — Le lien ouvert par un autre compte rend 403 ; ouvert après expiration, 403 ou 410 ; aucun des deux ne
  rend d'octet de l'archive.
- [x] AC3 — Une pièce interne ajoutée au dossier APRÈS la demande et AVANT l'exécution n'est pas dans l'archive ; une
  pièce rendue illisible à l'appelant entre la demande et l'exécution n'y est pas non plus.
- [x] AC4 — Sous impersonation, la demande rend 403 `impersonation.read_only` et aucun travail n'est mis en file.
- [x] AC5 — Un double du pilote qui rend la limite de débit au troisième rendu, puis réussit : le travail se
  relance et l'archive finale est complète. Le même double qui échoue toujours : l'archive échoue, l'appelant est
  notifié, aucun fichier partiel ne reste.
- [x] AC6 — Deux demandes du même dossier par le même compte, la seconde pendant la préparation : un seul travail en
  file.
- [x] AC7 — Front : au-delà du seuil, le geste annonce la préparation (texte présent vérifié), puis l'archive prête ;
  un échec se dit avec « Réessayer ». En deçà du seuil, le téléchargement direct de TCK-2770 ne change pas.
- [x] AC8 — Ablation : le jugement fait à la demande au lieu de l'exécution rend AC3 rouge ; la vérification du
  demandeur retirée rend AC2 rouge.

## Hors périmètre

- Changer le seuil synchrone de TCK-2770.
- L'archive de plusieurs dossiers à la fois.

## Notes d'implémentation

**Prémisse re-mesurée le 2026-11-14** : un dossier de plus de 40 entrées rend toujours 422
`document.archive_too_large` ; la préproduction rend ses PDF par `dompdf`.

**Ce qui est livré.**

- ADR : **amendement d'ADR-0099** (« Amendement du 2026-11-14 — l'archive préparée », §1-10), pas d'ADR
  neuve : seuil synchrone inchangé (40), plafond préparé 150 entrées, lien 24 h, purge horaire.
- `POST /api/me/document-vault/archives` (`folder`) → 202 et l'état ; `GET` du même chemin → les
  préparations de l'appelant sous son profil actif, la plus récente par dossier ;
  `GET …/archives/{uuid}/download` → le `.zip`, par lien signé relatif ET au seul demandeur (403
  `document.archive_link_invalid`, 410 `document.archive_expired`).
- Table `document_vault_archives` (modèle `DocumentVaultArchive`, enum `DocumentVaultArchiveStatus`,
  entrée `models-spec.md` § 29 bis) : elle ne garde aucune entrée du dossier. Index unique partiel
  `NULLS NOT DISTINCT WHERE status = 'pending'` : une préparation en cours par (compte, dossier,
  profil). La demande passe par `insertOrIgnore` et ne met en file que si elle a inséré.
- `BatirLArchiveDuCoffreJob`, file `media`, `$timeout` 85 (la connexion `database` relivre à 90 s),
  `$failOnTimeout`, 4 essais. Il réinstalle le profil actif et la langue de la demande dans
  `request()->attributes`, rappelle `ArchiveDuCoffre::construire()` (jugement à la construction),
  puis rend l'état d'avant. `document.archive_render_busy` (TCK-2811) → `release(EchecDuPilotePdf::REESSAYER_APRES)` (60 s) ; tout autre
  refus → échec. Échec : fichier effacé, passage `pending → failed` conditionnel, une seule notification.
- Notifications `document.archive_ready` / `document.archive_failed` (aucun interrupteur de
  préférence : la personne l'a demandée), cible `document_archive` → `/app/documents`, classée
  `HORS_AGENCE`.
- `PurgerLesArchivesDuCoffre`, planifiée chaque heure (`routes/console.php`, idempotente) : archives
  prêtes expirées, et préparations échouées ou perdues après 24 h, fichiers compris.
- Impersonation : la demande est une écriture (refusée), l'état et le téléchargement entrent dans
  `EnforceImpersonationReadOnly::REFUSED_READS`.
- Front : `CoffreDeDocuments` — au-delà de 40 entrées, « Tout télécharger » demande la préparation,
  annonce « Préparation en cours… » (désactivé, `aria-busy`), relit l'état toutes les quelques
  secondes, puis « Télécharger l'archive » par le lien signé ; un échec dit « Réessayer ». En deçà, le
  téléchargement direct de TCK-2770 ne change pas.

**Preuves.**

- AC1-AC6 : `tests/Feature/Documents/ArchiveAsynchroneDuCoffreTest.php`, 19 tests verts (`test_ac1_…`
  à `test_ac6_…`, plus l'index partiel, le profil d'une agente de deux agences, la restauration de
  l'état du worker, le plafond préparé, la purge).
- Courriel (décision de team-lead du 2026-11-14) : `test_the_email_carries_no_archive_link_and_the_signed_link_needs_the_session`
  — le bouton du courriel mène à `{front}/app/documents` (session exigée), aucun texte ne porte la
  signature, `/download`, le chemin ni l'uuid de l'archive ; le lien signé ouvert sans session rend 401
  sans octet. Les deux codes sont couverts par `LangGroupParityTest`, qui les dérive de
  `NotificationCode::cases()` (ablation : la clé `wo` `sms` d'`archive_ready` retirée → rouge).
- AC7 : `CoffreDeDocuments.archive-preparee.tck-2812.test.tsx`, 11 tests verts, dont la parité du
  seuil lue dans `ArchiveDuCoffre::MAX_FICHIERS`. Fidélité 390/1280 :
  `docs/qa/audit-ux-2026-11/fidelite/TCK-2812.json` (sans écriture en base : coffre réel du locataire
  porté à 41 quittances dans la réponse par interception CDP, écritures d'API bloquées).
- AC8 — ablations, une à une, fichiers restaurés au md5 :
  - la construction lancée pendant la demande → AC3 rouge ;
  - la vérification du demandeur retirée → AC2 rouge ;
  - la vérification de signature retirée → AC2 rouge ;
  - les entrées de `REFUSED_READS` retirées → AC4 et le téléchargement sous impersonation rouges ;
  - le profil non réinstallé → le test de l'agente de deux agences rouge ; non restauré → le test de
    restauration rouge ;
  - le passage à « prête » rendu inconditionnel → le test de la préparation terminée pendant la
    construction rouge (fichier orphelin) ;
  - la route de téléchargement sortie du groupe `auth:sanctum` → le test du courriel rouge (403 au
    lieu de 401 : le contrôle du demandeur refuse encore, en couche) ;
  - `estPrete()` retiré du téléchargement → reste vert : l'expiration de la signature (même instant)
    le couvre. Défense en couches, pas un trou.

**⚠ Écart ouvert.** Chaque nouvel essai rebâtit l'archive depuis le début : sous le pilote
`cloudflare`, dont la limite tombe vers onze rendus d'affilée (TCK-2811), un dossier de plus de onze
générés peut épuiser ses quatre essais et échouer. La préproduction rend par `dompdf`. La sortie serait
de mettre en cache les rendus entre deux essais — ticket à part si le pilote change.

**À faire au déploiement** : la migration `2026_11_14_160000_create_document_vault_archives_table`
(non jouée sur la base de démo : écriture).
