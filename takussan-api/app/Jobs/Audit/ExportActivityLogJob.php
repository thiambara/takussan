<?php

namespace App\Jobs\Audit;

use App\Http\Controllers\Api\ActivityLogExportController;
use App\Models\User;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Services\Audit\ActivityLogExporter;
use App\Support\Export\CsvCell;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Excel as ExcelType;
use Maatwebsite\Excel\Facades\Excel;
use RuntimeException;

class ExportActivityLogJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * TCK-1414 (P78.01) — sans délai propre, le job héritait des 60 s par défaut de `queue:work`
     * (le worker `default` tourne sans `--timeout`). Mesuré après le préchargement de
     * `ActivityLogExporter::buildPayload()`, sur 20 000 lignes : 12 s en CSV, 64 s en XLSX. Le
     * délai reste sous `retry_after` (90 s par défaut, `config/queue.php`) : au-delà, une seconde
     * copie démarrerait pendant que la première tourne. Le XLSX de plus de ~25 000 lignes reste
     * hors de portée (P78.03).
     */
    public int $timeout = 85;

    public function __construct(
        public readonly User $user,
        public readonly array $filters,
        // TCK-601 — l'agence du profil actif AU MOMENT de la demande : le worker n'a pas de requête.
        public readonly ?int $agencyId = null,
    ) {}

    public function handle(ActivityLogExporter $exporter): void
    {
        $format = $this->filters['format'] ?? 'csv';
        $payload = $exporter->buildPayload($this->user, $this->filters, $this->agencyId);
        $rowCount = count($payload['rows']);

        $filename = $payload['filename'].'.'.$format;
        // TCK-1054 (P63.01) — le fichier se nomme d'un identifiant opaque, rangé sous le dossier du
        // demandeur. Nommé du seul nom d'agence réduit à `[a-z0-9-]` et des dates, il était le même
        // pour deux agences homonymes (« Immo Dakar », « Immo-Dakar »), ou pour une agence nommée
        // « Platform » et un super-admin : le second export écrasait le premier, et le lien de l'un
        // servait le journal de l'autre. Le nom lisible ne sert plus qu'au `Content-Disposition`.
        $file = Str::uuid()->toString().'.'.$format;

        $content = $this->generateContent($format, $payload);
        // TCK-1084 (P77.03) — le disque `local` rend `false` au lieu de lever : un lien envoyé
        // sur un fichier jamais écrit rendait 404, et le job ne laissait aucune trace d'échec.
        $path = ActivityLogExportController::storagePath($this->user->id, $file);
        if (Storage::disk(ActivityLogExportController::DISK)->put($path, $content) !== true) {
            throw new RuntimeException("L'export du journal d'activité n'a pas pu écrire {$path}.");
        }

        // La signature couvre le demandeur, le fichier et le nom : le téléchargement ne sert que le
        // dossier du demandeur signé (`ActivityLogExportController::download`).
        $downloadUrl = URL::temporarySignedRoute(
            'activity-logs.export.download',
            now()->addHours(ActivityLogExportController::LINK_TTL_HOURS),
            ['user' => $this->user->id, 'file' => $file, 'name' => $filename],
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
            // TCK-601 (verif-601 n2) — PhpSpreadsheet type en formule toute chaîne qui commence par `=`.
            $rows = array_map(
                fn ($row) => CsvCell::line(array_map(fn ($col) => $row[$col] ?? '', $columns)),
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
            fputcsv($handle, CsvCell::line($line));
        }
        rewind($handle);
        $content = (string) stream_get_contents($handle);
        fclose($handle);

        return $content;
    }
}
