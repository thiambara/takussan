<?php

namespace App\Services\Export;

use App\Http\Controllers\Api\ExportController;
use App\Models\Activity;
use App\Models\ExportFile;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * TCK-2866 (ADR-0115) — garde le fichier d'un export pour « Retélécharger » : les octets mêmes que
 * {@see ExportController::show()} sert, sur le disque privé (`media-library.disk_name`),
 * `exports.retention_days` jours, liés à leur auteur et à la ligne du journal qui les décrit.
 *
 * Un échec d'écriture ne prive pas l'auteur de son fichier : il est signalé (`report`) et l'export
 * est servi quand même ; « Mes derniers exports » le dit alors indisponible.
 */
final class ExportFiles
{
    /** @param  array{bytes: string, filename: string, mime: string}  $file */
    public function keep(User $author, ?int $agencyId, Activity $activity, string $entity, string $format, bool $ownLinesOnly, array $file): ?ExportFile
    {
        $disk = (string) config('media-library.disk_name');
        $path = sprintf('exports/%d/%s-%s', $author->id, Str::uuid()->toString(), $file['filename']);

        try {
            Storage::disk($disk)->put($path, $file['bytes']);

            return ExportFile::query()->create([
                'agency_id' => $agencyId,
                'user_id' => $author->id,
                'activity_id' => $activity->id,
                'entity' => $entity,
                'format' => $format === 'excel' ? 'xlsx' : $format,
                'own_lines_only' => $ownLinesOnly,
                'filename' => $file['filename'],
                'mime' => $file['mime'],
                'size_bytes' => strlen($file['bytes']),
                'disk' => $disk,
                'path' => $path,
                'expires_at' => now()->addDays(max(1, (int) config('exports.retention_days', 7))),
            ]);
        } catch (Throwable $e) {
            report($e);
            Storage::disk($disk)->delete($path);

            return null;
        }
    }

    /** Les octets gardés, ou `null` si le fichier a disparu du disque. */
    public function bytes(ExportFile $file): ?string
    {
        $disk = Storage::disk($file->disk);

        return $disk->exists($file->path) ? $disk->get($file->path) : null;
    }

    /** Efface le fichier et sa ligne (purge, ou fichier perdu). Idempotent. */
    public function forget(ExportFile $file): void
    {
        Storage::disk($file->disk)->delete($file->path);
        $file->delete();
    }
}
