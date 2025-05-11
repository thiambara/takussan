<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserCustomerRelationship extends AbstractModel
{
    use HasFactory;

    protected $table = 'user_customer_relationships';

    protected $fillable = [
        'user_id',
        'customer_id',
        'relationship_type',
        'is_primary',
        'status',
        'start_date',
        'end_date',
        'notes'
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'start_date' => 'datetime',
        'end_date' => 'datetime',
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
