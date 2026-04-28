<?php

namespace App\Jobs\Accounting;

use App\Models\BankStatement;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class MatchBankStatementJob implements ShouldQueue
{
    use Queueable;

    public string $queue = 'reconciliation';

    public int $tries = 1;

    public function __construct(public int $statementId) {}

    public function handle(ReconciliationMatcher $matcher): void
    {
        $statement = BankStatement::find($this->statementId);

        if (! $statement) {
            return;
        }

        $statement->lines()
            ->where('match_status', BankStatementLineMatchStatus::Unmatched)
            ->cursor()
            ->each(function ($line) use ($matcher) {
                // Idempotence: skip if already processed by a previous run
                if ($line->match_status !== BankStatementLineMatchStatus::Unmatched) {
                    return;
                }

                $suggestion = $matcher->suggestFor($line);

                if ($suggestion !== null) {
                    $line->update([
                        'match_status' => BankStatementLineMatchStatus::Suggested,
                        'matched_payment_type' => $suggestion->paymentType,
                        'matched_payment_id' => $suggestion->paymentId,
                        'match_confidence' => $suggestion->confidence,
                    ]);
                }
            });
    }
}
