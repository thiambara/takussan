<?php

namespace App\Console\Commands;

use App\Services\Ai\Evaluation\EvalCaseExporter;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * TCK-2384 — transforme les suggestions corrigées d'un usage en cas d'évaluation anonymisés, sous
 * `resources/ai/evals/<usage>/cases/`. Relire chaque fichier avant de le commiter :
 * `check-ai-evals-pii.mjs` attrape un numéro ou un courriel oublié, pas un nom.
 */
class AiExportEvalCases extends Command
{
    protected $signature = 'ai:export-eval-cases
        {usage : Clé de l\'usage}
        {--since= : Ne prendre que les décisions depuis cette date (AAAA-MM-JJ)}';

    protected $description = 'Exporte les corrections humaines d\'un usage IA en cas d\'évaluation anonymisés';

    public function handle(EvalCaseExporter $exporter): int
    {
        $since = filled($this->option('since')) ? CarbonImmutable::parse((string) $this->option('since'))->startOfDay() : null;
        $written = $exporter->export((string) $this->argument('usage'), $since);

        $this->components->info(sprintf('%d cas écrit(s).', count($written)));
        foreach ($written as $path) {
            $this->line('  '.$path);
        }

        return self::SUCCESS;
    }
}
