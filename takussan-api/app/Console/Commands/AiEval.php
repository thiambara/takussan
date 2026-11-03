<?php

namespace App\Console\Commands;

use App\Models\Enums\AiModelRole;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\ModelLink;
use Illuminate\Console\Command;
use InvalidArgumentException;
use Throwable;

/**
 * TCK-2384 (ADR-0076 §8) — les évaluations du socle IA, contre de VRAIS modèles : elles coûtent, et
 * ne tournent ni dans la suite de tests ni dans la CI des PR. La nuit (`routes/console.php`) et à
 * la main. Sort en échec sous la référence ; `--update-baseline` écrit la nouvelle, explicitement.
 *
 * TCK-2386 — `--role=` ne joue que les cas de ce rôle (les captures d'un usage `AttachmentsUseVision`
 * se jouent en `vision`). Un candidat (`--model=`) remplace le premier maillon d'UN rôle : `--role=`,
 * à défaut le rôle de l'usage — `ai:eval radar.extraction --model=… --role=vision` évalue un modèle
 * de vision sur les seules captures. Le cliquet compare chaque rôle à sa section de la référence, et
 * `--update-baseline` sur un seul rôle ne réécrit que la sienne.
 */
class AiEval extends Command
{
    protected $signature = 'ai:eval
        {usage? : Clé de l\'usage à évaluer}
        {--all : Tous les usages qui ont un jeu de cas}
        {--model= : Candidat à évaluer, « fournisseur/modèle »}
        {--role= : Ne joue que les cas de ce rôle ; le candidat vaut pour lui (défaut : le rôle de l\'usage)}
        {--update-baseline : Écrit le score obtenu comme nouvelle référence}';

    protected $description = 'Joue les jeux d\'évaluation du socle IA et compare leur score à la référence';

    public function handle(EvaluationRunner $runner, AiUsageRegistry $registry, AiProviderCatalogue $providers): int
    {
        if ($providers->selectableKeys() === []) {
            $this->components->info('Aucun fournisseur sélectionnable (clé présente, adresse acceptée) : rien à évaluer.');

            return self::SUCCESS;
        }

        $role = null;
        if (filled($this->option('role'))) {
            $role = AiModelRole::tryFrom((string) $this->option('role'));
            if ($role === null) {
                $this->components->error('Rôle inconnu : '.$this->option('role'));

                return self::INVALID;
            }
        }

        $keys = $this->option('all')
            ? ($role !== null ? $runner->usagesForRole($role) : $runner->evaluableUsages())
            : array_filter([(string) $this->argument('usage')]);
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
            if (! $providers->selectable($candidate->provider)) {
                $this->components->error('Fournisseur non sélectionnable : '.$candidate->provider.' ('.$providers->refusalCode($candidate->provider).')');

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
                $report = $runner->run($key, $candidate, $role);
            } catch (Throwable $e) {
                $this->components->error($key.' : '.class_basename($e));
                $status = self::FAILURE;

                continue;
            }
            $path = $runner->writeReport($report);
            $baseline = $runner->baseline($key);
            $verdict = $runner->verdict($report, $baseline);

            $this->line(sprintf(
                '%s — %s : %.4f (référence %s), %d cas, %d échec(s), %s USD%s',
                $key, implode(', ', $report['models']), $report['global'],
                $this->reference($runner->referenceGlobal($report, $baseline)),
                $report['cases'], $report['failures'], $report['cost_usd'],
                $verdict !== null ? ' — '.$verdict : '',
            ));
            foreach ($report['fields'] as $field => $score) {
                $this->line(sprintf('  %-28s %.4f', $field, $score));
            }
            if (count($report['roles']) > 1) {
                foreach ($report['roles'] as $sectionRole => $section) {
                    $this->line(sprintf(
                        '  rôle %-23s %.4f (%s, %d cas, référence %s)',
                        $sectionRole, $section['global'], $section['model'], $section['cases'],
                        $this->reference($runner->referenceGlobal($report, $baseline, $sectionRole)),
                    ));
                }
            }
            $this->line('  rapport : '.$path);

            if ($this->option('update-baseline')) {
                if ($report['failures'] > 0) {
                    $this->components->error($key.' : référence non écrite, '.$report['failures'].' cas en échec.');
                    $status = self::FAILURE;

                    continue;
                }
                try {
                    $runner->writeBaseline($key, $report);
                } catch (InvalidArgumentException $e) {
                    $this->components->error($key.' : '.$e->getMessage().' — une première référence vient d\'un jeu complet (sans --role ni --model).');
                    $status = self::FAILURE;

                    continue;
                }
                $this->components->info($report['role'] === null
                    ? $key.' : référence écrite.'
                    : $key.' : référence du rôle '.$report['role'].' écrite ; celle du jeu complet demeure (seul un --update-baseline complet la réécrit).');

                continue;
            }
            if ($verdict !== null) {
                $this->components->error($key.' : '.$verdict.'.');
                $status = self::FAILURE;
            }
        }

        return $status;
    }

    private function reference(?float $global): string
    {
        return $global !== null ? sprintf('%.4f', $global) : 'aucune';
    }
}
