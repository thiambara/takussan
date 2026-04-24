---
id: TCK-077
title: "Documents — Génération PDF depuis templates"
status: done
phase: P2
family: back
estimate: M
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-021, TCK-027, TCK-028]
blocks: [TCK-076]
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#21-document
    - docs/models-spec.md#15-invoice
    - docs/models-spec.md#14-lease-payment
tags: [documents, pdf, templates, back]
---

## Contexte

La spec §1.10 P2 demande la « Génération PDF (quittance, facture, bail) depuis templates ». Le repo utilise déjà `spatie/laravel-pdf` (migration récente commit 393287d remplaçant dompdf). Un `ExportController` existe pour les exports de reporting mais il n'y a pas de service dédié à la génération de documents métier (quittance de loyer, facture client, bail signé, reçu de paiement).

Ce ticket pose l'infrastructure centralisée et livre les 3 templates prioritaires (quittance, facture, bail). TCK-076 (signature inventaire) le consomme pour son propre PDF.

## Objectif

Exposer un service de génération PDF unifié basé sur des templates Blade, avec 3 documents métier immédiatement utilisables : quittance de loyer, facture client, bail de location.

## Contrat de données

### Service central

`App\Services\Pdf\DocumentPdfService` :

```php
public function render(string $template, array $data): string    // renvoie le binaire PDF
public function store(string $template, array $data, Model $attachTo): Document  // persist comme Document lié
public function stream(string $template, array $data): Response  // streamed response
```

### Endpoints

- `GET /api/leases/{lease}/receipts/{payment}/pdf` — quittance pour un paiement donné
- `GET /api/invoices/{invoice}/pdf` — facture client
- `GET /api/leases/{lease}/contract/pdf` — contrat de bail

### Templates Blade

- `resources/views/pdf/layouts/base.blade.php` — layout commun (header agence, footer, pagination)
- `resources/views/pdf/receipts/rent.blade.php`
- `resources/views/pdf/invoices/default.blade.php`
- `resources/views/pdf/leases/contract.blade.php`

## Contraintes strictes (métier)

- Les PDF sont générés à la volée, pas stockés sauf via `store()` (qui crée un `Document` lié et sauvegarde le fichier via medialibrary).
- Le logo agence est embarqué via `Agency::logo_url` ou placeholder si absent.
- Les montants utilisent le `formatCurrency` (XOF par défaut, §2.8).
- La quittance inclut : bien, locataire, période (mois), montant, méthode paiement, date.
- La facture inclut : émetteur (agence), destinataire (customer), lignes (item/qty/price/total), TVA si applicable (XOF n'en a pas par défaut), total, échéance.
- Le contrat de bail inclut : parties (bailleur/locataire), bien, durée, loyer, caution, garants, conditions particulières.
- Policies : quittance accessible au tenant du lease + owner + agent collab ; facture au customer destinataire + admin ; bail aux parties.
- Tous les PDF ont un footer avec : "Document généré le {date} — Takussan" + pagination "page X sur N".

## Delta à produire

- [ ] Service `App\Services\Pdf\DocumentPdfService` avec méthodes `render`, `store`, `stream`
- [ ] Layout Blade base + 3 templates (quittance, facture, bail)
- [ ] Endpoints PDF sur `LeaseController`, `InvoiceController`, `LeasePaymentController` (ou dédiés)
- [ ] Policies correspondantes
- [ ] Réutilisation par TCK-076 pour le PDF inventaire (ce ticket pose juste le service — le template inventaire est produit par TCK-076)
- [ ] Documentation courte `docs/pdf-templates.md` (1 page) expliquant comment ajouter un nouveau template
- [ ] Tests Feature :
  - `DocumentPdfServiceTest::test_render_returns_valid_pdf_binary` (header `%PDF-`)
  - `DocumentPdfServiceTest::test_store_creates_document_linked_to_model`
  - `ReceiptPdfTest::test_tenant_can_download_own_receipt`
  - `ReceiptPdfTest::test_other_user_gets_403`
  - `InvoicePdfTest::test_customer_receives_pdf_with_correct_amount`
  - `LeaseContractPdfTest::test_generates_with_all_parties`

## Critères d'acceptation

- [ ] AC1 — `GET /leases/{lease}/receipts/{payment}/pdf` retourne un PDF valide avec `Content-Type: application/pdf`, en-tête `%PDF-` présent
- [ ] AC2 — Le PDF quittance contient le nom du tenant, le bien, le mois concerné, le montant formaté XOF
- [ ] AC3 — La facture PDF affiche les lignes et le total, avec logo agence en header
- [ ] AC4 — Le contrat de bail PDF liste bailleur, locataire, garants, montant loyer, caution, période
- [ ] AC5 — Un user non autorisé reçoit 403 sur les endpoints PDF
- [ ] AC6 — Tous les PDF contiennent le footer "Document généré le {date} — Takussan" + pagination
- [ ] AC7 — `php artisan test --filter=Pdf` vert, Pint clean

## Hors périmètre

- Signature électronique (P3, eIDAS)
- OCR / extraction automatique (P3)
- Template inventaire (→ TCK-076 le produit en consommant ce service)
- Personnalisation des templates par agence (P3 — ici tous utilisent le même template)

## Notes d'implémentation

- **Service unique** : `App\Services\Pdf\DocumentPdfService` avec la signature
  `render / stream / store` demandée par le ticket. Conçu pour absorber le
  template inventaire de TCK-076 sans refacto (aucune logique spécifique
  receipts/invoices/leases dans le service — tout est dans les Blade).
- **Helper `formatCurrency`** annoncé §2.8 non présent dans le repo : les
  templates formatent via `number_format($n, 0, ',', ' ').' '.$currency`
  directement. À centraliser plus tard si plusieurs templates le dupliquent
  (ticket dédié possible).
- **`Response` non streamée** : `stream()` renvoie un `Illuminate\Http\Response`
  classique avec `Content-Type: application/pdf` et
  `Content-Disposition: inline` — cohérent avec l'attente d'un PDF complet
  servi à la volée. `streamedContent()` n'est donc pas applicable côté test.
- **Assertions de contenu** : le driver dompdf (utilisé en CI, cf.
  `phpunit.xml`) compresse les flux de page, ce qui rend les `str_contains`
  sur les octets PDF peu fiables. On assert donc contenu-métier via
  `View::make(...)->render()` au niveau HTML (cf. service test), et on se
  contente de `%PDF-` + heuristique de taille sur les bytes binaires côté
  endpoint.
- **Autorisation** : logiques centralisées dans `DocumentPdfController`
  (pas de `Policy` dédiée). Rationalisé par la forme courte (3 méthodes
  `authorize*`) et cohérent avec le pattern déjà en place sur
  `LeaseController::authorizeAccess`.
- **`Document::store()`** persiste via medialibrary (`addMediaFromString`)
  sur la collection `file` existante ; le type `DocumentType` est deviné
  depuis le nom du template.
- Doc : `docs/pdf-templates.md` (recette "ajouter un template en 5 min").
- Tests : `php artisan test --filter=Pdf` → 13 verts, dont les 6 listés au
  ticket. Full suite : 846 verts. Pint clean.
