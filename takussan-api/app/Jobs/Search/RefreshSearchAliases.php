<?php

namespace App\Jobs\Search;

use App\Ai\Agents\SearchAliasProposals;
use App\Jobs\Concerns\RunsOnAiQueue;
use App\Models\User;
use App\Services\Search\Aliases\SearchAliasCurator;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2476 (ADR-0088 §7) — un passage des variantes d'écriture ({@see SearchAliasCurator}), en file `ai`. Mis en file par
 * `search:refresh-aliases` (chaque semaine).
 *
 * Unique (un seul en file ou en cours) et idempotent : les mêmes saisies que le dernier passage n'appellent pas le
 * modèle, et une variante est unique par (écriture, sorte, cible). Une tentative : un échec attend le passage suivant.
 */
class RefreshSearchAliases implements ShouldBeUnique, ShouldQueue
{
    use Queueable;
    use RunsOnAiQueue;

    /** Sous le délai de reprise de la file `ai` (90 s, ADR-0078 ; `scripts/check-queues.mjs`). */
    public const TIMEOUT_SECONDS = 85;

    /** Le temps laissé à l'appel, tous maillons compris ({@see SearchAliasProposals::timeout()}). */
    public const AI_CALL_BUDGET_SECONDS = self::TIMEOUT_SECONDS - 10;

    public int $tries = 1;

    public int $timeout = self::TIMEOUT_SECONDS;

    public int $uniqueFor = 600;

    /** @param  int|null  $operatorId  le `super_admin` au nom duquel l'usage est jugé ; `null` : le plus ancien actif */
    public function __construct(public readonly ?int $operatorId = null)
    {
        $this->onAiQueue();
    }

    public function handle(SearchAliasCurator $curator): void
    {
        $operator = $this->operatorId === null ? null : User::query()->find($this->operatorId);
        if ($this->operatorId !== null && $operator === null) {
            Log::warning('search.aliases.operator_missing', ['operator_id' => $this->operatorId]);

            return;
        }

        $result = $curator->run($operator);
        Log::info('search.aliases.run', ['outcome' => $result['outcome'], 'created' => $result['created'], 'updated' => $result['updated'], 'discarded' => count($result['discarded'])]);
    }
}
