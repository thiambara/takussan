<?php

namespace App\Models;

use App\Http\Filters\TypedExactFilter;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Support\Http\ParametreUnique;
use Carbon\CarbonImmutable;
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
use Spatie\QueryBuilder\AllowedFilter;

class Document extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    protected $fillable = [
        'documentable_id', 'documentable_type', 'uploaded_by',
        'name', 'type', 'description',
        'is_verified', 'verified_by', 'verified_at',
        'expiry_date', 'metadata',
        // TCK-2759 — un document de fiche client gardé pour l'agence (ADR-0099, amendement du 2026-11-12).
        'is_internal',
    ];

    /** TCK-2759 — la valeur de la colonne en mémoire aussi : un document créé sans le dire n'est pas interne. */
    protected $attributes = ['is_internal' => false];

    protected $casts = [
        'type' => DocumentType::class,
        'is_verified' => 'boolean',
        'is_internal' => 'boolean',
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

    // TCK-2655 — `documentable_type` et `expiring_within_days` sont des filtres sur mesure
    // ({@see self::customQueryFilters()}).
    protected static array $requestFilterable = ['documentable_id', 'uploaded_by', 'type', 'is_verified'];

    /**
     * TCK-2655 (ADR-0099 §5) — les cibles se nomment par un alias court, plus par le nom de classe
     * complet (encore accepté). `owner_profile` est lisible en liste ; `store` garde sa propre liste.
     */
    public const TARGET_ALIASES = [
        'property' => Property::class,
        'lease' => Lease::class,
        'customer' => Customer::class,
        'owner_profile' => OwnerProfile::class,
        'inventory' => Inventory::class,
        'booking' => Booking::class,
        'user' => User::class,
        'agency' => Agency::class,
    ];

    /** TCK-2655 — « expire bientôt » : la pastille de l'agence et le compte du coffre (ambre à 42 j). */
    public const EXPIRING_SOON_DAYS = 60;

    /** TCK-2655 — le fuseau dans lequel se lit « aujourd'hui » pour l'expiration. */
    public const EXPIRY_TIMEZONE = 'Africa/Dakar';

    /** Le nom de classe d'un alias de cible, ou du nom complet ; nul s'il n'est pas une cible connue. */
    public static function targetClass(mixed $type): ?string
    {
        if (! is_string($type) || $type === '') {
            return null;
        }
        $lower = strtolower($type);

        return self::TARGET_ALIASES[$lower]
            ?? collect(self::TARGET_ALIASES)->first(fn (string $fqcn): bool => strtolower($fqcn) === $lower);
    }

    /**
     * TCK-2655 — `filter[documentable_type]=lease` (alias ou nom complet, liste à virgules ; un type
     * inconnu ne rend rien) et `filter[expiring_within_days]=N` : expire entre aujourd'hui (Dakar)
     * et dans N jours inclus ; déjà expiré, sans date ou valeur illisible : non.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('documentable_type', function (Builder $q, mixed $value): void {
                $raw = ParametreUnique::valeur($value);
                $classes = array_values(array_filter(array_map(
                    fn (string $t): ?string => self::targetClass(trim($t)),
                    $raw === null ? [] : explode(',', $raw),
                )));
                $classes === [] ? $q->whereRaw('1 = 0') : $q->whereIn($q->qualifyColumn('documentable_type'), $classes);
            })->delimiter(''),
            AllowedFilter::callback('expiring_within_days', function (Builder $q, mixed $value): void {
                $raw = ParametreUnique::valeur($value);
                if ($raw === null || ! ctype_digit($raw) || strlen($raw) > 4) {
                    $q->whereRaw('1 = 0');

                    return;
                }
                $today = self::today();
                $q->whereBetween($q->qualifyColumn('expiry_date'), [$today->toDateString(), $today->addDays((int) $raw)->toDateString()]);
            })->delimiter(''),
        ];
    }

    /** Aujourd'hui à Dakar, en date de calendrier. */
    public static function today(): CarbonImmutable
    {
        return CarbonImmutable::now(self::EXPIRY_TIMEZONE)->startOfDay();
    }

    /**
     * TCK-2655 — les comptes `expiring_soon` et `unverified` d'une requête déjà bornée, en une requête.
     *
     * @param  Builder<self>  $scoped
     * @return array{expiring_soon: int, unverified: int}
     */
    public static function attentionCounts(Builder $scoped): array
    {
        $today = self::today();
        // `select([])` d'abord : la liste porte les colonnes de `fields[documents]`, qu'un agrégat ne
        // peut pas côtoyer sans GROUP BY (PostgreSQL refuse).
        $row = (clone $scoped)->toBase()->reorder()->select([])
            ->selectRaw(
                'count(*) filter (where expiry_date between ? and ?) as expiring_soon, count(*) filter (where is_verified = false) as unverified',
                [$today->toDateString(), $today->addDays(self::EXPIRING_SOON_DAYS)->toDateString()],
            )
            ->first();

        return ['expiring_soon' => (int) ($row->expiring_soon ?? 0), 'unverified' => (int) ($row->unverified ?? 0)];
    }

    /** TCK-1411 (P151.03) — les filtres exacts typés que leur nom ne dit pas (`TypedExactFilter`). */
    protected static array $requestFilterableTypes = ['uploaded_by' => TypedExactFilter::IDENTIFIANT, 'is_verified' => TypedExactFilter::BOOLEEN];

    protected static array $requestSortable = ['id', 'created_at', 'expiry_date', 'name'];

    protected static array $requestLoadable = ['uploader', 'verifier'];

    protected static array $requestSearchFields = ['name', 'description'];

    protected static array $queryFields = [
        'id', 'documentable_id', 'documentable_type', 'uploaded_by',
        'name', 'type', 'description', 'is_verified', 'expiry_date',
        'created_at', 'updated_at',
        // TCK-987 (P58.02) — la clé de `verifier`, que `DocumentResource` rend déjà.
        'verified_by',
        // TCK-2759 — `DocumentResource` rend `is_internal`.
        'is_internal',
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

    /**
     * TCK-2300 (P231.02) — le fichier qui fait foi : la version active de `versions` (TCK-097),
     * sinon le fichier d'origine `file`. Tout lecteur qui sert le fichier passe par ici : le lien de
     * partage, la page publique d'un bien, `file_url` de la fiche et la revue des demandes d'agence
     * servaient `file` après une nouvelle version.
     *
     * Lu sur la relation `media`, chargée une fois pour les deux collections, comme `getFirstMedia`.
     */
    public function currentFile(): ?Media
    {
        return $this->getMedia('versions')->first(fn (Media $m) => (bool) $m->getCustomProperty('is_active', false))
            ?? $this->getFirstMedia('file');
    }

    /**
     * TCK-1063 (P64.04), TCK-2300 (P231.03) — le fichier vérifié est remplacé : `Document` n'étant
     * pas journalisé, qui l'avait vérifié, et quand, s'écrit au journal d'audit avant d'être
     * effacé. Rien n'est écrit pour une pièce qui n'était pas vérifiée.
     */
    public function logVerificationReset(User $actor): void
    {
        if (! $this->is_verified && $this->verified_by === null) {
            return;
        }

        activity('Document')
            ->performedOn($this)
            ->causedBy($actor)
            ->event('document_verification_reset')
            ->withProperties([
                'verified_by' => $this->verified_by,
                'verified_at' => $this->verified_at?->toIso8601String(),
            ])
            ->log('document_verification_reset');
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
