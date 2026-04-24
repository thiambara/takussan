<?php

namespace App\Services\Pdf;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\View;
use Spatie\LaravelPdf\Facades\Pdf;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * Central PDF rendering service for business documents (receipts, invoices,
 * leases, inventories, …) — TCK-077.
 *
 * Templates live under `resources/views/pdf/**` and share
 * `pdf.layouts.base`, which enforces the common header/footer (agency logo,
 * "Document généré le {date} — Takussan", pagination).
 *
 * The service is transport-agnostic: `render()` returns raw bytes, `stream()`
 * returns an HTTP response and `store()` persists the PDF as a `Document`
 * model via spatie/medialibrary linked to any polymorphic target.
 *
 * New templates only require a Blade file; no code change here — see
 * docs/pdf-templates.md.
 */
class DocumentPdfService
{
    /**
     * Render a template to raw PDF bytes.
     *
     * @param  string  $template  Blade view (dot-notation), e.g. `pdf.receipts.rent`
     * @param  array<string, mixed>  $data  Variables shared with the view. The base
     *                                      layout reads `agency`, `title`, `document_label`.
     */
    public function render(string $template, array $data): string
    {
        $this->assertTemplateExists($template);

        $viewData = $this->prepareData($data);

        return Pdf::view($template, $viewData)
            ->format('a4')
            ->generatePdfContent();
    }

    /**
     * Render the template and return an inline HTTP response suitable for
     * returning from a controller (`Content-Type: application/pdf`).
     */
    public function stream(string $template, array $data, ?string $filename = null): SymfonyResponse
    {
        $bytes = $this->render($template, $data);
        $name = $filename ?: $this->defaultFilename($template, $data);

        return new Response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => sprintf('inline; filename="%s"', $name),
            'Cache-Control' => 'private, max-age=0, no-cache',
        ]);
    }

    /**
     * Render the template and persist the resulting PDF as a `Document` tied
     * polymorphically to `$attachTo`. The file is stored via
     * `spatie/laravel-medialibrary` on the `file` collection.
     */
    public function store(string $template, array $data, Model $attachTo, ?string $filename = null): Document
    {
        $bytes = $this->render($template, $data);
        $name = $filename ?: $this->defaultFilename($template, $data);

        $uploaderId = $data['uploaded_by_id']
            ?? $data['uploader_id']
            ?? optional(auth()->user())->id;

        abort_unless($uploaderId, 500, 'DocumentPdfService::store() requires an authenticated user or explicit uploaded_by_id.');

        /** @var Document $document */
        $document = new Document([
            'name' => pathinfo($name, PATHINFO_FILENAME),
            'type' => $this->guessDocumentType($template)->value,
            'uploaded_by' => $uploaderId,
            'description' => $data['description'] ?? null,
            'metadata' => array_filter([
                'pdf_template' => $template,
                'generated_at' => now()->toIso8601String(),
            ]),
        ]);

        $document->documentable()->associate($attachTo);

        // Wrap persistence so a media-write failure rolls back the Document row
        // (avoids orphan DB rows pointing at no media). A file written before
        // the failure is harmless: nothing in the DB references it.
        return DB::transaction(function () use ($document, $bytes, $name) {
            $document->save();

            // Persist bytes via medialibrary. fromString keeps the binary in-
            // memory — no temp-file cleanup required.
            $document->addMediaFromString($bytes)
                ->usingFileName($name)
                ->usingName($document->name)
                ->toMediaCollection('file');

            return $document->refresh();
        });
    }

    /**
     * Merge caller data with shared template context (agency, date, labels).
     */
    protected function prepareData(array $data): array
    {
        $agency = $data['agency'] ?? null;
        if ($agency instanceof Agency) {
            $logoUrl = $agency->getFirstMediaUrl('logo') ?: null;
        } else {
            $logoUrl = $data['agency_logo_url'] ?? null;
        }

        // Normalize generated_at: callers may pass a Carbon, a parseable string,
        // or omit it entirely. The footer needs a Carbon or translatedFormat()
        // fatals.
        $rawGeneratedAt = $data['generated_at'] ?? null;
        $generatedAt = $rawGeneratedAt instanceof Carbon
            ? $rawGeneratedAt
            : ($rawGeneratedAt ? Carbon::parse($rawGeneratedAt) : now());

        $merged = array_merge([
            'agency' => $agency,
            'agency_logo_url' => $logoUrl,
            'title' => $data['title'] ?? 'Document',
            'document_label' => $data['document_label'] ?? 'Document',
        ], $data);

        $merged['generated_at'] = $generatedAt;
        $merged['footer_note'] = sprintf(
            'Document généré le %s — Takussan',
            $generatedAt->translatedFormat('d/m/Y H:i'),
        );

        return $merged;
    }

    protected function assertTemplateExists(string $template): void
    {
        if (! View::exists($template)) {
            abort(500, "PDF template '{$template}' not found.");
        }
    }

    protected function defaultFilename(string $template, array $data): string
    {
        if (! empty($data['filename'])) {
            return str_ends_with($data['filename'], '.pdf')
                ? $data['filename']
                : $data['filename'].'.pdf';
        }

        $slug = str_replace('.', '-', $template);

        return $slug.'-'.now()->format('Ymd-His').'.pdf';
    }

    protected function guessDocumentType(string $template): DocumentType
    {
        return match (true) {
            str_contains($template, 'receipt') => DocumentType::Receipt,
            str_contains($template, 'invoice') => DocumentType::Invoice,
            str_contains($template, 'lease') || str_contains($template, 'contract') => DocumentType::LeaseContract,
            str_contains($template, 'inventor') => DocumentType::InventoryReport,
            default => DocumentType::Other,
        };
    }
}
