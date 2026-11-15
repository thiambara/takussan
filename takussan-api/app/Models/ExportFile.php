<?php

namespace App\Models;

use App\Console\Commands\PurgeExpiredExportFiles;
use App\Http\Controllers\Api\Me\MeExportsController;
use App\Models\Bases\AbstractModel;
use App\Services\Export\ExportFiles;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * TCK-2866 (ADR-0115) — le fichier gardé d'un export, écrit par {@see ExportFiles}, retéléchargé par
 * son seul auteur ({@see MeExportsController::download()}) jusqu'à `expires_at`, puis effacé par
 * {@see PurgeExpiredExportFiles}.
 *
 * @property int $id
 * @property ?int $agency_id
 * @property int $user_id
 * @property int $activity_id
 * @property string $entity
 * @property string $format
 * @property bool $own_lines_only
 * @property string $filename
 * @property string $mime
 * @property int $size_bytes
 * @property string $disk
 * @property string $path
 * @property Carbon $expires_at
 */
class ExportFile extends AbstractModel
{
    protected $fillable = [
        'agency_id', 'user_id', 'activity_id', 'entity', 'format', 'own_lines_only',
        'filename', 'mime', 'size_bytes', 'disk', 'path', 'expires_at',
    ];

    protected $casts = [
        'own_lines_only' => 'boolean',
        'size_bytes' => 'integer',
        'path' => 'encrypted',
        'expires_at' => 'datetime',
    ];

    /** Le disque et le chemin ne sortent jamais de l'API. */
    protected $hidden = ['disk', 'path'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
