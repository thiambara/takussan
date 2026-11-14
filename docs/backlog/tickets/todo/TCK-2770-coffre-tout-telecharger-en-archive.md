---
id: TCK-2770
title: "Coffre de documents : « Tout télécharger » — une archive .zip d'un dossier, servie par l'API"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2656]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, archive, suite-de-tck-2656, audit-ux, app]
---

## Objectif utilisateur

Le locataire qui doit fournir ses quittances de l'année, à une banque ou à un nouveau bailleur, les récupère
en un seul geste depuis le dossier « Quittances 2026 ». Il n'a pas à les télécharger une par une.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 14 : ticket de suivi (archive .zip).

**Constat (2026-11-13).** La maquette du coffre (`app-documents` a) porte « Tout télécharger » sur le dossier
replié des quittances. Aucun endpoint ne sert d'archive. TCK-2656 (décision 3 (a)) a donc retiré le geste.

**Delta côté API.** Un endpoint qui produit l'archive `.zip` d'un dossier du coffre (`folder` = la clé du
dossier : `receipts:2026`, `lease:22`…) :

- les PDF générés y sont rendus comme par leur `download_path` ;
- les pièces téléversées passent par `PrivateMediaAccess` ;
- tout est jugé par la même règle de lecture que chaque entrée.

L'archive se construit hors de la requête si elle est lourde : file `media` et lien signé à durée courte,
comme les exports existants. Ce ticket tranche le seuil.

**Delta côté front.** « Tout télécharger » sur un dossier replié (quittances, relevés), comme la maquette.
Il porte un état en cours et un échec lisible.

## Contraintes strictes

- Une pièce interne (TCK-2759) ou refusée par la règle d'auteur n'entre jamais dans l'archive.
- Jamais de chemin local (`getPath()`) : les médias sont sur R2 en production (ADR-0029).

## Critères d'acceptation

- [x] AC1 — L'archive de « Quittances 2026 » contient exactement les quittances que le coffre liste dans ce dossier.
  *Preuve : `DocumentVaultArchiveTest::test_ac1_the_receipts_archive_holds_exactly_the_receipts_the_vault_lists` (les
  six entrées du dossier, six PDF, « 2026-01-05 Quittance.pdf »… ; sans l'impayé, le remboursé ni la restitution de
  caution). Le bailleur bloqué (`read_only`), le dossier d'un bail et « Relevés et attestations » ont chacun leur cas.*
- [x] AC2 — Un dossier d'un autre locataire rend 404, pas une archive vide.
  *Preuve : `test_ac2_a_folder_of_another_tenant_is_a_404` (`lease:` et `property:` de l'autre, `receipts:2025` absent ;
  témoin : son propre bail). Ablation (dossier absent remplacé par un dossier vide) : rouge.*
- [x] AC3 — Une pièce interne d'une fiche client n'y figure pas.
  *Preuve : `test_ac3_an_internal_piece_of_the_customer_file_is_not_in_the_archive` (l'interne absente, la visible de la
  même fiche présente). Ablation (`restreindreAuxLecteursDInternes` retiré du coffre) : rouge.*
- [x] Contrainte — une pièce refusée par la règle d'auteur n'entre jamais dans l'archive.
  *Preuve : `test_the_author_rule_withholds_the_uploads_of_a_suspended_agent` (actif, l'agent a ses deux dépôts sur la
  fiche ; suspendu, `pieces` est vide, 422). Ablation (règle d'auteur remplacée par `uploaded_by` dans le coffre) : rouge.*

## Hors périmètre

- La recherche dans le coffre (TCK-2769).

## Notes d'implémentation

**L'archive ne juge rien** (`App\Services\Documents\ArchiveDuCoffre`). Elle prend le dossier `folder` dans le coffre que
`DocumentVault::for()` rend à l'appelant. Les règles sont donc celles du coffre : les internes (TCK-2759), la règle
d'auteur, les pièces de profil, la lecture seule du bailleur bloqué (qui télécharge). Une pièce téléversée est son
`currentFile()` (TCK-2300), lu par `PrivateMediaAccess::readStream()`, jamais par `getPath()`. Un généré est rendu par le
code de l'endpoint de son `download_path` : `renderLeaseContract`, `streamRentReceipt`, `InventoryController::renderPdf`
et `OwnerStatementController::renderPdf`, extraits sans changer l'endpoint. « Mes factures » (fiches JSON, sans PDF)
rend 422 `document.archive_unavailable`.

**Tout se décide avant le premier octet.** ZipStream écrit dans un fichier temporaire, une entrée à la fois, puis la
réponse le sert en flux. Un refus rend son code, jamais un `.zip` tronqué sous un 200.

**Un pilote PDF qui échoue en cours d'archive ne rend jamais un 500 nu** (décision du porteur, 2026-11-14). Une
limite de débit du pilote (`Rate limit exceeded`, code 2001, 429) rend 503 `document.archive_render_busy` avec
`Retry-After: 60` ; tout autre échec du rendu, 502 `document.archive_render_failed`. L'échec est rapporté, et rien n'est
parti avant lui : l'archive s'écrit dans le fichier temporaire, que le refus ferme. Le front range 502 et 503 dans
« echec » : « L’archive n’a pas pu être téléchargée. Réessayez. » Éprouvé par un double du service PDF qui lève au
troisième rendu, et par ablation.

ZipStream (`maennchen/zipstream-php`, ^3.1) est déclarée dans `composer.json`. Elle venait déjà de
`spatie/laravel-medialibrary` : le verrou ne change que de `content-hash`.

### ⚠ Écart ouvert : pas de voie asynchrone

L'archive se bâtit pendant la requête, bornée à 40 entrées et à 100 Mo de pièces. Au-delà, elle rend 422
`document.archive_too_large`, et le front dit de télécharger les documents un par un. La file `media` et le lien signé
du ticket ne sont pas bâtis : le porteur ouvre le ticket de suite.

- **Seuil mesuré** sous dompdf, 8 cœurs, contre `max_execution_time = 60` : 40 quittances en 12,8 s (load 4) et 39
  relevés et attestations en 13,0 s (load 7), le 2026-11-14 ; re-mesuré le même jour à 13,6 s et 14,4 s (load 5,6).
- **La commande de mesure**, qui imprime pilote, cœurs, charge et temps :
  `cd takussan-api && MESURE_ARCHIVE=1 php artisan test tests/Feature/Documents/DocumentVaultArchiveTest.php --filter=mesure`
  (sautée sans la variable). Relever le chiffre avec sa charge, machine au repos.
- **Pilote de préprod non mesuré.** Les gabarits déclarent `dompdf` (`.env.docker`, `.env.example`,
  `env.api.production.example`). Sous `cloudflare` (le `.env` local), onze quittances d'affilée dépassent sa limite de
  débit ; elles rendent désormais 503, plus 500, et la borne de 40 ne vaut que pour un pilote local.

**Sous impersonation, l'archive est refusée** (403 `impersonation.read_only`, `REFUSED_READS`, amendement d'ADR-0055 §3).
C'est un téléchargement en masse, de la famille des exports. Chaque document se lit encore un par un.

**Les noms dans l'archive** : un généré prend sa date et le libellé de sa catégorie, dans la langue de l'appelant
(`vocabulaire-du-coffre.json`, TCK-2769). Une pièce prend son nom saisi et l'extension de son fichier. Aucun identifiant
ni chemin n'y figure. `/`, `\`, les caractères de contrôle et les suites de points sont neutralisés. Deux noms égaux
sont départagés par « (2) ».

