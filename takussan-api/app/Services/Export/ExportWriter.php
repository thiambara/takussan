<?php

namespace App\Services\Export;

use App\Support\Export\CsvCell;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Facades\Excel;
use Spatie\LaravelPdf\Facades\Pdf;
use Spatie\LaravelPdf\PdfBuilder;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Writes dataset payloads ({columns, rows}) in CSV, XLSX and PDF formats.
 *
 * Each writer returns a Responsable / Response object ready to be returned from
 * a Laravel controller — callers stay format-agnostic.
 */
class ExportWriter
{
    public function respond(string $format, array $payload): mixed
    {
        return match (strtolower($format)) {
            'csv' => $this->csv($payload),
            'xlsx', 'excel' => $this->xlsx($payload),
            'pdf' => $this->pdf($payload),
            default => throw new \InvalidArgumentException("Unsupported export format: {$format}"),
        };
    }

    public function csv(array $payload): StreamedResponse
    {
        $filename = ($payload['filename'] ?? 'export').'.csv';

        return response()->stream(function () use ($payload) {
            $out = fopen('php://output', 'wb');
            $this->writeCsv($out, $payload);
            fclose($out);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'Cache-Control' => 'no-store, max-age=0',
        ]);
    }

    /**
     * TCK-2866 (ADR-0115) — le fichier d'un export en OCTETS, une seule fois : servi tel quel
     * ({@see self::serve()}) et gardé tel quel pour « Retélécharger ». Mêmes contenus que
     * {@see self::respond()}.
     *
     * @return array{bytes: string, filename: string, mime: string}
     */
    public function render(string $format, array $payload): array
    {
        $base = $payload['filename'] ?? 'export';

        return match (strtolower($format)) {
            'csv' => ['bytes' => $this->csvBytes($payload), 'filename' => "{$base}.csv", 'mime' => self::MIME['csv']],
            'xlsx', 'excel' => ['bytes' => Excel::raw($this->sheet($payload), \Maatwebsite\Excel\Excel::XLSX), 'filename' => "{$base}.xlsx", 'mime' => self::MIME['xlsx']],
            'pdf' => ['bytes' => Pdf::html($this->renderPdfHtml($payload))->format('a4')->landscape()->generatePdfContent(), 'filename' => "{$base}.pdf", 'mime' => self::MIME['pdf']],
            default => throw new \InvalidArgumentException("Unsupported export format: {$format}"),
        };
    }

    /**
     * TCK-2866 — la réponse d'un fichier rendu par {@see self::render()} (ou relu du disque) : les
     * en-têtes de {@see self::respond()}. Le CSV reste une réponse diffusée.
     */
    public function serve(string $bytes, string $filename, string $mime): Response
    {
        $headers = [
            'Content-Type' => $mime,
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'Cache-Control' => 'no-store, max-age=0',
        ];

        if ($mime === self::MIME['csv']) {
            return response()->stream(function () use ($bytes): void {
                echo $bytes;
            }, 200, $headers);
        }

        return new Response($bytes, 200, $headers + ['Content-Length' => (string) strlen($bytes)]);
    }

    /** @var array<string, string> */
    public const MIME = [
        'csv' => 'text/csv; charset=UTF-8',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'pdf' => 'application/pdf',
    ];

    private function csvBytes(array $payload): string
    {
        $out = fopen('php://temp', 'w+b');
        $this->writeCsv($out, $payload);
        rewind($out);
        $bytes = (string) stream_get_contents($out);
        fclose($out);

        return $bytes;
    }

    /** @param  resource  $out */
    private function writeCsv($out, array $payload): void
    {
        $columns = $payload['columns'];
        // UTF-8 BOM so Excel on Windows recognises encoding
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $columns);
        foreach ($payload['rows'] as $row) {
            $line = [];
            foreach ($columns as $col) {
                $line[] = $row[$col] ?? '';
            }
            fputcsv($out, CsvCell::line($line));
        }
    }

    public function xlsx(array $payload): mixed
    {
        $filename = ($payload['filename'] ?? 'export').'.xlsx';

        return Excel::download($this->sheet($payload), $filename);
    }

    /** La feuille d'un export (TCK-2866 : partagée par {@see self::xlsx()} et {@see self::render()}). */
    private function sheet(array $payload): FromArray
    {
        $columns = $payload['columns'];
        // TCK-601 (verif-601 n2) — PhpSpreadsheet type en formule toute chaîne qui commence par `=`.
        $rows = array_map(fn ($row) => CsvCell::line(array_map(fn ($col) => $row[$col] ?? '', $columns)), $payload['rows']);

        return new class($columns, $rows) implements FromArray, WithHeadings
        {
            public function __construct(private readonly array $columns, private readonly array $rows) {}

            public function array(): array
            {
                return $this->rows;
            }

            public function headings(): array
            {
                return $this->columns;
            }
        };
    }

    public function pdf(array $payload): PdfBuilder
    {
        $filename = ($payload['filename'] ?? 'export').'.pdf';
        $html = $this->renderPdfHtml($payload);

        return Pdf::html($html)
            ->format('a4')
            ->landscape()
            ->download($filename);
    }

    protected function renderPdfHtml(array $payload): string
    {
        $columns = $payload['columns'];
        $rows = $payload['rows'];
        $filename = htmlspecialchars((string) ($payload['filename'] ?? 'Export'), ENT_QUOTES, 'UTF-8');

        $headCells = '';
        foreach ($columns as $col) {
            $headCells .= '<th>'.htmlspecialchars((string) $col, ENT_QUOTES, 'UTF-8').'</th>';
        }

        $bodyRows = '';
        foreach ($rows as $row) {
            $cells = '';
            foreach ($columns as $col) {
                $value = $row[$col] ?? '';
                $cells .= '<td>'.htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8').'</td>';
            }
            $bodyRows .= '<tr>'.$cells.'</tr>';
        }

        $generatedAt = htmlspecialchars(now()->toDateTimeString(), ENT_QUOTES, 'UTF-8');

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{$filename}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #111; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        small { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
        th { background: #f2f4f8; font-weight: 600; }
        tr:nth-child(even) td { background: #fafafa; }
    </style>
</head>
<body>
    <h1>{$filename}</h1>
    <small>Généré le {$generatedAt}</small>
    <table>
        <thead><tr>{$headCells}</tr></thead>
        <tbody>{$bodyRows}</tbody>
    </table>
</body>
</html>
HTML;
    }
}
