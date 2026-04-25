<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'invoiceable_id', 'invoiceable_type',
        'customer_id', 'issued_by_id', 'agency_id',
        'reference_number', 'status',
        'issue_date', 'due_date',
        'subtotal', 'tax_rate', 'tax_amount', 'total_amount', 'currency',
        'notes', 'metadata',
        'last_reminder_sent_at', 'reminders_sent_count',
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
        'last_reminder_sent_at' => 'datetime',
        'reminders_sent_count' => 'integer',
    ];

    protected static array $requestFilterable = ['customer_id', 'issued_by_id', 'agency_id', 'status', 'currency', 'invoiceable_type'];

    protected static array $requestSortable = ['id', 'created_at', 'issue_date', 'due_date', 'total_amount'];

    protected static array $requestLoadable = ['customer', 'issuer', 'agency'];

    protected static array $queryFields = [
        'id', 'customer_id', 'issued_by_id', 'agency_id',
        'invoiceable_id', 'invoiceable_type',
        'reference_number', 'status', 'issue_date', 'due_date',
        'subtotal', 'tax_rate', 'tax_amount', 'total_amount', 'currency',
        'notes', 'last_reminder_sent_at', 'reminders_sent_count',
        'created_at', 'updated_at',
    ];

    protected static function booted(): void
    {
        static::updating(function (self $invoice): void {
            if (! $invoice->isDirty('status')) {
                return;
            }

            $original = $invoice->getOriginal('status');
            $originalEnum = $original instanceof InvoiceStatus
                ? $original
                : (is_string($original) ? InvoiceStatus::tryFrom($original) : null);

            $newEnum = $invoice->status instanceof InvoiceStatus
                ? $invoice->status
                : (is_string($invoice->status) ? InvoiceStatus::tryFrom($invoice->status) : null);

            if ($originalEnum === null || $newEnum === null) {
                return;
            }

            // An invoice that has been paid cannot revert to draft/sent/overdue.
            $open = [InvoiceStatus::Draft, InvoiceStatus::Sent, InvoiceStatus::Overdue];
            if ($originalEnum === InvoiceStatus::Paid && in_array($newEnum, $open, true)) {
                abort(422, sprintf(
                    'Invalid invoice status transition: %s → %s.',
                    $originalEnum->value,
                    $newEnum->value,
                ));
            }
        });
    }

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
