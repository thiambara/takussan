<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class BankStatementLine extends AbstractModel
{
    use Auditable;

    protected $fillable = [
        'bank_statement_id', 'posted_at', 'amount', 'direction', 'currency',
        'label', 'reference', 'counterparty', 'raw_payload',
        'match_status', 'matched_payment_type', 'matched_payment_id',
        'match_confidence', 'confirmed_at', 'confirmed_by',
    ];

    protected $casts = [
        'match_status' => BankStatementLineMatchStatus::class,
        'direction' => BankStatementLineDirection::class,
        'posted_at' => 'date',
        'amount' => 'decimal:2',
        'raw_payload' => 'array',
        'confirmed_at' => 'datetime',
    ];

    protected static array $requestFilterable = ['match_status', 'direction'];

    protected static array $requestRangeFilters = ['amount', 'posted_at'];

    protected static array $requestSearchFields = ['label', 'reference', 'counterparty'];

    protected static array $queryFields = [
        'id', 'bank_statement_id', 'posted_at', 'amount', 'direction', 'currency',
        'label', 'reference', 'counterparty', 'match_status',
        'matched_payment_type', 'matched_payment_id', 'match_confidence',
        'confirmed_at', 'confirmed_by', 'created_at',
    ];

    public function statement(): BelongsTo
    {
        return $this->belongsTo(BankStatement::class, 'bank_statement_id');
    }

    public function matchedPayment(): MorphTo
    {
        return $this->morphTo('matched_payment');
    }

    public function confirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function scopeUnmatched(Builder $query): Builder
    {
        return $query->where('match_status', BankStatementLineMatchStatus::Unmatched);
    }

    public function scopeSuggested(Builder $query): Builder
    {
        return $query->where('match_status', BankStatementLineMatchStatus::Suggested);
    }

    public function scopeConfirmed(Builder $query): Builder
    {
        return $query->where('match_status', BankStatementLineMatchStatus::Confirmed);
    }

    public function scopeIgnored(Builder $query): Builder
    {
        return $query->where('match_status', BankStatementLineMatchStatus::Ignored);
    }

    public function scopeReadyToConfirm(Builder $query, int $minConfidence = 60): Builder
    {
        return $query->where('match_status', BankStatementLineMatchStatus::Suggested)
            ->where('match_confidence', '>=', $minConfidence);
    }
}
