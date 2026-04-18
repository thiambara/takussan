<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserCustomerRelationship extends AbstractModel
{
    use HasFactory;

    protected $table = 'user_customer_relationships';

    protected $fillable = [
        'user_id', 'customer_id', 'relationship_type', 'status',
        'is_primary', 'started_at', 'ended_at', 'notes', 'metadata',
    ];

    protected $casts = [
        'relationship_type' => RelationshipType::class,
        'status' => RelationshipStatus::class,
        'is_primary' => 'boolean',
        'started_at' => 'date',
        'ended_at' => 'date',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
