<?php

namespace App\Models;

use App\Listeners\Lease\CreateTenantOnboardingChecklist;
use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceKind;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentFrequency;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Lease extends AbstractModel implements HasMedia
{
    use Auditable, HasFactory, InteractsWithMedia, SoftDeletes;

    protected $fillable = [
        'property_id', 'landlord_id', 'tenant_id', 'agency_id',
        'booking_id', 'renewed_from_lease_id', 'guarantor_id',
        'reference_number', 'type', 'status',
        'start_date', 'end_date', 'renewal_date',
        'monthly_rent', 'sale_price', 'currency',
        'deposit_amount', 'deposit_refunded_amount', 'deposit_refunded_at', 'deposit_refund_reason',
        'commission_amount', 'commission_rate',
        'payment_frequency', 'payment_day',
        'late_fee_percent', 'late_fee_grace_days',
        // VERIF-596 passe 2 (N1) — figés quand le contrat l'est ; nuls, le réglage global s'applique.
        'early_termination_penalty_months', 'rent_review_max_pct',
        'terms', 'special_conditions',
        'signed_at', 'terminated_at', 'termination_reason', 'terminated_by_id', 'metadata',
        // TCK-265 — set by SendTenantWelcomeNotification once the welcome
        // email + in-app notification have been sent for this lease.
        'tenant_welcomed_at',
        // TCK-090 — early-termination workflow.
        'early_termination_requested_at', 'early_termination_requested_by',
        'early_termination_effective_date', 'early_termination_penalty_amount',
        'early_termination_reason', 'notice_period_days', 'early_termination_invoice_id',
    ];

    protected $casts = [
        'type' => LeaseType::class,
        'status' => LeaseStatus::class,
        'currency' => Currency::class,
        'payment_frequency' => PaymentFrequency::class,
        'monthly_rent' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'deposit_refunded_amount' => 'decimal:2',
        'deposit_refunded_at' => 'datetime',
        'commission_amount' => 'decimal:2',
        'commission_rate' => 'decimal:2',
        'late_fee_percent' => 'decimal:2',
        'early_termination_penalty_months' => 'integer',
        'rent_review_max_pct' => 'decimal:2',
        'late_fee_grace_days' => 'integer',
        'start_date' => 'date',
        'end_date' => 'date',
        'renewal_date' => 'date',
        'signed_at' => 'datetime',
        'tenant_welcomed_at' => 'datetime',
        'terminated_at' => 'datetime',
        // TCK-090
        'early_termination_requested_at' => 'datetime',
        'early_termination_effective_date' => 'date',
        'early_termination_penalty_amount' => 'decimal:2',
        'notice_period_days' => 'integer',
        'metadata' => 'array',
        // TCK-596 §4B (ADR-0042).
        'signature_requested_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['property_id', 'landlord_id', 'tenant_id', 'agency_id', 'type', 'status', 'currency', 'payment_frequency', 'renewed_from_lease_id'];

    protected static array $requestSortable = ['id', 'created_at', 'start_date', 'end_date', 'monthly_rent'];

    protected static array $requestLoadable = ['property', 'landlord', 'tenant', 'agency', 'guarantor', 'renewedFrom', 'renewals', 'onboardingChecklist'];

    protected static array $requestCountable = ['payments', 'maintenanceRequests', 'documents', 'renewals'];

    protected static array $requestRangeFilters = ['monthly_rent'];

    protected static array $queryFields = [
        'id', 'property_id', 'landlord_id', 'tenant_id', 'agency_id',
        'booking_id', 'guarantor_id', 'renewed_from_lease_id',
        'reference_number', 'type', 'status',
        'start_date', 'end_date', 'renewal_date',
        'monthly_rent', 'sale_price', 'currency',
        'deposit_amount', 'deposit_refunded_amount', 'deposit_refunded_at', 'deposit_refund_reason',
        'commission_amount', 'commission_rate',
        'payment_frequency', 'payment_day',
        'late_fee_percent', 'late_fee_grace_days',
        // VERIF-596 passe 2 (N1) — figés quand le contrat l'est ; nuls, le réglage global s'applique.
        'early_termination_penalty_months', 'rent_review_max_pct',
        'terms', 'special_conditions',
        'signed_at', 'terminated_at', 'termination_reason',
        'created_at', 'updated_at',
        // TCK-090 — exposed so the frontend banner can read the workflow
        // state without a second round-trip (effective_date countdown,
        // penalty amount, invoice link).
        'early_termination_requested_at', 'early_termination_requested_by',
        'early_termination_effective_date', 'early_termination_penalty_amount',
        'early_termination_reason', 'notice_period_days', 'early_termination_invoice_id',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function landlord(): BelongsTo
    {
        return $this->belongsTo(User::class, 'landlord_id');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'tenant_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function renewedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'renewed_from_lease_id');
    }

    public function renewals(): HasMany
    {
        return $this->hasMany(self::class, 'renewed_from_lease_id');
    }

    public function guarantor(): BelongsTo
    {
        return $this->belongsTo(Guarantor::class);
    }

    /**
     * Many-to-many guarantors (up to 3 per lease, enforced at API layer).
     * The legacy `guarantor_id` FK is kept for backward compatibility
     * until all consumers migrate to this relation.
     */
    public function guarantors(): BelongsToMany
    {
        return $this->belongsToMany(Guarantor::class, 'lease_guarantor')
            ->withPivot(['role'])
            ->withTimestamps();
    }

    public function terminatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'terminated_by_id');
    }

    public function earlyTerminationRequestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'early_termination_requested_by');
    }

    public function earlyTerminationInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'early_termination_invoice_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(LeasePayment::class);
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }

    public function maintenanceRequests(): HasMany
    {
        return $this->hasMany(MaintenanceRequest::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class);
    }

    public function invoices(): MorphMany
    {
        return $this->morphMany(Invoice::class, 'invoiceable');
    }

    /**
     * TCK-266 — Checklist d'onboarding tenant (au plus 1 par bail,
     * unique sur `lease_id`). Créée automatiquement à `Lease.activated`
     * par {@see CreateTenantOnboardingChecklist}.
     */
    public function onboardingChecklist(): HasOne
    {
        return $this->hasOne(TenantOnboardingChecklist::class);
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('lease_deposit_refund');
        // TCK-596 §4B (ADR-0042 §1) — le contrat FIGÉ que les parties signent (PDF rendu à la
        // demande de signature, ou scan de la voie papier). Privé, un seul fichier.
        $this->addMediaCollection('signed_contract')->singleFile()->useDisk(config('media-library.disk_name'));
    }

    /**
     * TCK-596 §4B (ADR-0042 §3) — les preuves de consentement. Seules comptent celles dont
     * l'empreinte est celle du contrat figé ({@see self::currentSignatures()}).
     */
    public function signatures(): HasMany
    {
        return $this->hasMany(LeaseSignature::class);
    }

    /** @return Collection<int, LeaseSignature> */
    public function currentSignatures()
    {
        if ($this->contract_sha256 === null) {
            return new Collection;
        }

        return $this->signatures()->where('document_sha256', $this->contract_sha256)->get();
    }

    /**
     * TCK-596 (ADR-0042 §1) — les octets du contrat figé, SEULEMENT s'ils ont l'empreinte
     * enregistrée ; `null` si le média manque ou ne correspond plus. Les lecteurs ferment à l'échec.
     */
    public function frozenContractBytes(): ?string
    {
        $media = $this->contract_sha256 !== null ? $this->getFirstMedia('signed_contract') : null;
        if ($media === null) {
            return null;
        }

        try {
            $stream = $media->stream();
        } catch (\Throwable) {
            return null;
        }
        $bytes = is_resource($stream) ? (string) stream_get_contents($stream) : null;

        return $bytes !== null && hash_equals((string) $this->contract_sha256, hash('sha256', $bytes)) ? $bytes : null;
    }

    /**
     * TCK-596 §4B (ADR-0042 §1) — défige le contrat d'un bail en attente de signature : les
     * signatures posées sur l'ancienne empreinte cessent de compter. Appelé par toute écriture qui
     * change ce que le PDF figé dit (colonnes ci-dessous, garants).
     */
    public function unfreezeContract(): void
    {
        if ($this->status === LeaseStatus::PendingSignature && $this->contract_sha256 !== null) {
            $this->forceFill(['contract_sha256' => null, 'signature_requested_at' => null])->saveQuietly();
        }
    }

    /**
     * TCK-596 (VERIF-596 M2) — les colonnes que le contrat IMPRIME, parce que le bail les exécute
     * après activation (échéancier, pénalités, préavis, conditions). `pdf.leases.contract` a une
     * ligne pour chacune ; `LeaseContractTermsTest` rougit si l'une manque au gabarit, et
     * `LeaseController::update` refuse de les changer une fois le bail signé.
     */
    public const CONTRACT_PRINTED_TERMS = [
        'type', 'start_date', 'end_date', 'renewal_date',
        'monthly_rent', 'sale_price', 'currency', 'deposit_amount',
        'payment_frequency', 'payment_day',
        'late_fee_percent', 'late_fee_grace_days', 'notice_period_days',
        'early_termination_penalty_months', 'rent_review_max_pct',
        'terms', 'special_conditions',
    ];

    /**
     * Les colonnes remplissables que le contrat n'imprime PAS, chacune pour une raison. Avec
     * {@see self::CONTRACT_PRINTED_TERMS}, elles couvrent `$fillable` exactement : une colonne neuve
     * doit choisir son camp (`LeaseContractTermsTest`).
     *
     * @var array<string, string>
     */
    public const CONTRACT_UNPRINTED_COLUMNS = [
        'property_id' => 'imprimé par le bien (adresse, désignation)',
        'landlord_id' => 'imprimé par les parties',
        'tenant_id' => 'imprimé par les parties',
        'agency_id' => 'imprimé par les parties',
        'guarantor_id' => 'ancienne colonne ; les garants imprimés sont ceux du pivot',
        'booking_id' => 'origine du bail, pas un terme',
        'renewed_from_lease_id' => 'filiation, pas un terme',
        'reference_number' => 'imprimé en tête',
        'status' => 'cycle de vie',
        'deposit_refunded_amount' => 'sortie du bail, pas un terme',
        'deposit_refunded_at' => 'sortie du bail, pas un terme',
        'deposit_refund_reason' => 'sortie du bail, pas un terme',
        'commission_amount' => 'mandat entre bailleur et agence, le locataire n\'y est pas partie',
        'commission_rate' => 'mandat entre bailleur et agence, le locataire n\'y est pas partie',
        'signed_at' => 'cycle de vie',
        'terminated_at' => 'cycle de vie',
        'termination_reason' => 'cycle de vie',
        'terminated_by_id' => 'cycle de vie',
        'metadata' => 'technique',
        'tenant_welcomed_at' => 'technique',
        'early_termination_requested_at' => 'sortie du bail ; le préavis et l\'indemnité applicables sont imprimés',
        'early_termination_requested_by' => 'sortie du bail',
        'early_termination_effective_date' => 'sortie du bail',
        'early_termination_penalty_amount' => 'sortie du bail ; la règle de calcul est imprimée',
        'early_termination_reason' => 'sortie du bail',
        'early_termination_invoice_id' => 'sortie du bail',
    ];

    /** Les colonnes dont la modification ne change pas le contrat signé. */
    public const CONTRACT_NEUTRAL_COLUMNS = [
        'status', 'signed_at', 'contract_sha256', 'signature_requested_at', 'updated_at',
        'metadata', 'tenant_welcomed_at',
    ];

    protected static function booted(): void
    {
        // TCK-596 §4B (ADR-0042 §1) — second chemin : quel que soit l'appelant (PATCH du bail,
        // révision de loyer, script), une colonne du contrat qui bouge pendant l'attente défige le
        // contrat. La garde vit sur le modèle pour qu'aucune route ne la contourne.
        static::updating(function (Lease $lease): void {
            if ($lease->getOriginal('status') !== LeaseStatus::PendingSignature || $lease->getOriginal('contract_sha256') === null) {
                return;
            }
            $changed = array_diff(array_keys($lease->getDirty()), self::CONTRACT_NEUTRAL_COLUMNS);
            if ($changed !== [] && ! $lease->isDirty('contract_sha256')) {
                $lease->contract_sha256 = null;
                $lease->signature_requested_at = null;
            }
        });
    }

    /**
     * Caution restant à rembourser (deposit_amount − deposit_refunded_amount − la retenue vivante),
     * borné à 0. Lecture seule.
     *
     * VERIF-594 passe 4 (P4-1, P4-2) — ce qui est retenu est réglé autant que ce qui est rendu : une
     * restitution partielle retient le reste par une facture, et la caution est soldée. Sans la
     * retenue, une seconde restitution partielle facturait une retenue de plus, et une restitution
     * échouée dont la retenue était payée se rendait en entier avec une seconde facture.
     */
    public function getDepositRemainingAttribute(): float
    {
        $total = (float) ($this->deposit_amount ?? 0);
        $refunded = (float) ($this->deposit_refunded_amount ?? 0);

        return max(round($total - $refunded - $this->liveDepositRetention(), 2), 0.0);
    }

    /**
     * La retenue vivante de la caution : les factures de retenue du bail — celles qu'une restitution a
     * posées et liées à son reversement (`payouts.metadata.invoice_id`), jamais une autre facture du
     * bail — ni annulées ni contrepassées. Payée, une retenue reste retenue, même quand la restitution
     * qui l'a posée a échoué.
     */
    public function liveDepositRetention(): float
    {
        if ($this->getKey() === null) {
            return 0.0;
        }

        $linked = Payout::query()
            ->where('lease_id', $this->getKey())
            ->where('payee_role', PayeeRole::Tenant->value)
            ->whereNotNull('metadata->invoice_id')
            ->selectRaw("(metadata->>'invoice_id')::bigint");

        return (float) Invoice::query()
            ->where('invoiceable_type', self::class)
            ->where('invoiceable_id', $this->getKey())
            ->where('kind', InvoiceKind::Invoice->value)
            ->whereIn('status', [InvoiceStatus::Draft->value, InvoiceStatus::Sent->value, InvoiceStatus::Overdue->value, InvoiceStatus::Paid->value])
            ->whereIn('id', $linked)
            ->sum('total_amount');
    }
}
