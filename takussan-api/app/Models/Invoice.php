<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends AbstractModel
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'invoiceable_id', 'invoiceable_type',
        'customer_id', 'issued_by_id', 'agency_id',
        'reference_number', 'status',
        'issue_date', 'due_date',
        'subtotal', 'tax_rate', 'tax_amount', 'total_amount', 'currency',
        'notes', 'metadata',
    ];

    protected $casts = [
        'status' => InvoiceStatus::class,
        'currency' => Currency::class,
        'issue_date' => 'date',
        'due_date' => 'date',
        'subtotal' => 'decimal:2',
        'tax_rate' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'metadata' => 'array',
    ];

    public function invoiceable(): MorphTo
    {
        return $this->morphTo();
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }
}
