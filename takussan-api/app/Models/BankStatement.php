<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\BankStatementStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class BankStatement extends AbstractModel implements HasMedia
{
    use Auditable, HasFactory, InteractsWithMedia;

    protected $fillable = [
        'agency_id', 'uploaded_by', 'source_format', 'file_hash',
        'bank_name', 'account_iban_masked',
        'period_start', 'period_end', 'lines_count',
        'status', 'finalized_at', 'finalized_by',
        'csv_mapping', 'skipped_lines_count',
    ];

    protected $casts = [
        'status' => BankStatementStatus::class,
        'source_format' => BankStatementSourceFormat::class,
        'period_start' => 'date',
        'period_end' => 'date',
        'finalized_at' => 'datetime',
        'csv_mapping' => 'array',
        'skipped_lines_count' => 'integer',
    ];

    protected static array $requestFilterable = ['status', 'source_format', 'agency_id'];

    protected static array $requestSortable = ['created_at', '-created_at', 'period_start', '-period_start'];

    protected static array $queryFields = [
        'id', 'agency_id', 'source_format', 'status', 'bank_name', 'account_iban_masked',
        'period_start', 'period_end', 'lines_count', 'skipped_lines_count', 'finalized_at', 'created_at', 'updated_at',
        // TCK-987 (P58.02) — les clés de `uploadedBy` / `finalizedBy` : sans elles, ces relations se
        // chargent à vide sous un sparse fieldset.
        'uploaded_by', 'finalized_by',
    ];

    protected static array $requestLoadable = ['uploadedBy', 'finalizedBy', 'agency'];

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('statement')->singleFile()->useDisk(config('media-library.disk_name'));
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function finalizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'finalized_by');
    }

    /** @return HasMany<BankStatementLine> */
    public function lines(): HasMany
    {
        return $this->hasMany(BankStatementLine::class);
    }

    public function scopeForAgency(Builder $query, int $agencyId): Builder
    {
        return $query->where('agency_id', $agencyId);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNotIn('status', [
            BankStatementStatus::Reconciled->value,
            BankStatementStatus::Archived->value,
        ]);
    }

    /**
     * TCK-988 (P58.03) — précharge les comptes que lit {@see self::getReconciledRatioAttribute()} :
     * une liste ne lance plus une requête de lignes par relevé.
     *
     * Alias explicites : `lines_count` est une COLONNE de `bank_statements`, l'alias par défaut de
     * `withCount('lines')` la doublerait (piège PostgreSQL n°7).
     */
    public function scopeWithReconciledCounts(Builder $query): Builder
    {
        return $query->withCount([
            'lines as reconciled_total_count',
            'lines as reconciled_confirmed_count' => fn (Builder $lignes) => $lignes->where('match_status', BankStatementLineMatchStatus::Confirmed->value),
            'lines as reconciled_ignored_count' => fn (Builder $lignes) => $lignes->where('match_status', BankStatementLineMatchStatus::Ignored->value),
        ]);
    }

    /**
     * Computed attribute: reconciliation ratio.
     *
     * Lit les comptes préchargés par {@see self::scopeWithReconciledCounts()} quand ils sont là,
     * sinon interroge les lignes.
     *
     * @return array{confirmed: int, ignored: int, remaining: int, total: int}
     */
    public function getReconciledRatioAttribute(): array
    {
        if (array_key_exists('reconciled_total_count', $this->attributes)) {
            $confirmed = (int) $this->attributes['reconciled_confirmed_count'];
            $ignored = (int) $this->attributes['reconciled_ignored_count'];
            $total = (int) $this->attributes['reconciled_total_count'];

            return [
                'confirmed' => $confirmed,
                'ignored' => $ignored,
                'remaining' => $total - $confirmed - $ignored,
                'total' => $total,
            ];
        }

        $counts = $this->lines()
            ->selectRaw('match_status, count(*) as cnt')
            ->groupBy('match_status')
            ->pluck('cnt', 'match_status')
            ->toArray();

        $confirmed = (int) ($counts['confirmed'] ?? 0);
        $ignored = (int) ($counts['ignored'] ?? 0);
        $total = array_sum($counts);

        return [
            'confirmed' => $confirmed,
            'ignored' => $ignored,
            'remaining' => $total - $confirmed - $ignored,
            'total' => $total,
        ];
    }
}
