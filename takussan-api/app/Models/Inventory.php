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
        'tenant_signed', 'tenant_signed_at',
        'owner_signed', 'owner_signed_at', 'metadata',
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
        'rooms' => 'array',
        'metadata' => 'array',
    ];

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos');
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
