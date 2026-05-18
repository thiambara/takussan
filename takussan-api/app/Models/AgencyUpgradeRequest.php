<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use Database\Factories\AgencyUpgradeRequestFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * TCK-252 — Demande d'upgrade d'une agence `individual` vers `standard`.
 *
 * Ce modèle est un simple porteur de données : la création / revue /
 * approbation est conduite par les services dédiés (TCK-267 form de
 * soumission, TCK-268 console super-admin, TCK-269 flip de l'agence).
 *
 * Contrainte critique : **une seule demande `pending` par agence**.
 *  - Sur Postgres l'invariant est garanti par un index unique partiel
 *    (`agency_id WHERE status = 'pending'`, créé par la migration).
 *  - Sur SQLite (utilisé en tests locaux) il n'existe pas d'équivalent
 *    natif — on retombe sur un check applicatif déclenché en `creating`
 *    qui lève une {@see QueryException} mimant la collision Postgres,
 *    pour garder un comportement homogène entre drivers.
 *
 * Voir `docs/models-spec.md#49-agencyupgraderequest-` pour la spec data.
 */
class AgencyUpgradeRequest extends AbstractModel
{
    /** @use HasFactory<AgencyUpgradeRequestFactory> */
    use HasFactory;

    protected $fillable = [
        'agency_id',
        'submitted_by',
        'rc',
        'ninea',
        'rib_pro',
        'address_fiscale',
        'company_legal_name',
        'planned_agents_count',
        'status',
        'submitted_at',
        'reviewed_by',
        'reviewed_at',
        'review_comment',
    ];

    protected $casts = [
        'status' => AgencyUpgradeRequestStatus::class,
        'submitted_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'planned_agents_count' => 'integer',
    ];

    protected static array $requestFilterable = ['status', 'agency_id', 'submitted_by', 'reviewed_by'];

    protected static array $requestSortable = ['id', 'submitted_at', 'reviewed_at', 'status', 'created_at'];

    protected static array $requestLoadable = ['agency', 'submitter', 'reviewer', 'documents'];

    protected static array $queryFields = [
        'id', 'agency_id', 'submitted_by',
        'rc', 'ninea', 'rib_pro', 'address_fiscale', 'company_legal_name',
        'planned_agents_count', 'status', 'submitted_at',
        'reviewed_by', 'reviewed_at', 'review_comment',
        'created_at', 'updated_at',
    ];

    protected static function booted(): void
    {
        // SQLite fallback for the `(agency_id) WHERE status = 'pending'`
        // partial unique index — Postgres enforces it natively. We probe in
        // `creating` only when the driver is sqlite to keep prod paths free
        // of the extra SELECT.
        static::creating(function (self $request): void {
            if ($request->status !== AgencyUpgradeRequestStatus::Pending->value
                && $request->status !== AgencyUpgradeRequestStatus::Pending) {
                return;
            }

            if (DB::connection()->getDriverName() !== 'sqlite') {
                return;
            }

            $exists = static::query()
                ->where('agency_id', $request->agency_id)
                ->where('status', AgencyUpgradeRequestStatus::Pending->value)
                ->exists();

            if ($exists) {
                throw new QueryException(
                    DB::connection()->getName(),
                    'INSERT INTO agency_upgrade_requests',
                    [],
                    new \RuntimeException(
                        'UNIQUE constraint failed: agency_upgrade_requests.agency_id (status=pending)'
                    )
                );
            }
        });
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', AgencyUpgradeRequestStatus::Pending->value);
    }

    /**
     * Demandes terminées (toutes les transitions finales). Utilisé par la
     * console super-admin pour son onglet « Historique » et par les
     * statistiques d'admission.
     */
    public function scopeHistorical(Builder $query): Builder
    {
        return $query->whereIn('status', [
            AgencyUpgradeRequestStatus::Approved->value,
            AgencyUpgradeRequestStatus::Rejected->value,
            AgencyUpgradeRequestStatus::Revoked->value,
        ]);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /**
     * Pièces justificatives uploadées avec la demande (statuts PDF, scan
     * RC, scan NINEA, etc.). Utilise le morph `documentable_*` standard du
     * modèle Document.
     */
    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }
}
