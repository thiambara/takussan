<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Services\Radar\RadarFollowUps;
use App\Support\CaseInsensitive;
use App\Support\Http\ParametreUnique;
use App\Support\RadarPhone;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\QueryBuilder\AllowedFilter;

/**
 * TCK-2386 (ADR-0077 §1, §7, §9) — l'annonceur d'une ou plusieurs annonces collectées, identifié par
 * son numéro. `phone` est purgé après un STOP ; `phone_hmac` reste (RadarPhone::hmac).
 *
 * TCK-2388 : la prise en charge de 10 minutes (`claimed_by_id`, `claimed_at`, `claim_expires_at`) vit sur la
 * ligne, écrite par `forceFill` dans `AdvertiserClaim` : hors de `$fillable`, hors de `$queryFields` (la
 * ressource rend un objet `claim` calculé).
 */
class RadarAdvertiser extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'phone', 'phone_hmac', 'display_name', 'nature', 'nature_signals', 'do_not_contact_at', 'user_id',
    ];

    protected $casts = [
        'nature' => RadarAdvertiserNature::class,
        'nature_signals' => 'array',
        'do_not_contact_at' => 'datetime',
        'claimed_at' => 'datetime',
        'claim_expires_at' => 'datetime',
        // TCK-2413 — pas une colonne : l'agrégat `withMin` de la liste (`RadarAdvertiserController::index`), l'échéance de
        // purge de la première annonce laissée. Casté ici, il arrive en instant à la ressource, quel que soit le pilote.
        'left_purge_at' => 'datetime',
    ];

    protected static array $queryFields = [
        'id', 'phone', 'display_name', 'nature', 'nature_signals', 'do_not_contact_at', 'user_id', 'created_at', 'updated_at',
    ];

    protected static array $requestFilterable = ['nature'];

    protected static array $requestSortable = ['updated_at', 'created_at', 'display_name'];

    /**
     * TCK-2388 — `filter[queue]` : les files du démarchage ; `filter[search]` : le nom affiché (repli de casse,
     * piège n° 9) ou le numéro, écrit comme on veut (`RadarPhone::canonical()`, égalité sur `phone`).
     * Une file inconnue ne rend rien : elle ne dit pas « tout ».
     */
    protected static function customQueryFilters(): array
    {
        return [
            AllowedFilter::callback('queue', function (Builder $query, mixed $value): void {
                $followUps = app(RadarFollowUps::class);

                match (ParametreUnique::valeur($value)) {
                    'to_contact' => $query->whereNull('radar_advertisers.do_not_contact_at')
                        ->whereHas('listings', fn (Builder $q) => $q->where('stage', RadarListingStage::Reviewed->value)),
                    'awaiting' => $query->whereIn('radar_advertisers.id', $followUps->awaiting()->select('radar_outreaches.radar_advertiser_id')),
                    'follow_up' => $query->whereIn('radar_advertisers.id', $followUps->due()->select('radar_outreaches.radar_advertiser_id')),
                    // TCK-2413 — une annonce réclamée que la publication a laissée à l'opérateur : `consented`, avec le code
                    // de la raison (`PublishClaimedRadarListings`) ; celle que le job n'a pas encore vue n'en a pas.
                    'left_to_operator' => $query->whereNull('radar_advertisers.do_not_contact_at')
                        ->whereHas('listings', fn (Builder $q) => $q->where('stage', RadarListingStage::Consented->value)->whereNotNull('stage_reason')),
                    default => $query->whereRaw('1 = 0'),
                };
            })->delimiter(''),
            AllowedFilter::callback('search', function (Builder $query, mixed $value): void {
                $text = trim(ParametreUnique::valeur($value) ?? '');
                if ($text === '') {
                    return;
                }
                $e164 = RadarPhone::canonical($text);
                $motif = '%'.addcslashes(CaseInsensitive::fold($text), '\\%_').'%';

                $query->where(function (Builder $inner) use ($e164, $motif): void {
                    $inner->whereRaw(CaseInsensitive::sql('radar_advertisers.display_name').' like ?', [$motif]);
                    if ($e164 !== null) {
                        $inner->orWhere('radar_advertisers.phone', $e164);
                    }
                });
            })->delimiter(''),
        ];
    }

    public function listings(): HasMany
    {
        return $this->hasMany(RadarListing::class, 'radar_advertiser_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function outreaches(): HasMany
    {
        return $this->hasMany(RadarOutreach::class, 'radar_advertiser_id');
    }

    public function consents(): HasMany
    {
        return $this->hasMany(RadarConsent::class, 'radar_advertiser_id');
    }

    /** L'opérateur qui tient la prise en charge. */
    public function claimer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'claimed_by_id');
    }
}
