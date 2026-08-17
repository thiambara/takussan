<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Services\Membership\AgencyRoleCapabilityCache;
use Database\Factories\AgencyRoleFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

/**
 * TCK-279 — rôle métier d'une agence (models-spec.md §52).
 *
 * Remplace, côté agence, la table `roles` de `spatie/laravel-permission`
 * (paquet DÉSINSTALLÉ par TCK-278). Aucun trait `HasRoles` n'est impliqué :
 * le mécanisme est maison — `AgencyRole` + pivot `agency_role_capabilities`
 * + pointeur `agency_role_id` sur le profil.
 *
 * Modèle **additif** : une capacité est présente ou absente, jamais niée.
 *
 * @property int $id
 * @property int $agency_id
 * @property string $name
 * @property AgencyRoleBaseType $base_profile_type
 * @property string|null $description
 * @property bool $is_system
 * @property bool $is_clonable
 */
class AgencyRole extends AbstractModel
{
    /** @use HasFactory<AgencyRoleFactory> */
    use HasFactory;

    protected $fillable = [
        'agency_id', 'name', 'base_profile_type', 'description',
        'is_system', 'is_clonable',
    ];

    protected $casts = [
        'base_profile_type' => AgencyRoleBaseType::class,
        'is_system' => 'boolean',
        'is_clonable' => 'boolean',
    ];

    protected $attributes = [
        'is_system' => false,
        'is_clonable' => true,
    ];

    protected static array $requestFilterable = ['agency_id', 'base_profile_type', 'is_system', 'is_clonable'];

    protected static array $requestFilterablePartial = ['name'];

    protected static array $requestSortable = ['id', 'name', 'created_at', 'base_profile_type'];

    protected static array $requestLoadable = ['agency', 'capabilities'];

    protected static array $requestSearchFields = ['name', 'description'];

    protected static array $queryFields = [
        'id', 'agency_id', 'name', 'base_profile_type', 'description',
        'is_system', 'is_clonable', 'created_at', 'updated_at',
    ];

    /**
     * Toute écriture sur un rôle invalide son cache de capacités. Placé sur
     * le modèle et non dans le contrôleur : la spec §52 exige que l'édition
     * « prenne effet immédiatement », et un cache n'est sûr que si son
     * invalidation ne dépend pas du chemin d'appel.
     */
    protected static function booted(): void
    {
        static::saved(static fn (self $role) => app(AgencyRoleCapabilityCache::class)->forget((int) $role->id));
        static::deleted(static fn (self $role) => app(AgencyRoleCapabilityCache::class)->forget((int) $role->id));
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /**
     * Lignes du pivot. Ce n'est pas un `belongsToMany` : le « catalogue »
     * en face est une enum PHP, pas une table (ADR-0003).
     */
    public function capabilities(): HasMany
    {
        return $this->hasMany(AgencyRoleCapability::class);
    }

    public function agentProfiles(): HasMany
    {
        return $this->hasMany(AgentProfile::class);
    }

    public function agencyAdminProfiles(): HasMany
    {
        return $this->hasMany(AgencyAdminProfile::class);
    }

    public function ownerProfiles(): HasMany
    {
        return $this->hasMany(OwnerProfile::class);
    }

    /**
     * TCK-315 (ADR-0016) — le pendant des trois relations ci-dessus pour
     * les prestataires : le porteur est la COLLABORATION, pas le profil.
     */
    public function serviceProviderCollaborations(): HasMany
    {
        return $this->hasMany(ServiceProviderAgencyCollaboration::class);
    }

    public function scopeSystem(Builder $query): Builder
    {
        return $query->where('is_system', true);
    }

    public function scopeCustom(Builder $query): Builder
    {
        return $query->where('is_system', false);
    }

    public function scopeWithinAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }

    public function scopeOfBaseType(Builder $query, AgencyRoleBaseType|string $type): Builder
    {
        return $query->where('base_profile_type', $type instanceof AgencyRoleBaseType ? $type->value : $type);
    }

    /**
     * Capacités effectives de ce rôle, dédupliquées et filtrées sur l'enum.
     * Une valeur devenue inconnue (capacité retirée du catalogue) est
     * ignorée plutôt que de faire lever `Capability::from()`.
     *
     * @return Collection<int,Capability>
     */
    public function capabilityEnums(): Collection
    {
        $rows = $this->relationLoaded('capabilities')
            ? $this->capabilities
            : $this->capabilities()->get();

        return collect($rows)
            ->map(fn (AgencyRoleCapability $row): ?Capability => Capability::tryFrom((string) $row->capability))
            ->filter()
            ->unique(fn (Capability $c): string => $c->value)
            ->values();
    }

    public function hasCapability(Capability $capability): bool
    {
        return app(AgencyRoleCapabilityCache::class)->allows((int) $this->id, $capability);
    }

    /**
     * Porteurs de ce rôle. Sert au 409 de `DELETE` (spec : « liste des
     * profils en cause »).
     *
     * **Pas toujours un profil, depuis TCK-315 (ADR-0016)** : pour
     * `base_profile_type = service_provider`, le porteur est une ligne de
     * `service_provider_agency_collaborations`. Sans cette branche, un rôle
     * prestataire encore porté serait déclaré libre par l'API, puis
     * refusé par la FK `restrictOnDelete` — un 500 au lieu d'un 409.
     *
     * @return EloquentCollection<int,Model>
     */
    public function attachedProfiles(): EloquentCollection
    {
        $query = $this->holderQuery();

        return $query === null ? new EloquentCollection : $query->get();
    }

    public function attachedProfilesCount(): int
    {
        $query = $this->holderQuery();

        return $query === null ? 0 : $query->count();
    }

    /**
     * Requête sur la table qui porte `agency_role_id` pour ce type de rôle,
     * ou `null` si aucune ne le porte (`platform`, ou une valeur inconnue).
     *
     * ⚠️ Ne compte pas les lignes soft-deletées, alors que la FK
     * `restrictOnDelete`, elle, les voit. La limite préexiste à TCK-315 sur
     * les trois profils ; on la reproduit ici plutôt que de la corriger
     * pour un seul type — un comptage qui diffère d'une branche à l'autre
     * serait plus coûteux à lire que la limite elle-même.
     */
    private function holderQuery(): ?Builder
    {
        $type = $this->base_profile_type;
        if (! $type instanceof AgencyRoleBaseType) {
            return null;
        }

        if ($type === AgencyRoleBaseType::ServiceProvider) {
            return ServiceProviderAgencyCollaboration::query()->where('agency_role_id', $this->id);
        }

        $class = $type->profileClass();

        return $class === null ? null : $class::query()->where('agency_role_id', $this->id);
    }
}
