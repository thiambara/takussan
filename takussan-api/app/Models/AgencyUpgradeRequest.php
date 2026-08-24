<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use Database\Factories\AgencyUpgradeRequestFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * TCK-252 — Demande d'upgrade d'une agence `individual` vers `standard`.
 *
 * Ce modèle est un simple porteur de données : la création / revue /
 * approbation est conduite par les services dédiés (TCK-267 form de
 * soumission, TCK-268 console super-admin, TCK-269 flip de l'agence).
 *
 * Contrainte critique : **une seule demande `pending` par agence**, garantie par
 * un index unique PARTIEL en base :
 *
 *     CREATE UNIQUE INDEX agency_upgrade_requests_one_pending_per_agency
 *     ON agency_upgrade_requests (agency_id) WHERE status = 'pending'
 *
 * ⚠ Il y avait ici un SECOND garde-fou, un `booted()`/`creating` qui sondait la
 * table et levait une `QueryException` imitant la collision — parce que SQLite,
 * qui servait alors aux tests, n'a pas d'index partiel. **Il a été supprimé avec
 * SQLite** (ADR-0020) : la suite tourne désormais sur PostgreSQL, donc sur le même
 * index que la production, et ce garde-fou était devenu du code que rien ne pouvait
 * plus atteindre — son `if (getDriverName() !== 'sqlite') return;` sortait à tous
 * les coups.
 *
 * Deux couches subsistent, et elles suffisent : l'index ci-dessus pour toute
 * écriture, et le contrôleur de soumission qui rend un 422 propre sur le chemin
 * HTTP (`test_duplicate_pending_request_returns_422`). L'index seul est éprouvé par
 * `AgencyUpgradeRequestTest::test_partial_unique_index_rejects_a_second_pending_request`.
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
