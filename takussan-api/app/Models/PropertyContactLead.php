<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ContactLeadChannel;
use App\Services\Crm\ContactLeadInboxFilters;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedInclude;

/**
 * Une demande de contact déposée sur le site public — sur un bien, ou sur un agent (TCK-441).
 *
 * TCK-590 — elle devient une boîte de réception : lue par `GET /api/contact-leads`, traitée,
 * attribuée, convertie en fiche client. `ip` et `user_agent` ne servent qu'à l'anti-abus et ne
 * sortent JAMAIS par l'API (contrainte 8) : ils ne sont ni dans `$queryFields` ni dans
 * `PropertyContactLeadResource`.
 */
class PropertyContactLead extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'property_id',
        'agency_id',
        'recipient_user_id',
        'channel',
        'source',
        'medium',
        'locale',
        'name',
        'email',
        'phone',
        'message',
        'ip',
        'user_agent',
        'handled_at',
        'handled_by_id',
        'customer_id',
    ];

    protected $casts = [
        'channel' => ContactLeadChannel::class,
        'handled_at' => 'datetime',
        // TCK-2583 — écrits par `ContactGestureService` seul, jamais fillable.
        'first_responded_at' => 'datetime',
        // TCK-2583 — `filter[created_at_min|max]` juge sa borne selon ce cast (`RangeFilter`).
        'created_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['property_id', 'recipient_user_id', 'handled_by_id'];

    protected static array $requestSortable = ['id', 'created_at', 'handled_at'];

    /** TCK-2583 — `filter[search]` : nom, téléphone, e-mail, message (LIKE replié, modèle non indexé). */
    protected static array $requestSearchFields = ['name', 'phone', 'email', 'message'];

    /** TCK-2583 — `filter[created_at_min]` / `filter[created_at_max]`. */
    protected static array $requestRangeFilters = ['created_at'];

    protected static array $requestLoadable = ['property', 'recipient'];

    protected static array $queryFields = [
        'id', 'property_id', 'agency_id', 'recipient_user_id', 'channel', 'source', 'medium', 'locale',
        'name', 'email', 'phone', 'message', 'handled_at', 'handled_by_id', 'customer_id',
        // TCK-2583 — la première réponse, lisible en sparse fieldset.
        'first_responded_at', 'first_responded_by_id', 'first_response_channel',
        'created_at', 'updated_at',
    ];

    /**
     * `filter[channel]` vaut `form` par défaut : la boîte ne montre que les demandes à traiter,
     * jamais les clics WhatsApp / Appeler (option retenue du ticket). TCK-2980 — par défaut aussi le
     * prospect du pont, `whatsapp_inbound` (`ContactLeadChannel::demandes()`). `filter[handled]=0|1` et
     * `filter[mine]=1` (destinataire, ou traitée par moi).
     *
     * @return array<int, AllowedFilter>
     */
    protected static function getAllowedQueryFilters(): array
    {
        $filters = parent::getAllowedQueryFilters();

        // TCK-2980 — par défaut, les demandes à traiter : le formulaire ET le prospect du pont (`whatsapp_inbound`).
        $filters[] = AllowedFilter::exact('channel')->default(ContactLeadChannel::valeursDesDemandes());

        $filters[] = AllowedFilter::callback('handled', function (Builder $q, mixed $value) {
            filter_var($value, FILTER_VALIDATE_BOOLEAN)
                ? $q->whereNotNull('handled_at')
                : $q->whereNull('handled_at');
        });

        $filters[] = AllowedFilter::callback('mine', function (Builder $q, mixed $value) {
            $userId = request()->user()?->id;
            if (! filter_var($value, FILTER_VALIDATE_BOOLEAN) || $userId === null) {
                return;
            }
            $q->where(fn (Builder $w) => $w->where('recipient_user_id', $userId)->orWhere('handled_by_id', $userId));
        });

        // TCK-2583 — `filter[responded]=0|1` et `filter[unassigned]=1`.
        array_push($filters, ...ContactLeadInboxFilters::all());

        return $filters;
    }

    /**
     * TCK-2623 — une demande À TRAITER : déposée par le formulaire (un clic WhatsApp ou Appeler n'est pas
     * une demande, TCK-590) et que personne n'a traitée. La définition du compteur « Demandes de
     * contact » du menu (`filter[channel]` par défaut + `filter[handled]=0`), écrite une fois ici pour
     * les lectures qui comptent hors de la liste (« Équipe aujourd'hui »).
     */
    /**
     * TCK-2884 — `include=property.address` : le quartier du bien demandé dans la boîte. Déclaré ici et
     * non dans `$requestLoadable`, qui ne nomme que les relations du modèle (`RequestLoadableEmittedTest`) ;
     * la ressource n'en émet que `neighborhood`.
     *
     * @return array<int, AllowedInclude>
     */
    protected static function getAllowedQueryIncludes(): array
    {
        return [...parent::getAllowedQueryIncludes(), AllowedInclude::relationship('property.address')];
    }

    public function scopeATraiter(Builder $query): Builder
    {
        // TCK-2980 — le prospect du pont (`whatsapp_inbound`) est une demande à traiter.
        return $query->whereIn($query->qualifyColumn('channel'), ContactLeadChannel::valeursDesDemandes())
            ->whereNull($query->qualifyColumn('handled_at'));
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }

    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
