# PDF templates

Takussan generates business PDFs (quittances, factures, baux, rapports
inventaire, …) through a single service backed by **spatie/laravel-pdf** and
a small set of Blade templates. The service lives in
`App\Services\Pdf\DocumentPdfService` and exposes three stable methods:

| Method                                           | Returns                       | When to use                                           |
| ------------------------------------------------ | ----------------------------- | ----------------------------------------------------- |
| `render(string $template, array $data)`          | raw PDF bytes                 | emails attachments, background jobs, queue handlers   |
| `stream(string $template, array $data, ?name)`   | `Illuminate\Http\Response`    | controller responses (inline, `Content-Type: application/pdf`) |
| `store(string $template, array $data, Model, ?name)` | persisted `App\Models\Document` | archive the PDF, link to a morphable target via medialibrary |

All templates share the layout `resources/views/pdf/layouts/base.blade.php`,
which handles the agency logo, the pagination and the footer
(`Document généré le … — Takussan`). You only write the body.

## Adding a new template (5 min recipe)

1. **Create the Blade file** under `resources/views/pdf/<family>/<name>.blade.php`:

    ```blade
    @extends('pdf.layouts.base')

    @section('content')
        <h1>My document</h1>
        <p>Hello {{ $customer->first_name }}.</p>
    @endsection
    ```

2. **Invoke the service** from a controller or job:

    ```php
    return app(DocumentPdfService::class)->stream(
        'pdf.<family>.<name>',
        [
            'title' => 'My document',
            'document_label' => 'Badge',   // shown in the header
            'agency' => $lease->agency,    // optional — exposes the logo
            'customer' => $customer,
        ],
        'my-document.pdf',
    );
    ```

3. **That's it.** No registration, no service-container wiring. The service
   rejects missing templates with HTTP 500.

### Shared variables (already injected by `prepareData()`)

| Variable               | Source                                                    |
| ---------------------- | --------------------------------------------------------- |
| `$title`               | passed-in or defaults to `"Document"`                     |
| `$document_label`      | badge in the header                                       |
| `$agency`              | `Agency` model (or `null`)                                |
| `$agency_logo_url`     | derived from `$agency->getFirstMediaUrl('logo')` if absent |
| `$generated_at`        | `Carbon` — now()                                          |
| `$footer_note`         | "Document généré le … — Takussan"                         |

You can override any of them via `$data`.

## Policies

Each endpoint authorises against a dedicated rule. For business documents
today, the pattern is:

| Document            | Allowed actors                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| Quittance (receipt) | tenant of the lease, landlord, agency staff, property collaborator, admin     |
| Facture (invoice)   | customer destinataire, issuer, agency, admin                                  |
| Contrat de bail     | tenant, landlord, agency, admin                                               |

See `App\Http\Controllers\Api\DocumentPdfController` for the authoritative
implementation.

## Driver / environment

`config/laravel-pdf.php` selects the driver. Production uses the cloudflare
browserless service; CI/tests pin `dompdf` via `phpunit.xml`
(`LARAVEL_PDF_DRIVER=dompdf`). Templates must render on both — avoid
JS-driven layouts, and keep CSS inlined in `<style>` for dompdf.

## Persistence (`store()`)

When you call `store()`, the service:

1. Renders the PDF bytes.
2. Creates a new `Document` with a guessed `type` (`receipt`, `invoice`,
   `lease_contract`, `inventory_report` or `other`) and an auto-filled
   `metadata.pdf_template` field.
3. Attaches the bytes via `spatie/laravel-medialibrary` on the `file`
   collection.

`uploaded_by` defaults to `auth()->user()->id`; pass `uploaded_by_id` in
`$data` when running outside an HTTP context (e.g. queued job).

## Adding tests

Pattern used by TCK-077:

-   Feature test against the endpoint: `assertHeader('Content-Type', 'application/pdf')`
    then `str_starts_with($response->getContent(), '%PDF-')`.
-   For content assertions (tenant name, amount, …) render the Blade to
    HTML via `View::make(...)->render()` and use `assertStringContainsString` —
    dompdf compresses page streams, so substring checks on the binary are
    unreliable.
