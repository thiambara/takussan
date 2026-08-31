<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\CollaborationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * ⚠️ **PROFIL NON EXPOSÉ depuis le 2026-08-31 — TCK-495, ADR-0027.**
 *
 * Ce modèle, sa table, sa migration, sa factory et ses seeders VIVENT. Ce qui
 * a disparu est la surface : `broker` ne figure plus dans
 * `ActiveProfileResolver::TYPE_MAP` (il n'est donc plus commutable), ni dans
 * `HasProfiles::profileTypes()` (il n'est donc plus émis dans `roles`), ni dans
 * `HasProfiles::profiles()`.
 *
 * **Pourquoi il n'a pas été supprimé** : une migration de suppression est
 * irréversible en pratique, et le retrait décidé porte sur l'EXPOSITION, pas
 * sur la donnée. Les lectures de modèle restent en place et sont légitimes —
 * console super-admin, export RGPD, `PropertyResource::ownerActsAsAgent()`.
 *
 * **Le réexposer demande plus que de remettre l'alias** : une porte qui crée le
 * profil, des capacités déclarées dans `MembershipCapabilityResolver` (un profil
 * sans capacité déclarée REFUSE tout en silence), et des écrans. La garde
 * `AppSidebar.audience.test.tsx` refuse tout alias de `TYPE_MAP` qui n'ouvre
 * rien de plus que le socle du menu.
 */
class BrokerAgencyCollaboration extends AbstractModel
{
    use SoftDeletes;

    protected $fillable = [
        'broker_profile_id', 'agency_id', 'status',
        'started_at', 'ended_at', 'metadata',
    ];

    protected $casts = [
        'status' => CollaborationStatus::class,
        'started_at' => 'date',
        'ended_at' => 'date',
        'metadata' => 'array',
    ];

    public function brokerProfile(): BelongsTo
    {
        return $this->belongsTo(BrokerProfile::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', CollaborationStatus::Active->value);
    }
}
