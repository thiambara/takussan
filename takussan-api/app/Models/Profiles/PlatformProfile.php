<?php

namespace App\Models\Profiles;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use Database\Factories\Profiles\PlatformProfileFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * TCK-278 — profil plateforme (cross-tenant) qui porte les rôles
 * `super_admin`, `support`, `viewer`. Un user a au plus un PlatformProfile
 * (contrainte unique `user_id` au niveau schéma).
 *
 * Cf. spec models-spec.md §51.
 */
class PlatformProfile extends AbstractModel
{
    /** @use HasFactory<PlatformProfileFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'level', 'granted_by_id', 'granted_at', 'revoked_at', 'notes',
    ];

    protected $casts = [
        'level' => PlatformProfileLevel::class,
        'granted_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    /**
     * spatie/laravel-query-builder hooks — la console super-admin (TCK-279+)
     * consommera ces filtres.
     */
    protected static array $requestFilterable = ['level', 'user_id'];

    protected static array $requestSortable = ['id', 'granted_at', 'revoked_at', 'level'];

    protected static array $requestLoadable = ['user', 'grantedBy'];

    protected static array $requestSearchFields = [];

    protected static array $queryFields = [
        'id', 'user_id', 'level', 'granted_by_id', 'granted_at', 'revoked_at', 'notes',
        'created_at', 'updated_at',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('revoked_at');
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null;
    }
}
