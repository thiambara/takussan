<?php

namespace App\Jobs\Audit;

use App\Models\User;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Services\Audit\ActivityLogExporter;
use App\Services\Export\ExportWriter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExportActivityLogJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly array $filters,
    ) {}

    public function handle(ActivityLogExporter $exporter, ExportWriter $writer): void
    {
        $format = $this->filters['format'] ?? 'csv';
        $payload = $exporter->buildPayload($this->user, $this->filters);
        $rowCount = count($payload['rows']);

        $filename = $payload['filename'].'.'.$format;
        $storagePath = 'exports/audit/'.$filename;

        $content = $this->generateContent($writer, $format, $payload);
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

    private function generateContent(ExportWriter $writer, string $format, array $payload): string
    {
        if ($format === 'xlsx') {
            $response = $writer->xlsx($payload);

            // BinaryFileResponse — capture via temporary file
            ob_start();
            $response->sendContent();

            return (string) ob_get_clean();
        }

        // CSV: capture the streamed response
        $response = $writer->csv($payload);
        assert($response instanceof StreamedResponse);

        ob_start();
        $response->sendContent();

        return (string) ob_get_clean();
    }
}
