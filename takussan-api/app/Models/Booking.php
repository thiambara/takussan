<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Services\Booking\BookingSearch;
use App\Support\Http\ParametreUnique;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
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
        // TCK-2579 (ADR-0102) — la nature, et ce qu'une offre ou une candidature retient du bien.
        'kind', 'offer_expires_at', 'list_price_at_booking',
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
        'kind' => BookingKind::class,
        'offer_expires_at' => 'date',
        'list_price_at_booking' => 'decimal:2',
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

    // TCK-2579 — `filter[kind]` : les écrans et les compteurs se découpent par nature (ADR-0102).
    protected static array $requestFilterable = ['property_id', 'customer_id', 'created_by_id', 'agency_id', 'status', 'currency', 'kind'];

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
            // TCK-2593 — référence, nom et téléphone du client, titre du bien ({@see BookingSearch}).
            AllowedFilter::callback('search', function (Builder $query, mixed $value): void {
                // P216.05 (ADR-0075) — `filter[search][]=…` vaut une recherche absente.
                $term = ParametreUnique::valeur($value);
                if ($term !== null) {
                    BookingSearch::apply($query, $term);
                }
            })->delimiter(''),
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
        // TCK-2579
        'kind', 'offer_expires_at', 'list_price_at_booking',
    ];

    /**
     * TCK-2579 (ADR-0102 §1) — la nature est posée À L'ÉCRITURE, et toujours : une création qui ne
     * la dit pas (seeders, fabrique avec `kind => null`, tout appelant futur) reçoit celle que
     * donne le bien à cet instant. La fabrique, elle, pose `stay` par défaut (`BookingFactory`). Ici et non dans un écouteur `creating` : les seeders créent sous
     * `Booking::withoutEvents()`, qui le ferait taire, et la colonne est NOT NULL.
     */
    protected function performInsert(Builder $query)
    {
        if ($this->getAttribute('kind') === null && $this->property_id !== null) {
            $property = $this->relationLoaded('property') ? $this->property : Property::withTrashed()->find($this->property_id);
            if ($property !== null) {
                $this->setAttribute('kind', BookingKind::forProperty($property));
            }
        }

        return parent::performInsert($query);
    }

    /**
     * TCK-2579 — la demande a-t-elle été saisie par quelqu'un d'autre que le client, pour lui ?
     * Vrai quand son auteur n'est pas le compte de la fiche client (fiche sans compte comprise).
     * La voie du client et le tunnel public créent toujours au nom de l'auteur
     * (`BookingService::create`, `$isBookingForSelf`). Une seule définition : la ressource
     * (`recorded_by_staff`) et l'avis au client (`NotifyCustomerOfBookingRecordedOnBehalf`).
     *
     * `null` quand on ne peut pas le dire sans requête : client non chargé.
     */
    public function recordedOnBehalf(): ?bool
    {
        if ($this->customer_id === null || $this->created_by_id === null) {
            return false;
        }
        if (! $this->relationLoaded('customer')) {
            return null;
        }

        return $this->customer !== null && (int) $this->customer->user_id !== (int) $this->created_by_id;
    }

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
