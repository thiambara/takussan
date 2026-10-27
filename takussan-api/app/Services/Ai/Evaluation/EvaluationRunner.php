<?php

namespace App\Services\Ai\Evaluation;

use App\Models\Enums\AiModelRole;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\AttachmentsUseVision;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Support\Facades\File;
use InvalidArgumentException;
use Laravel\Ai\Files\Image;

/**
 * TCK-2384 (ADR-0076 §8) — joue le jeu de cas d'un usage contre un maillon (le premier de son rôle,
 * ou un candidat) et rend le score par champ, le score global et le coût. Les appels passent par la
 * passerelle, marqués « évaluation » : journalisés, hors budget, hors cache. La référence
 * (`baseline.json`) ne se réécrit que par `writeBaseline()`, que seul `--update-baseline` appelle.
 *
 * TCK-2386 — un cas peut porter `"attachments": ["captures/x.png"]`, chemins relatifs au dossier de
 * l'usage, passés au modèle en `Image::fromPath()`. Sans candidat, un tel cas se joue sur le premier
 * maillon du rôle `vision` quand l'usage est `AttachmentsUseVision`, comme en production ; le
 * rapport nomme alors chaque modèle joué.
 */
final class EvaluationRunner
{
    public function __construct(
        private readonly AiGateway $gateway,
        private readonly AiUsageRegistry $registry,
        private readonly ModelResolver $resolver,
        private readonly FieldScorer $scorer,
        private readonly ?string $root = null,
        private readonly ?string $reportsRoot = null,
    ) {}

    /** @return list<array{input: string, expected: array<string, mixed>, attachments?: list<string>}> */
    public function cases(string $usageKey): array
    {
        $files = glob($this->dir($usageKey).'/cases/*.json') ?: [];
        sort($files);

        return array_map(fn (string $file): array => json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR), $files);
    }

    /** @return list<string> */
    public function evaluableUsages(): array
    {
        return array_values(array_filter(array_keys($this->registry->all()), fn (string $key): bool => $this->cases($key) !== []));
    }

    /** @return array<string, mixed> */
    public function run(string $usageKey, ?ModelLink $candidate = null): array
    {
        $usage = $this->registry->get($usageKey);
        $cases = $this->cases($usageKey);
        if ($cases === []) {
            throw new InvalidArgumentException('ai.eval.no_cases');
        }
        $links = [];
        $linkFor = function (array $case) use ($usage, $candidate, &$links): ModelLink {
            $role = ($case['attachments'] ?? []) !== [] && $usage instanceof AttachmentsUseVision ? AiModelRole::Vision : $usage->role();
            if (! array_key_exists($role->value, $links)) {
                $first = $this->resolver->chainFor($usage, role: $role)[0] ?? null;
                $links[$role->value] = $candidate !== null
                    ? new ModelLink($candidate->provider, $candidate->model, $candidate->maxTokens ?? $first?->maxTokens)
                    : $first;
            }

            return $links[$role->value] ?? throw new InvalidArgumentException('ai.role_unassigned');
        };
        // Tout se résout avant le premier appel : un jeu mal formé ou un rôle sans modèle ne coûte rien.
        $plans = array_map(fn (array $case): array => [$linkFor($case), $this->attachments($usageKey, $case)], $cases);

        $fields = is_file($this->dir($usageKey).'/fields.json')
            ? json_decode((string) file_get_contents($this->dir($usageKey).'/fields.json'), true, flags: JSON_THROW_ON_ERROR)
            : [];
        $sums = [];
        $counts = [];
        $cost = 0.0;
        $failures = 0;
        foreach ($cases as $i => $case) {
            [$link, $attachments] = $plans[$i];
            $actual = null;
            try {
                $result = $this->gateway->run(new AiRequest($usageKey, (string) $case['input'], attachments: $attachments, link: $link, evaluation: true));
                $actual = $result->structured;
                $cost += (float) ($result->call->cost_estimate ?? 0);
            } catch (AiUnavailable|AiRefused) {
            }
            if ($actual === null) {
                // Un cas sans réponse ne vaut jamais 1.0, même sur un champ attendu nul ou vide.
                $failures++;
                $scores = array_map(fn (): float => 0.0, $case['expected']);
            } else {
                $scores = $this->scorer->score($case['expected'], $actual, $fields);
            }
            foreach ($scores as $field => $score) {
                $sums[$field] = ($sums[$field] ?? 0.0) + $score;
                $counts[$field] = ($counts[$field] ?? 0) + 1;
            }
        }
        $byField = [];
        foreach ($sums as $field => $sum) {
            $byField[$field] = round($sum / $counts[$field], 4);
        }
        ksort($byField);

        return [
            'usage' => $usageKey,
            'prompt_version' => $usage->promptVersion(),
            'model' => implode(', ', array_values(array_unique(array_map(fn (array $plan): string => $plan[0]->provider.'/'.$plan[0]->model, $plans)))),
            'cases' => count($cases),
            'failures' => $failures,
            'fields' => $byField,
            'global' => $byField === [] ? 0.0 : round(array_sum($byField) / count($byField), 4),
            'cost_xof' => round($cost, 2),
            'ran_at' => now()->toIso8601String(),
        ];
    }

    /** @param  array<string, mixed>  $report */
    public function writeReport(array $report): string
    {
        $dir = ($this->reportsRoot ?? storage_path('ai-evals')).'/'.$report['usage'];
        File::ensureDirectoryExists($dir);
        $path = $dir.'/'.now()->format('Ymd-His-u').'.json';
        File::put($path, $this->encode($report));

        return $path;
    }

    /** @return array<string, mixed>|null */
    public function baseline(string $usageKey): ?array
    {
        $path = $this->dir($usageKey).'/baseline.json';

        return is_file($path) ? json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR) : null;
    }

    /** @param  array<string, mixed>  $report */
    public function writeBaseline(string $usageKey, array $report): void
    {
        File::put($this->dir($usageKey).'/baseline.json', $this->encode([
            'global' => $report['global'],
            'fields' => $report['fields'],
            'model' => $report['model'],
            'prompt_version' => $report['prompt_version'],
            'updated_at' => $report['ran_at'],
        ]));
    }

    /**
     * Le verdict du cliquet : un code, ou null quand l'évaluation passe. Une panne ou une référence
     * qui ne porte pas les champs du rapport ne passent jamais en silence.
     *
     * @param  array<string, mixed>  $report
     * @param  array<string, mixed>|null  $baseline
     */
    public function verdict(array $report, ?array $baseline): ?string
    {
        if ((int) $report['failures'] > 0) {
            return 'ai.eval.failures';
        }
        if ($baseline !== null) {
            $reference = array_keys($baseline['fields'] ?? []);
            $mesures = array_keys($report['fields']);
            sort($reference);
            sort($mesures);
            if ($reference !== $mesures) {
                return 'ai.eval.baseline_stale';
            }
        }

        return $this->belowBaseline($report, $baseline) ? 'ai.eval.below_baseline' : null;
    }

    /**
     * @param  array<string, mixed>  $report
     * @param  array<string, mixed>|null  $baseline
     */
    public function belowBaseline(array $report, ?array $baseline): bool
    {
        return $baseline !== null && (float) $report['global'] < (float) $baseline['global'];
    }

    /**
     * Les pièces jointes d'un cas, sous le dossier de l'usage et nulle part ailleurs.
     *
     * @param  array<string, mixed>  $case
     * @return list<Image>
     */
    private function attachments(string $usageKey, array $case): array
    {
        $dir = $this->dir($usageKey);

        return array_map(function (mixed $relative) use ($dir): Image {
            if (! is_string($relative) || $relative === '' || str_starts_with($relative, '/') || in_array('..', explode('/', $relative), true)) {
                throw new InvalidArgumentException('ai.eval.attachment_invalid');
            }
            if (! is_file($dir.'/'.$relative)) {
                throw new InvalidArgumentException('ai.eval.attachment_missing');
            }

            return Image::fromPath($dir.'/'.$relative);
        }, array_values($case['attachments'] ?? []));
    }

    private function dir(string $usageKey): string
    {
        return ($this->root ?? base_path('resources/ai/evals')).'/'.$usageKey;
    }

    /** @param  array<string, mixed>  $data */
    private function encode(array $data): string
    {
        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR)."\n";
    }
}
