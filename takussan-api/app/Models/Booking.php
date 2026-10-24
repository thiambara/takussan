<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\QueryBuilder\AllowedFilter;

class Booking extends AbstractModel
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'property_id', 'customer_id', 'created_by_id', 'agency_id',
        'reference_number', 'status',
        'total_amount', 'deposit_amount', 'currency',
        'start_date', 'end_date', 'notes',
        'confirmed_at', 'cancelled_at', 'expires_at', 'expired_at', 'expiry_reason',
        'cancellation_by', 'cancellation_reason', 'metadata',
    ];

    protected $casts = [
        'status' => BookingStatus::class,
        'currency' => Currency::class,
        'cancellation_by' => CancellationBy::class,
        'total_amount' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'start_date' => 'date',
        'end_date' => 'date',
        'confirmed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
        'expired_at' => 'datetime',
        'metadata' => 'array',
    ];

    /**
     * TCK-1914 (P170.01, décision du porteur) — les statuts où le client paie sa réservation, à la
     * création de la ligne comme à l'initiation en ligne (`PaymentGatewayService::isPayable`). Une
     * réservation annulée appelle un remboursement, pas un paiement (`docs/features.md` § 1.3).
     *
     * @var list<BookingStatus>
     */
    public const CUSTOMER_PAYABLE_STATUSES = [BookingStatus::Pending, BookingStatus::Confirmed];

    /**
     * TCK-1916 (P170.02, décision du porteur) — les statuts où le personnel enregistre un paiement :
     * ceux du client, plus `completed` (un solde réglé après le séjour).
     *
     * @var list<BookingStatus>
     */
    public const STAFF_PAYABLE_STATUSES = [BookingStatus::Pending, BookingStatus::Confirmed, BookingStatus::Completed];

    protected static array $requestFilterable = ['property_id', 'customer_id', 'created_by_id', 'agency_id', 'status', 'currency'];

    protected static array $requestSortable = ['id', 'created_at', 'start_date', 'end_date', 'status'];

    /**
     * TCK-1735 (P167.05) — `filter[managed_by]=me` : les réservations des biens de l'appelant, sous la
     * règle « Mes chiffres » du tableau de bord de l'agent ({@see Property::scopeManagedBy()}), dans
     * son agence active. Toute autre valeur : rien.
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('managed_by', function (Builder $query, mixed $value): void {
                $user = request()->user();
                if ($value !== 'me' || $user === null) {
                    $query->whereRaw('1 = 0');

                    return;
                }
                $query->whereIn($query->qualifyColumn('property_id'), Property::query()
                    ->managedBy($user, $user->staffAgencyId())->select('properties.id'));
            }),
        ];
    }

    // TCK-807 (P21.05) — `agency` n'est pas émis par `BookingResource`. `RequestLoadableEmittedTest` le garde.
    protected static array $requestLoadable = ['property', 'customer'];

    protected static array $requestCountable = ['payments'];

    protected static array $requestRangeFilters = ['total_amount'];

    /**
     * TCK-575 — `expires_at` et `expired_at` y sont parce que `response_deadline` en dépend
     * (`BookingResource::CHAMPS_DE_L_ECHEANCE`) : sans eux, toute lecture en sparse fieldset
     * rendait 400 dès qu'elle demandait l'échéance.
     */
    protected static array $queryFields = [
        'id', 'property_id', 'customer_id', 'created_by_id', 'agency_id',
        'reference_number', 'status', 'total_amount', 'deposit_amount', 'currency',
        'start_date', 'end_date', 'confirmed_at', 'cancelled_at', 'expires_at', 'expired_at',
        'created_at', 'updated_at',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(BookingPayment::class);
    }

    /**
     * TCK-2152 (P200.01, décision du porteur du 2026-10-24) — à la fermeture (annulation, refus,
     * expiration), les lignes `pending` de la réservation passent `cancelled`. Un checkout ouvert
     * avant la fermeture et confirmé après prend alors le chemin du doublon du webhook
     * (`gateway_duplicate_payment`, avis `payment.duplicate` aux admins d'agence) au lieu d'être
     * écrit `paid` sans tâche de remboursement, et n'entre jamais au reversement du bailleur.
     *
     * À appeler sous le verrou de la réservation, dans la transaction qui la ferme. Ligne à ligne,
     * pour que la matrice de transitions et le journal d'audit s'appliquent.
     */
    public function cancelPendingPayments(): void
    {
        $this->payments()
            ->where('status', PaymentStatus::Pending->value)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->each(static fn (BookingPayment $payment) => $payment->update(['status' => PaymentStatus::Cancelled]));
    }

    public function lease(): HasOne
    {
        return $this->hasOne(Lease::class);
    }

    /** TCK-1916 (P170.02) — le personnel peut-il encore y enregistrer un paiement ? */
    public function acceptsStaffPayment(): bool
    {
        return in_array($this->status, self::STAFF_PAYABLE_STATUSES, true);
    }

    /** TCK-1914 (P170.01) — le client peut-il encore payer cette réservation ? */
    public function isPayableByCustomer(): bool
    {
        return in_array($this->status, self::CUSTOMER_PAYABLE_STATUSES, true);
    }
}
