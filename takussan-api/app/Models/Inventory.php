<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Inventory extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia, SoftDeletes;

    protected $fillable = [
        'lease_id', 'property_id', 'type', 'conducted_by', 'tenant_id',
        'conducted_at', 'status', 'general_condition', 'rooms', 'notes',
        'tenant_signed', 'tenant_signed_at', 'tenant_signature_data', 'tenant_signature_hash',
        'owner_signed', 'owner_signed_at', 'owner_signature_data', 'owner_signature_hash',
        'signed_at', 'metadata',
    ];

    /**
     * Raw signature payloads stay on the model for template rendering but are
     * never serialised in JSON responses — only the SHA-256 hash + timestamp
     * travel over the wire. Access them explicitly via `$inventory->getAttributes()`
     * or `$inventory->makeVisible([...])` when needed (e.g. PDF view).
     */
    protected $hidden = [
        'tenant_signature_data',
        'owner_signature_data',
    ];

    protected $casts = [
        'type' => InventoryType::class,
        'status' => InventoryStatus::class,
        'general_condition' => InventoryCondition::class,
        'conducted_at' => 'datetime',
        'tenant_signed' => 'boolean',
        'tenant_signed_at' => 'datetime',
        'owner_signed' => 'boolean',
        'owner_signed_at' => 'datetime',
        'signed_at' => 'datetime',
        'rooms' => 'array',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['lease_id', 'property_id', 'type', 'conducted_by', 'tenant_id', 'status', 'general_condition'];

    protected static array $requestSortable = ['id', 'created_at', 'conducted_at', 'status', 'signed_at'];

    protected static array $requestLoadable = ['lease', 'property', 'conductor', 'tenant'];

    protected static array $queryFields = [
        'id', 'lease_id', 'property_id', 'type', 'conducted_by', 'tenant_id',
        'conducted_at', 'status', 'general_condition',
        'tenant_signed', 'tenant_signed_at', 'tenant_signature_hash',
        'owner_signed', 'owner_signed_at', 'owner_signature_hash',
        'signed_at', 'created_at', 'updated_at',
    ];

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos');
        $this->addMediaCollection('room_photos');
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function conductor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'conducted_by');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'tenant_id');
    }
}
