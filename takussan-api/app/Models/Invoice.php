<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceKind;
use App\Models\Enums\InvoiceStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'invoiceable_id', 'invoiceable_type',
        'customer_id', 'issued_by_id', 'agency_id',
        'reference_number', 'status',
        // TCK-594 (ADR-0039 §7) — séquence attribuée à l'émission, avoir.
        'kind', 'credited_invoice_id', 'sequence_year', 'sequence_number',
        'issue_date', 'due_date',
        'subtotal', 'tax_rate', 'tax_amount', 'total_amount', 'currency',
        // TCK-285 / D-51 — `PaymentGatewayService::recordInitiation()` les écrit par `fill()`,
        // qui respecte cette liste : hors de `$fillable`, l'identifiant de transaction serait
        // silencieusement ignoré et le webhook ne retrouverait jamais la facture.
        'transaction_id', 'payment_method',
        'notes', 'metadata',
        'last_reminder_sent_at', 'reminders_sent_count',
        'bank_reconciled_at', 'bank_statement_line_id',
    ];

    /** TCK-594 — le défaut de la colonne, lisible avant le premier `refresh()`. */
    protected $attributes = [
        'kind' => 'invoice',
    ];

    protected $casts = [
        'status' => InvoiceStatus::class,
        'kind' => InvoiceKind::class,
        'currency' => Currency::class,
        'sequence_year' => 'integer',
        'sequence_number' => 'integer',
        'issue_date' => 'date',
        'due_date' => 'date',
        'subtotal' => 'decimal:2',
        'tax_rate' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'metadata' => 'array',
        'last_reminder_sent_at' => 'datetime',
        'reminders_sent_count' => 'integer',
        'bank_reconciled_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['customer_id', 'issued_by_id', 'agency_id', 'status', 'kind', 'credited_invoice_id', 'currency', 'invoiceable_type'];

    protected static array $requestSortable = ['id', 'created_at', 'issue_date', 'due_date', 'total_amount'];

    protected static array $requestLoadable = ['customer', 'issuer', 'agency', 'creditNotes', 'creditedInvoice'];

    protected static array $queryFields = [
        'id', 'customer_id', 'issued_by_id', 'agency_id',
        'invoiceable_id', 'invoiceable_type',
        'reference_number', 'status', 'kind', 'credited_invoice_id', 'sequence_year', 'sequence_number',
        'issue_date', 'due_date',
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

    /** TCK-594 — l'avoir qui annule cette facture (une facture émise ne s'annule que par lui). */
    public function creditNotes(): HasMany
    {
        return $this->hasMany(self::class, 'credited_invoice_id');
    }

    /** TCK-594 — pour un avoir, la facture qu'il annule. */
    public function creditedInvoice(): BelongsTo
    {
        return $this->belongsTo(self::class, 'credited_invoice_id');
    }

    public function bankStatementLine(): BelongsTo
    {
        return $this->belongsTo(BankStatementLine::class, 'bank_statement_line_id');
    }

    public function scopeWhereNotReconciled(Builder $query): Builder
    {
        return $query->whereNull('bank_reconciled_at');
    }
}
