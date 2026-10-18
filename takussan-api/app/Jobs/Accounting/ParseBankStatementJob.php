<?php

namespace App\Jobs\Accounting;

use App\Events\Accounting\BankStatementImported;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementStatus;
use App\Services\Accounting\StatementParser\ParserContext;
use App\Services\Accounting\StatementParser\StatementParserFactory;
use App\Services\Media\PrivateMediaAccess;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class ParseBankStatementJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** TCK-932 — lignes insérées par requête, au fil de la lecture. */
    private const PAQUET = 500;

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

            // TCK-932 (P43.01) — les lignes sont insérées PAR PAQUETS AU FIL DU GÉNÉRATEUR, dans la
            // transaction, au lieu d'être toutes accumulées avant l'insertion. Mesuré avant : un CSV
            // de 10 Mo (accepté par la validation) culminait à 720-781 Mo et mourait en erreur
            // fatale sous les 256 Mo de `docker/php.ini` ; 30 000 lignes prenaient 217 Mo. Seuls un
            // paquet, le compte et les deux bornes de période restent en mémoire.
            //
            // Lignes et passage à `ready_for_review` se valident toujours ENSEMBLE : un plantage
            // entre les deux laissait des lignes sur un relevé `processing`, que l'ancienne garde
            // `lines()->exists()` rendait irrécupérable.
            $lu = DB::transaction(function () use ($access, $media, $parser, $context, $statement): bool {
                $paquet = [];
                $compte = 0;
                $debut = null;
                $fin = null;
                $horodatage = now();

                // TCK-539 — les lecteurs (League\Csv, `file_get_contents`) exigent un chemin LOCAL,
                // et le relevé vit sur le disque privé, distant en production. Copie temporaire, lue
                // EN ENTIER dans le rappel (le parseur est un générateur), supprimée quoi qu'il arrive.
                $access->withLocalCopy($media, function (string $path) use ($parser, $context, $statement, $horodatage, &$paquet, &$compte, &$debut, &$fin): void {
                    foreach ($parser->parse($path, $context) as $parsed) {
                        $date = $parsed->postedAt->toDateString();

                        $paquet[] = [
                            'bank_statement_id' => $statement->id,
                            'posted_at' => $date,
                            'amount' => $parsed->amount,
                            'direction' => $parsed->direction->value,
                            'currency' => $parsed->currency,
                            'label' => $parsed->label,
                            'reference' => $parsed->reference,
                            'counterparty' => $parsed->counterparty,
                            'raw_payload' => json_encode($parsed->raw),
                            'match_status' => 'unmatched',
                            'created_at' => $horodatage,
                            'updated_at' => $horodatage,
                        ];
                        $compte++;

                        // `Y-m-d` se compare comme une chaîne.
                        $debut = $debut === null || $date < $debut ? $date : $debut;
                        $fin = $fin === null || $date > $fin ? $date : $fin;

                        if (count($paquet) === self::PAQUET) {
                            BankStatementLine::insert($paquet);
                            $paquet = [];
                        }
                    }
                });

                if ($paquet !== []) {
                    BankStatementLine::insert($paquet);
                }

                $skipped = $context->tally->skipped;

                // TCK-593 — un fichier dont des lignes ont été sautées et AUCUNE lue n'est pas un
                // relevé vide à vérifier : c'est un mapping qui ne correspond pas au fichier.
                // `failed`, avec le compte, au lieu de `ready_for_review` à zéro ligne.
                if ($compte === 0 && $skipped > 0) {
                    $statement->update([
                        'lines_count' => 0,
                        'skipped_lines_count' => $skipped,
                        'status' => BankStatementStatus::Failed,
                    ]);

                    return false;
                }

                $statement->update([
                    'lines_count' => $compte,
                    'skipped_lines_count' => $skipped,
                    'period_start' => $debut,
                    'period_end' => $fin,
                    'status' => BankStatementStatus::ReadyForReview,
                ]);

                return true;
            });

            if (! $lu) {
                return;
            }

            // Chain matching + notify only after the parse has durably committed.
            MatchBankStatementJob::dispatch($this->statementId);
            event(new BankStatementImported($statement->refresh()));
        } catch (Throwable $e) {
            // TCK-593 — ni `getMessage()` ni la trace : le message d'une `QueryException` sur
            // l'insertion par paquets porte le SQL AVEC SES VALEURS LIÉES — libellés, contreparties,
            // références et montants de toutes les lignes du paquet. La classe, le SQLSTATE et le
            // point de levée suffisent au diagnostic.
            // TCK-601 — raccord fait : la forme sûre partagée (ADR-0044 §2).
            Log::error('bank_statement_parse_failed', [
                'statement_id' => $this->statementId,
            ] + SafeExceptionContext::of($e));

            // TCK-593 — un relevé dont l'analyse échoue ne reste plus `processing` à vie. Seulement
            // s'il l'est encore : une levée APRÈS la validation des lignes (enchaînement, écouteur)
            // ne fait pas d'un relevé lu un relevé en échec — et un `failed` n'a ainsi jamais de
            // ligne, ce qui permet de le remplacer au ré-import.
            if ($statement->refresh()->status === BankStatementStatus::Processing) {
                $statement->update(['status' => BankStatementStatus::Failed]);
            }

            // TCK-593 (vérification adverse, R8) — relancer `$e` le confiait au rapporteur du
            // worker et à `failed_jobs.exception`, qui en écrivent le message : le SQL et ses
            // valeurs liées, soit le relevé. On relance une exception ASSAINIE — classe d'origine
            // et SQLSTATE, sans `previous` — pour que le job reste en échec sans rien recopier.
            // Le rapporteur global de TCK-601 ne change rien à ce choix.
            throw new \RuntimeException(sprintf(
                'Bank statement #%d parse failed (%s, sqlstate %s).',
                $this->statementId,
                $e::class,
                $e instanceof QueryException ? ($e->errorInfo[0] ?? 'n/a') : 'n/a',
            ));
        }
    }

    /**
     * TCK-932 (P43.01) — échec DÉFINITIF du job, y compris quand `handle()` n'a pas atteint son
     * `catch` : erreur fatale de mémoire, processus tué au délai du worker. Le worker marque alors
     * le job en échec au rejeu suivant (`$tries = 1`) sans rien exécuter, et appelle seulement
     * cette méthode. Sans elle, le relevé restait `processing` à vie et bloquait le ré-import du
     * même fichier — la promesse TCK-593 du `catch` ne tenait que pour les levées attrapables.
     *
     * Seulement s'il l'est encore, comme dans le `catch` : un relevé lu ne devient pas `failed`.
     * La transaction de `handle()` n'ayant pas été validée, un `failed` n'a aucune ligne.
     */
    public function failed(?Throwable $exception): void
    {
        BankStatement::query()
            ->whereKey($this->statementId)
            ->where('status', BankStatementStatus::Processing)
            ->update(['status' => BankStatementStatus::Failed]);
    }
}
