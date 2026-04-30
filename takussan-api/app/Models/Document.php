<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\DocumentType;
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

    protected static array $requestFilterable = ['documentable_id', 'documentable_type', 'uploaded_by', 'type', 'is_verified'];

    protected static array $requestSortable = ['id', 'created_at', 'expiry_date', 'name'];

    protected static array $requestLoadable = ['uploader', 'verifier'];

    protected static array $requestSearchFields = ['name', 'description'];

    protected static array $queryFields = [
        'id', 'documentable_id', 'documentable_type', 'uploaded_by',
        'name', 'type', 'description', 'is_verified', 'expiry_date',
        'created_at', 'updated_at',
    ];

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
        $this->addMediaCollection('versions')
            ->useDisk(config('media-library.disk_name', 'public'));
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
