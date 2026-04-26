<?php

namespace App\Jobs\Audit;

use App\Models\User;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Services\Audit\ActivityLogExporter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Excel as ExcelType;
use Maatwebsite\Excel\Facades\Excel;

class ExportActivityLogJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly array $filters,
    ) {}

    public function handle(ActivityLogExporter $exporter): void
    {
        $format = $this->filters['format'] ?? 'csv';
        $payload = $exporter->buildPayload($this->user, $this->filters);
        $rowCount = count($payload['rows']);

        $filename = $payload['filename'].'.'.$format;
        $storagePath = 'exports/audit/'.$filename;

        $content = $this->generateContent($format, $payload);
        Storage::put($storagePath, $content);

        $downloadUrl = URL::temporarySignedRoute(
            'activity-logs.export.download',
            now()->addHours(24),
            ['path' => $storagePath],
        );

        $this->user->notify(new ActivityLogExportReadyNotification(
            downloadUrl: $downloadUrl,
            filename: $filename,
            rowCount: $rowCount,
        ));
    }

    private function generateContent(string $format, array $payload): string
    {
        if ($format === 'xlsx') {
            // Render directly to a binary string. Capturing
            // BinaryFileResponse::sendContent() via output buffering is
            // brittle in a queue worker (no active SAPI buffer), so use
            // PhpSpreadsheet's raw() exporter instead.
            $columns = $payload['columns'];
            $rows = array_map(
                fn ($row) => array_map(fn ($col) => $row[$col] ?? '', $columns),
                $payload['rows']
            );
            $sheet = new class($columns, $rows) implements FromArray, WithHeadings
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

            return (string) Excel::raw($sheet, ExcelType::XLSX);
        }

        // CSV: render rows into an in-memory buffer using fputcsv so
        // escaping matches what ExportWriter::csv() produces synchronously.
        $columns = $payload['columns'];
        $rows = $payload['rows'];

        $handle = fopen('php://temp', 'w+b');
        // UTF-8 BOM so Excel on Windows recognises encoding.
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, $columns);
        foreach ($rows as $row) {
            $line = [];
            foreach ($columns as $col) {
                $line[] = $row[$col] ?? '';
            }
            fputcsv($handle, $line);
        }
        rewind($handle);
        $content = (string) stream_get_contents($handle);
        fclose($handle);

        return $content;
    }
}
