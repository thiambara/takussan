<?php

namespace App\Console\Commands;

use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\ModelLink;
use Illuminate\Console\Command;
use Throwable;

/**
 * TCK-2384 (ADR-0076 §8) — les évaluations du socle IA, contre de VRAIS modèles : elles coûtent, et
 * ne tournent ni dans la suite de tests ni dans la CI des PR. La nuit (`routes/console.php`) et à
 * la main. Sort en échec sous la référence ; `--update-baseline` écrit la nouvelle, explicitement.
 */
class AiEval extends Command
{
    protected $signature = 'ai:eval
        {usage? : Clé de l\'usage à évaluer}
        {--all : Tous les usages qui ont un jeu de cas}
        {--model= : Candidat à évaluer, « fournisseur/modèle »}
        {--update-baseline : Écrit le score obtenu comme nouvelle référence}';

    protected $description = 'Joue les jeux d\'évaluation du socle IA et compare leur score à la référence';

    public function handle(EvaluationRunner $runner, AiUsageRegistry $registry): int
    {
        if (! collect(config('ai.providers'))->contains(fn (array $provider): bool => filled($provider['key'] ?? null))) {
            $this->components->info('Aucun fournisseur n\'a de clé : rien à évaluer.');

            return self::SUCCESS;
        }

        $keys = $this->option('all') ? $runner->evaluableUsages() : array_filter([(string) $this->argument('usage')]);
        if ($keys === [] && $this->option('all')) {
            // Le planning de nuit passe `--all` : sans aucun jeu, il n'y a rien à échouer.
            $this->components->info('Aucun usage n\'a de jeu d\'évaluation : rien à évaluer.');

            return self::SUCCESS;
        }
        if ($keys === []) {
            $this->components->error('Nommer un usage, ou passer --all.');

            return self::INVALID;
        }

        $candidate = null;
        if (filled($this->option('model'))) {
            $candidate = ModelLink::parse((string) $this->option('model'));
            if ($candidate === null || ! $candidate->isPriced()) {
                $this->components->error('Candidat inconnu ou sans tarif : '.$this->option('model'));

                return self::INVALID;
            }
        }

        $status = self::SUCCESS;
        foreach ($keys as $key) {
            if (! $registry->has($key)) {
                $this->components->error('Usage inconnu : '.$key);
                $status = self::INVALID;

                continue;
            }
            try {
                $report = $runner->run($key, $candidate);
            } catch (Throwable $e) {
                $this->components->error($key.' : '.class_basename($e));
                $status = self::FAILURE;

                continue;
            }
            $path = $runner->writeReport($report);
            $baseline = $runner->baseline($key);
            $verdict = $runner->verdict($report, $baseline);

            $this->line(sprintf(
                '%s — %s : %.4f (référence %s), %d cas, %d échec(s), %.2f XOF%s',
                $key, $report['model'], $report['global'],
                $baseline !== null ? sprintf('%.4f', $baseline['global']) : 'aucune',
                $report['cases'], $report['failures'], $report['cost_xof'],
                $verdict !== null ? ' — '.$verdict : '',
            ));
            foreach ($report['fields'] as $field => $score) {
                $this->line(sprintf('  %-28s %.4f', $field, $score));
            }
            $this->line('  rapport : '.$path);

            if ($this->option('update-baseline')) {
                if ($report['failures'] > 0) {
                    $this->components->error($key.' : référence non écrite, '.$report['failures'].' cas en échec.');
                    $status = self::FAILURE;

                    continue;
                }
                $runner->writeBaseline($key, $report);
                $this->components->info($key.' : référence écrite.');

                continue;
            }
            if ($verdict !== null) {
                $this->components->error($key.' : '.$verdict.'.');
                $status = self::FAILURE;
            }
        }

        return $status;
    }
}
