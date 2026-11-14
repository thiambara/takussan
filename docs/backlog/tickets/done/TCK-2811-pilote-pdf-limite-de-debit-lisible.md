---
id: TCK-2811
title: "Une limite de débit du pilote PDF rend 503 avec Retry-After, jamais 500, sur chaque PDF servi ; et le pilote PDF de préprod entre au catalogue"
status: done
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2770]
blocks: [TCK-2812]
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, pdf, cloudflare, erreurs, infra, prod-drivers, suite-de-tck-2770, suite-de-tck-2651]
---

## Objectif utilisateur

Le bailleur qui télécharge son attestation annuelle juste après son relevé du mois reçoit, si le service PDF est
saturé, un refus qui dit de réessayer dans un instant. Il ne reçoit pas une erreur serveur.

## Contrat de données

**Origine.** Deux relevés du 2026-11-14 : revenus-2651 (attestation annuelle demandée juste après le PDF du mois :
500, puis 200 au second essai) et archive-2770 (archive de onze PDF : `Rate limit exceeded`).

**Constat, relu sur HEAD (`765093279`) et dans l'arbre de TCK-2770 le 2026-11-14.**

- `DocumentPdfService::render()` appelle `Pdf::view(…)->generatePdfContent()` sans rien attraper. Sous le pilote
  `cloudflare`, `Spatie\LaravelPdf\Drivers\CloudflareDriver` lève `CouldNotGeneratePdf::cloudflareApiError($body)`
  sur toute réponse non 2xx. Une limite de débit (code 2001, HTTP 429) sort donc en 500.
- **Seule l'archive de TCK-2770 la traite** (`ArchiveDuCoffre::rendreOuRefuser`, non commité à cette date) : 503
  `document.archive_render_busy`, `Retry-After: 60`, et 502 `document.archive_render_failed` pour tout autre échec.
  Le motif est reconnu par une expression sur le message (`rate limit|429|2001`).
- **Les rendus qui ne le traitent pas**, relevés par `grep -rn "DocumentPdfService\|Pdf::html\|Pdf::view" app` :
  - `DocumentPdfController` : quittance de loyer, facture, contrat de bail ;
  - `PublicPaymentLinkController::receipt` (reçu par lien public, via `streamRentReceipt`) ;
  - `OwnerStatementController` : relevé mensuel et attestation annuelle ;
  - `MaintenanceQuoteController` : devis d'intervention ;
  - `InventoryController` : rapport d'état des lieux ;
  - `BookingPaymentController` par `PaymentReceiptPdf` : reçu de réservation ;
  - `LeaseSignatureService` : le contrat figé à la demande de signature, voie d'ÉCRITURE ;
  - `ExportWriter::pdf()` (exports en PDF), qui rend un `PdfBuilder` : le rendu a lieu à la conversion en
    réponse, hors du contrôleur.
- **Le pilote déclaré diverge selon l'environnement.** `.env.docker`, `.env.example` et
  `deploy/takussan/env.api.production.example` disent `dompdf` ; `phpunit.xml` force `dompdf`. Le `.env` LOCAL de
  l'API (ignoré par git) dit `cloudflare`. Le pilote de la préproduction n'est **pas relevé** : `docs/infra/prod-drivers.json`
  n'a pas d'entrée `LARAVEL_PDF_DRIVER`. `docs/infra/hebergement.md` cite la clé parmi celles de l'environnement, sans
  valeur. On ne sait donc pas si la préproduction peut rendre ce 500.

## Contraintes strictes (métier)

- **Un dépassement de débit du pilote PDF rend 503 avec `Retry-After`, sur TOUTE route qui rend un PDF.** Code
  d'erreur stable, traduit en fr/en/wo (wo : le texte français, en pause). Tout autre échec du pilote rend 502 avec
  son code. Jamais un 500 nu, jamais un PDF tronqué sous un 200.
- **Un seul endroit reconnaît la limite de débit.** L'archive de TCK-2770 le reprend au lieu de garder sa propre
  expression ; ses codes `document.archive_render_*` restent ceux que son front lit, ou le front suit dans ce ticket.
- L'échec est rapporté (`report()`), comme dans l'archive.
- Sur la voie d'écriture (`LeaseSignatureService`), le 503 n'écrit rien : la demande de signature reste rejouable,
  aucune preuve ni empreinte n'est posée.
- **Le relevé du pilote de préproduction se fait par la voie authentifiée existante** (`deploy/takussan/relever-cles-dokploy.py`,
  qui n'imprime aucun secret, mémoire « secrets par script ») : c'est la session principale ou le porteur qui le
  lance, jamais un agent délégué, et la valeur s'inscrit avec sa date et sa commande.

## Delta à produire

- [x] Un traitement unique de `CouldNotGeneratePdf` (rendu d'exception de `bootstrap/app.php`, ou `DocumentPdfService`
  plus `ExportWriter`, au choix écrit dans les notes) : 503 `pdf.render_busy` + `Retry-After` pour la limite de débit,
  502 `pdf.render_failed` sinon.
- [x] `ArchiveDuCoffre::rendreOuRefuser` lit le même détecteur.
- [x] `lang/{fr,en,wo}/errors.php` : les deux codes.
- [x] `docs/infra/prod-drivers.json` : `LARAVEL_PDF_DRIVER` sous `preview`, état `mesure`, date et commande. Sous
  `production`, seulement si §5.7 de `docs/configuration.md` et la table F3 du plan le prescrivent aussi
  (`scripts/check-prod-drivers.mjs` les compare).
- [x] Tests `LimiteDeDebitDuPilotePdfTest`.

## Critères d'acceptation

- [x] AC1 — Pour CHACUNE des routes énumérées au constat (une ligne par route dans un fournisseur de données, nommée),
  un double du pilote PDF qui lève l'erreur Cloudflare de limite de débit (corps `{"errors":[{"code":2001,"message":"Rate limit exceeded"}]}`)
  fait rendre 503, l'en-tête `Retry-After` présent et numérique, et le code `pdf.render_busy`. Le double remplace le
  pilote, pas `DocumentPdfService` : sinon le test ne voit pas le chemin réel.
  *Preuve* : `takussan-api/tests/Feature/Pdf/LimiteDeDebitDuPilotePdfTest.php` — `test_ac1_ac2_…`, 12 lignes nommées (les 10 routes du constat, attestation annuelle comprise, plus `POST leases/{lease}/renew`, trouvé par la garde : `LeaseRenewalService` → `freezeRenewal()`). Le double est le VRAI `CloudflareDriver` posé en `PdfDriver`, transport par `Http::fake` (`preventStrayRequests`) ; il compte ses appels.
- [x] AC2 — Le même double qui lève une autre erreur Cloudflare fait rendre 502 `pdf.render_failed` sur chaque route.
  *Preuve* : même test, second appel sur chaque ligne (corps `code 10000`, HTTP 403) → 502 `pdf.render_failed`, sans `Retry-After` ; les deux échecs sont `assertReported`.
- [x] AC3 — `POST /api/leases/{id}/signature-request` sous la limite de débit : 503, et le bail n'a ni
  `contract_sha256` ni média `signed_contract` après l'appel.
  *Preuve* : `test_ac3_la_demande_de_signature_sous_la_limite_ne_fige_rien_et_reste_rejouable` — ni `contract_sha256`, ni `signature_requested_at`, ni média `signed_contract`, statut `draft` ; pilote rétabli, la même demande rend 200 et fige. Et `test_le_renouvellement_sous_la_limite_ne_cree_aucun_bail`.
- [x] AC4 — Une garde énumère les appels de rendu PDF de `app/` et rougit sur un appelant absent du fournisseur d'AC1.
  Ablation : un appelant ajouté hors de la liste la rend rouge.
  *Preuve* : `test_ac4_tout_appelant_de_rendu_pdf_est_couvert_ou_excuse`, bilatérale, auto-éprouvée (le motif doit encore voir `DocumentPdfService` et `ExportWriter`). Le motif voit tout `Pdf::`, toute mention de `Spatie\LaravelPdf\`, le service commun et ses intermédiaires, `->renderPdf(`. Ablations, chacune dans un fichier `app/Services/Pdf/AblationTck2811Appelant.php` puis supprimé, toutes rouges : `Pdf::html()` ; `Pdf::driver('dompdf')->view()` importée ; `\Spatie\LaravelPdf\Support\pdf()` ; `->renderPdf()` d'`InventoryController` ; l'alias global `\Pdf::view()` ; `new \Spatie\LaravelPdf\PdfBuilder` ; un `PaymentReceiptPdf` injecté. Et une excuse sur un fichier qui ne rend rien (`Property.php`) → rouge.
- [x] AC5 — Les tests de l'archive de TCK-2770 (503 `document.archive_render_busy`, 502) restent verts.
  *Preuve* : `DocumentVaultArchiveTest` vert (17 tests dont 1 sauté : la mesure) ; plus `test_ac5_l_archive_garde_ses_codes_sous_le_vrai_pilote` sous le pilote réel. Ablation du détecteur (`return false && …`) : le test 503 de l'archive de TCK-2770 rougit aussi (502) — elle lit bien le détecteur unique.
- [x] AC6 — `node scripts/check-prod-drivers.mjs --report` cite `preview.LARAVEL_PDF_DRIVER` avec sa valeur relevée.
  *Preuve* : `node scripts/check-prod-drivers.mjs --report` imprime `LARAVEL_PDF_DRIVER   dompdf` sous `preview` ; sortie 0 sans `--report`.
- [x] AC7 — Ablation : le traitement retiré rend AC1 rouge sur toutes les lignes (500).
  *Preuve* : ablation de la ligne `EchecDuPilotePdf::versApi($e)` de `bootstrap/app.php` → les 12 lignes, AC3 et le renouvellement rouges, « received 500 » 14 fois ; l'archive reste verte (elle attrape avant le gestionnaire). Fichier restauré, md5 vérifié.

## Hors périmètre

- Borner le débit en amont (file, sémaphore) : l'archive asynchrone est TCK-2812.
- Changer le pilote d'un environnement.
- L'affichage du refus par le front quand le PDF s'ouvre dans un nouvel onglet.

## Notes d'implémentation

**Choix (delta, 1ʳᵉ puce) : le rendu d'exception de `bootstrap/app.php`**, pas `DocumentPdfService` + `ExportWriter`.
Il couvre en un point les exports, dont le `PdfBuilder` se rend à la conversion en réponse, hors du contrôleur ; et
il laisse l'archive intacte : `ArchiveDuCoffre::rendreOuRefuser` repasse toute `HttpExceptionInterface` telle
quelle, si bien qu'une conversion dans `DocumentPdfService::render()` lui aurait fait émettre `pdf.render_*` au lieu
de ses codes `document.archive_render_*`. L'exception d'origine est rapportée par le gestionnaire, comme toute autre.

- **Détecteur unique** : `App\Services\Pdf\EchecDuPilotePdf` — `estUneLimiteDeDebit()` (même expression que
  l'archive, `rate limit|429|2001`, désormais restreinte à `CouldNotGeneratePdf`), `versApi()`, et
  `REESSAYER_APRES = 60` (la constante de l'archive y a migré). Le 503 porte `Retry-After` ET `retry_after`
  dans le corps, comme l'archive et le 429 du limiteur (TCK-622).
- **Un appelant de plus que le constat** : `LeaseRenewalService` (renouvellement qui naît actif →
  `LeaseSignatureService::freezeRenewal()`, rendu DANS la transaction). Sous la limite, la transaction s'annule :
  503 et aucun bail créé ; il est une ligne du fournisseur.
- **Hors du traitement** : un échec de dompdf qui ne lève pas `CouldNotGeneratePdf` (exception de Dompdf) reste
  un 500 sur les routes PDF ; seule l'archive l'attrape (502). Le ticket nomme `CouldNotGeneratePdf`.
- **`production`** : pas d'entrée `LARAVEL_PDF_DRIVER` — ni §5.7 de `docs/configuration.md` ni la table F3 ne la
  prescrivent (la ligne `FILESYSTEM_DISK / LARAVEL_PDF_DRIVER` du plan est dans D1, la préproduction).

### Relevé du pilote de préproduction (session principale, 2026-11-14T05:46:54Z)

`python3 -I deploy/takussan/relever-cles-dokploy.py JbPrtvdkuq0aLTDrOx2Ss LARAVEL_PDF_DRIVER` → `http 200, 315 lignes
d'environnement`, **`LARAVEL_PDF_DRIVER = dompdf`**. La préproduction ne passe donc pas par Cloudflare et ne peut pas
rendre ce 500 de limite de débit : le défaut ne touche aujourd'hui que le poste local (`.env` à `cloudflare`). Le ticket
reste utile pour tout environnement qui choisira `cloudflare`, mais sa priorité baisse (P3), et l'entrée
`prod-drivers.json` s'écrit avec cette valeur `dompdf`, état `mesure`.
