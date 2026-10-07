<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\Currency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PayoutStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payout extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    /**
     * TCK-594 (ADR-0039 §2) — `landlord_id` est l'UTILISATEUR bénéficiaire pour `payee_role`
     * `landlord` et `service_provider` (le prestataire) ; pour `tenant`, il désigne le bailleur du
     * bail, le locataire étant un `Customer`. Le nom est historique.
     */
    protected $fillable = [
        'lease_id', 'booking_id', 'service_provider_bill_id', 'agency_id', 'landlord_id', 'payee_role',
        'issued_by_id', 'approved_by_id', 'approved_at', 'processed_by_id',
        'reference_number', 'status',
        'period_start', 'period_end',
        'gross_amount', 'commission_amount', 'fees_amount', 'net_amount',
        'currency', 'payment_method', 'payout_method_id', 'transaction_id',
        'scheduled_at', 'processed_at', 'failed_reason', 'notes', 'metadata',
    ];

    /** TCK-594 — le défaut de la colonne, lisible avant le premier `refresh()`. */
    protected $attributes = [
        'payee_role' => 'landlord',
    ];

    protected $casts = [
        'status' => PayoutStatus::class,
        'payee_role' => PayeeRole::class,
        'currency' => Currency::class,
        'payment_method' => PaymentMethod::class,
        'period_start' => 'date',
        'period_end' => 'date',
        'gross_amount' => 'decimal:2',
        'commission_amount' => 'decimal:2',
        'fees_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'scheduled_at' => 'datetime',
        'processed_at' => 'datetime',
        'approved_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static array $requestFilterable = ['lease_id', 'booking_id', 'agency_id', 'landlord_id', 'payee_role', 'issued_by_id', 'approved_by_id', 'service_provider_bill_id', 'status', 'currency', 'payment_method'];

    protected static array $requestSortable = ['id', 'created_at', 'period_start', 'period_end', 'net_amount', 'scheduled_at', 'processed_at'];

    protected static array $requestLoadable = ['lease', 'booking', 'agency', 'landlord', 'issuer', 'approver', 'processor'];

    protected static array $requestRangeFilters = ['net_amount', 'gross_amount'];

    protected static array $queryFields = [
        'id', 'lease_id', 'booking_id', 'service_provider_bill_id', 'agency_id', 'landlord_id', 'payee_role',
        'issued_by_id', 'approved_by_id', 'approved_at', 'processed_by_id',
        'reference_number', 'status', 'period_start', 'period_end',
        'gross_amount', 'commission_amount', 'fees_amount', 'net_amount', 'currency',
        'payment_method', 'payout_method_id', 'transaction_id', 'scheduled_at', 'processed_at',
        'failed_reason', 'notes', 'created_at', 'updated_at',
    ];

    protected static function booted(): void
    {
        static::updating(function (self $payout): void {
            if (! $payout->isDirty('status')) {
                return;
            }

            $original = $payout->getOriginal('status');
            $originalEnum = $original instanceof PayoutStatus
                ? $original
                : (is_string($original) ? PayoutStatus::tryFrom($original) : null);

            $newEnum = $payout->status instanceof PayoutStatus
                ? $payout->status
                : (is_string($payout->status) ? PayoutStatus::tryFrom($payout->status) : null);

            if ($originalEnum === null || $newEnum === null) {
                return;
            }

            // A completed payout cannot revert to pending/scheduled/processing.
            $open = [
                PayoutStatus::AwaitingApproval,
                PayoutStatus::Pending,
                PayoutStatus::Scheduled,
                PayoutStatus::Processing,
            ];
            if ($originalEnum === PayoutStatus::Completed && in_array($newEnum, $open, true)) {
                abort(422, sprintf(
                    'Invalid payout status transition: %s → %s.',
                    $originalEnum->value,
                    $newEnum->value,
                ));
            }
        });
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(Lease::class);
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function landlord(): BelongsTo
    {
        return $this->belongsTo(User::class, 'landlord_id');
    }

    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by_id');
    }

    public function payoutMethod(): BelongsTo
    {
        return $this->belongsTo(PayoutMethod::class)->withTrashed();
    }

    public function serviceProviderBill(): BelongsTo
    {
        return $this->belongsTo(ServiceProviderBill::class);
    }

    /** Les factures d'intervention retenues en FRAIS de ce reversement au bailleur. */
    public function imputedBills(): HasMany
    {
        return $this->hasMany(ServiceProviderBill::class, 'imputed_payout_id');
    }

    /**
     * TCK-594 (ADR-0039 §4) — l'utilisateur qui reçoit l'argent, quand il en existe un : il ne tient
     * aucun des trois gestes. Le locataire d'une caution rendue est un `Customer`, rattaché ou non à
     * un compte.
     */
    public function beneficiaryUserId(): ?int
    {
        if ($this->payee_role === PayeeRole::Tenant) {
            $userId = $this->lease?->tenant?->user_id;

            return $userId !== null ? (int) $userId : null;
        }

        return $this->landlord_id !== null ? (int) $this->landlord_id : null;
    }

    public function leasePayments(): BelongsToMany
    {
        return $this->belongsToMany(LeasePayment::class, 'payout_lease_payment');
    }

    public function bookingPayments(): BelongsToMany
    {
        return $this->belongsToMany(BookingPayment::class, 'payout_booking_payment');
    }
}
