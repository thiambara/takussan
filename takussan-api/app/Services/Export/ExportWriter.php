<?php

namespace App\Services\Export;

use Barryvdh\DomPDF\Facade\Pdf;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Writes dataset payloads ({columns, rows}) in CSV, XLSX and PDF formats.
 *
 * Each writer returns a Symfony response ready to be sent through the Laravel
 * controller — callers stay format-agnostic.
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
        $columns = $payload['columns'];
        $rows = $payload['rows'];

        return response()->stream(function () use ($columns, $rows) {
            $out = fopen('php://output', 'wb');
            // UTF-8 BOM so Excel on Windows recognises encoding
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $columns);
            foreach ($rows as $row) {
                $line = [];
                foreach ($columns as $col) {
                    $line[] = $row[$col] ?? '';
                }
                fputcsv($out, $line);
            }
            fclose($out);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'Cache-Control' => 'no-store, max-age=0',
        ]);
    }

    public function xlsx(array $payload): mixed
    {
        $filename = ($payload['filename'] ?? 'export').'.xlsx';
        $columns = $payload['columns'];
        $rows = array_map(fn ($row) => array_map(fn ($col) => $row[$col] ?? '', $columns), $payload['rows']);

        return Excel::download(new class($columns, $rows) implements FromArray, WithHeadings
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
        }, $filename);
    }

    public function pdf(array $payload): Response
    {
        $filename = ($payload['filename'] ?? 'export').'.pdf';
        $html = $this->renderPdfHtml($payload);

        $pdf = Pdf::loadHTML($html)->setPaper('a4', 'landscape');

        return $pdf->download($filename);
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
