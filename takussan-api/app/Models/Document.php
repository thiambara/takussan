<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Scout\Searchable;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class Document extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    protected $fillable = [
        'documentable_id', 'documentable_type', 'uploaded_by',
        'name', 'type', 'description',
        'is_verified', 'verified_by', 'verified_at',
        'expiry_date', 'metadata',
    ];

    protected $casts = [
        'type' => DocumentType::class,
        'is_verified' => 'boolean',
        'verified_at' => 'datetime',
        'expiry_date' => 'date',
        'metadata' => 'array',
    ];

    /**
     * TCK-697 (P23.01, ADR-0055 §3) — une PIÈCE : identité, RIB, NINEA. Rattachée à un profil, elle
     * est refusée sous impersonation ({@see self::isProfilePiece()}), comme `api/kyc/documents/*`.
     */
    public const PIECE_TYPES = [DocumentType::IdCard, DocumentType::Rib, DocumentType::Ninea];

    /** Les profils qu'un `Document` peut porter — les assistants d'accueil y rangent les pièces. */
    public const PROFILE_TYPES = [
        OwnerProfile::class,
        AgentProfile::class,
        AgencyAdminProfile::class,
        ServiceProviderProfile::class,
        PlatformProfile::class,
    ];

    protected static array $requestFilterable = ['documentable_id', 'documentable_type', 'uploaded_by', 'type', 'is_verified'];

    protected static array $requestSortable = ['id', 'created_at', 'expiry_date', 'name'];

    protected static array $requestLoadable = ['uploader', 'verifier'];

    protected static array $requestSearchFields = ['name', 'description'];

    protected static array $queryFields = [
        'id', 'documentable_id', 'documentable_type', 'uploaded_by',
        'name', 'type', 'description', 'is_verified', 'expiry_date',
        'created_at', 'updated_at',
        // TCK-987 (P58.02) — la clé de `verifier`, que `DocumentResource` rend déjà.
        'verified_by',
    ];

    /** TCK-697 — pièce (`PIECE_TYPES`) rattachée à un profil (`PROFILE_TYPES`). */
    /** TCK-820 (P23.04) — une pièce, quel que soit le modèle qui la porte. */
    public function isPiece(): bool
    {
        return in_array($this->type, self::PIECE_TYPES, true);
    }

    public function isProfilePiece(): bool
    {
        return $this->isPiece()
            && in_array($this->documentable_type, self::PROFILE_TYPES, true);
    }

    /**
     * TCK-697 — tout sauf les pièces rattachées à un profil. La négation est écrite colonne par
     * colonne, avec ses `NULL` : un `NOT (type IN … AND documentable_type IN …)` écarterait aussi
     * les lignes dont l'une des deux colonnes est nulle (`NOT NULL` n'est pas vrai).
     */
    public function scopeExcludingProfilePieces(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereNull('type')
            ->orWhereNotIn('type', array_map(fn (DocumentType $t) => $t->value, self::PIECE_TYPES))
            ->orWhereNull('documentable_type')
            ->orWhereNotIn('documentable_type', self::PROFILE_TYPES));
    }

    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->name,
            'description' => $this->description,
            'type' => $this->type?->value,
            'documentable_type' => $this->documentable_type,
            'documentable_id' => $this->documentable_id,
            'uploaded_by' => $this->uploaded_by,
            'created_at' => $this->created_at?->timestamp,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        return ! $this->trashed();
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('file')->singleFile();

        // Versioning collection — multiple files, ordered by order_column
        // (= version number set in custom_properties.version_number).
        // Privée, comme `file` : le défaut de `media-library.disk_name` EST le disque privé
        // (ADR-0029 §3). Le repli `'public'` qui figurait ici l'aurait exposée si la clé manquait.
        $this->addMediaCollection('versions');
    }

    /**
     * Return the media item currently marked as the active version, if any.
     * Uses a direct DB query to avoid Spatie's in-memory collection cache.
     */
    public function activeVersion(): ?Media
    {
        return Media::query()
            ->where('model_type', self::class)
            ->where('model_id', $this->id)
            ->where('collection_name', 'versions')
            ->get()
            ->first(fn (Media $m) => (bool) $m->getCustomProperty('is_active', false));
    }

    public function documentable(): MorphTo
    {
        return $this->morphTo();
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function shareLinks(): HasMany
    {
        return $this->hasMany(DocumentShareLink::class);
    }
}
