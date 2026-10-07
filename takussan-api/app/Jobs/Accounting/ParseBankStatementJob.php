<?php

namespace App\Jobs\Accounting;

use App\Events\Accounting\BankStatementImported;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementStatus;
use App\Services\Accounting\StatementParser\ParserContext;
use App\Services\Accounting\StatementParser\StatementParserFactory;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ParseBankStatementJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $statementId)
    {
        $this->onQueue('reconciliation');
    }

    public function handle(StatementParserFactory $factory, PrivateMediaAccess $access): void
    {
        $statement = BankStatement::find($this->statementId);

        if (! $statement) {
            return;
        }

        // Idempotence guard keyed on STATUS, not `lines()->exists()`. With the
        // atomic transaction below, lines + the ReadyForReview status commit
        // together, so a statement that has moved past Processing is already
        // parsed; anything still Processing is safe to (re)parse from scratch.
        if ($statement->status !== BankStatementStatus::Processing) {
            return;
        }

        $media = $statement->getFirstMedia('statement');

        if (! $media) {
            Log::error("ParseBankStatementJob: no media file for statement #{$this->statementId}");

            return;
        }

        try {
            // TCK-593 — le mapping FIGÉ sur le relevé à l'import ; celui de l'agence en repli, pour
            // un relevé importé avant que l'instantané existe.
            $context = new ParserContext(
                agency: $statement->agency,
                format: $statement->source_format,
                csvMapping: $statement->csv_mapping ?? $statement->agency->bank_csv_mapping,
            );

            $parser = $factory->for($statement->source_format);

            $lines = [];
            $dates = [];

            // TCK-539 — les lecteurs (League\Csv, `file_get_contents`) exigent un chemin LOCAL, et
            // le relevé vit sur le disque privé, distant en production. Copie temporaire, lue EN
            // ENTIER dans le rappel (le parseur est un générateur), supprimée quoi qu'il arrive.
            $access->withLocalCopy($media, function (string $path) use ($parser, $context, $statement, &$lines, &$dates): void {
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
            });

            $skipped = $context->tally->skipped;

            // TCK-593 — un fichier dont des lignes ont été sautées et AUCUNE lue n'est pas un relevé
            // vide à vérifier : c'est un mapping qui ne correspond pas au fichier. `failed`, avec le
            // compte, au lieu de `ready_for_review` à zéro ligne.
            if ($lines === [] && $skipped > 0) {
                $statement->update([
                    'lines_count' => 0,
                    'skipped_lines_count' => $skipped,
                    'status' => BankStatementStatus::Failed,
                ]);

                return;
            }

            // Line inserts + status flip must commit together: a crash between
            // them previously left lines present but status stuck on Processing,
            // which the old `lines()->exists()` guard then made unrecoverable.
            DB::transaction(function () use ($lines, $dates, $statement, $skipped): void {
                foreach (array_chunk($lines, 500) as $chunk) {
                    BankStatementLine::insert($chunk);
                }

                $statement->update([
                    'lines_count' => count($lines),
                    'skipped_lines_count' => $skipped,
                    'period_start' => ! empty($dates) ? min($dates)->toDateString() : null,
                    'period_end' => ! empty($dates) ? max($dates)->toDateString() : null,
                    'status' => BankStatementStatus::ReadyForReview,
                ]);
            });

            // Chain matching + notify only after the parse has durably committed.
            MatchBankStatementJob::dispatch($this->statementId);
            event(new BankStatementImported($statement->refresh()));
        } catch (\Throwable $e) {
            // TCK-593 — ni `getMessage()` ni la trace : le message d'une `QueryException` sur
            // l'insertion par paquets porte le SQL AVEC SES VALEURS LIÉES — libellés, contreparties,
            // références et montants de toutes les lignes du paquet. La classe, le SQLSTATE et le
            // point de levée suffisent au diagnostic.
            // Raccord TCK-601 : ce contexte devient `SafeExceptionContext::of($e)`.
            Log::error('bank_statement_parse_failed', [
                'statement_id' => $this->statementId,
                'exception' => $e::class,
                'sqlstate' => $e instanceof QueryException ? ($e->errorInfo[0] ?? null) : null,
                'at' => basename($e->getFile()).':'.$e->getLine(),
            ]);

            // TCK-593 — un relevé dont l'analyse échoue ne reste plus `processing` à vie. Seulement
            // s'il l'est encore : une levée APRÈS la validation des lignes (enchaînement, écouteur)
            // ne fait pas d'un relevé lu un relevé en échec — et un `failed` n'a ainsi jamais de
            // ligne, ce qui permet de le remplacer au ré-import.
            if ($statement->refresh()->status === BankStatementStatus::Processing) {
                $statement->update(['status' => BankStatementStatus::Failed]);
            }

            throw $e;
        }
    }
}
