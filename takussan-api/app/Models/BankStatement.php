<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
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
    ];

    protected $casts = [
        'status' => BankStatementStatus::class,
        'source_format' => BankStatementSourceFormat::class,
        'period_start' => 'date',
        'period_end' => 'date',
        'finalized_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['status', 'source_format', 'agency_id'];

    protected static array $requestSortable = ['created_at', '-created_at', 'period_start', '-period_start'];

    protected static array $queryFields = [
        'id', 'agency_id', 'source_format', 'status', 'bank_name', 'account_iban_masked',
        'period_start', 'period_end', 'lines_count', 'finalized_at', 'created_at', 'updated_at',
    ];

    protected static array $requestLoadable = ['uploadedBy', 'finalizedBy', 'agency'];

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('statement')->singleFile()->useDisk('local');
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
     * Computed attribute: reconciliation ratio.
     *
     * @return array{confirmed: int, ignored: int, remaining: int, total: int}
     */
    public function getReconciledRatioAttribute(): array
    {
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
