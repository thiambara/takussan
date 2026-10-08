<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Integration extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes {
        Auditable::buildChanges as private buildWhitelistedChanges;
    }

    /**
     * TCK-601 — liste blanche du journal. Les identifiants n'y entrent JAMAIS : un changement s'y lit
     * `credentials_changed: true`, sans valeur ({@see self::buildChanges()}). Ni `last_used_at`, ni la
     * santé : un appel ou une sonde n'est pas un acte de gouvernance.
     */
    public const AUDIT_ONLY = ['provider', 'is_active'];

    protected $fillable = [
        'provider', 'agency_id', 'credentials', 'is_active',
        'last_used_at', 'last_health_check_at', 'health_status', 'metadata',
    ];

    protected $hidden = ['credentials'];

    protected $casts = [
        'credentials' => 'encrypted:array',
        'is_active' => 'boolean',
        'last_used_at' => 'datetime',
        'last_health_check_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['agency_id', 'provider', 'is_active', 'health_status'];

    protected static array $requestSortable = ['id', 'created_at', 'provider'];

    // `metadata` is allowed so the admin UI can list provider notes via
    // sparse fieldsets (TCK-068). `credentials` remains hidden at all layers.
    protected static array $queryFields = ['id', 'agency_id', 'provider', 'is_active', 'last_used_at', 'last_health_check_at', 'health_status', 'metadata', 'created_at', 'updated_at'];

    /**
     * Le drapeau `credentials_changed` remplace la valeur : posé à la création avec des identifiants,
     * et à toute modification qui les touche — même seule, sinon le changement de secret passerait
     * pour « rien ».
     *
     * @return array<string, mixed>
     */
    protected function buildChanges(string $processingEvent): array
    {
        $changes = $this->buildWhitelistedChanges($processingEvent);

        $touched = match ($processingEvent) {
            'created' => ($this->getAttributes()['credentials'] ?? null) !== null,
            'updated' => $this->wasChanged('credentials'),
            default => false,
        };
        if ($touched) {
            $changes['attributes'] = ($changes['attributes'] ?? []) + ['credentials_changed' => true];
        }

        return $changes;
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }
}
