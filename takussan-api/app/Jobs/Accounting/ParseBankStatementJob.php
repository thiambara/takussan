<?php

namespace App\Jobs\Accounting;

use App\Events\Accounting\BankStatementImported;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementStatus;
use App\Services\Accounting\StatementParser\ParserContext;
use App\Services\Accounting\StatementParser\StatementParserFactory;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ParseBankStatementJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $statementId)
    {
        $this->onQueue('reconciliation');
    }

    public function handle(StatementParserFactory $factory): void
    {
        $statement = BankStatement::find($this->statementId);

        if (! $statement) {
            return;
        }

        // Idempotence guard — a re-dispatched job (e.g. queue retry, replay)
        // must not append a second copy of the lines to the same statement.
        if ($statement->lines()->exists()) {
            return;
        }

        $media = $statement->getFirstMedia('statement');

        if (! $media) {
            Log::error("ParseBankStatementJob: no media file for statement #{$this->statementId}");

            return;
        }

        try {
            $path = $media->getPath();
            $context = new ParserContext(
                agency: $statement->agency,
                format: $statement->source_format,
                csvMapping: $statement->agency->bank_csv_mapping,
            );

            $parser = $factory->for($statement->source_format);

            $lines = [];
            $dates = [];

            foreach ($parser->parse($path, $context) as $parsed) {
                $lines[] = [
                    'bank_statement_id' => $statement->id,
                    'posted_at' => $parsed->postedAt->toDateString(),
                    'amount' => $parsed->amount,
                    'direction' => $parsed->direction->value,
                    'currency' => $parsed->currency,
                    'label' => $parsed->label,
                    'reference' => $parsed->reference,
                    'counterparty' => $parsed->counterparty,
                    'raw_payload' => json_encode($parsed->raw),
                    'match_status' => 'unmatched',
                    'created_at' => now(),
                    'updated_at' => now(),
                ];

                $dates[] = $parsed->postedAt;
            }

            // Chunk insert for performance
            foreach (array_chunk($lines, 500) as $chunk) {
                BankStatementLine::insert($chunk);
            }

            // Update statement metadata
            $statement->update([
                'lines_count' => count($lines),
                'period_start' => ! empty($dates) ? min($dates)->toDateString() : null,
                'period_end' => ! empty($dates) ? max($dates)->toDateString() : null,
                'status' => BankStatementStatus::ReadyForReview,
            ]);

            // Chain matching job
            MatchBankStatementJob::dispatch($this->statementId);

            // Notify the uploader
            event(new BankStatementImported($statement->refresh()));
        } catch (\Throwable $e) {
            Log::error("ParseBankStatementJob: failed for statement #{$this->statementId}", [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            // Leave status as 'processing' to indicate failure
            throw $e;
        }
    }
}
