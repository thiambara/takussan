<?php

namespace App\Services\Ai\Evaluation;

use App\Models\Enums\AiModelRole;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiMoney;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsage;
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
 * l'usage, passés au modèle en `Image::fromPath()`. Chaque cas a un RÔLE EFFECTIF (`roleOf()`) : le
 * rôle `vision` pour un cas à captures d'un usage `AttachmentsUseVision`, le rôle de l'usage sinon,
 * comme en production. Le rapport, et la référence, se ventilent par rôle (`roles`).
 *
 * Un candidat remplace le premier maillon d'UN rôle : `run($usage, $candidat, $role)` ne joue que les
 * cas de ce rôle (à défaut de rôle nommé, celui de l'usage), et le cliquet le compare à la section de
 * la référence de ce rôle — jamais à un score global qui mêlerait d'autres modèles. Sans candidat,
 * chaque cas se joue sur le premier maillon de son rôle effectif.
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

    /**
     * Le rôle sur lequel un cas se joue.
     *
     * @param  array<string, mixed>  $case
     */
    public function roleOf(AiUsage $usage, array $case): AiModelRole
    {
        return ! empty($case['attachments']) && $usage instanceof AttachmentsUseVision ? AiModelRole::Vision : $usage->role();
    }

    /**
     * Les usages dont au moins un cas se joue sur ce rôle : ce qu'éprouve le candidat d'un rôle.
     *
     * @return list<string>
     */
    public function usagesForRole(AiModelRole $role): array
    {
        return array_values(array_filter(array_keys($this->registry->all()), function (string $key) use ($role): bool {
            $usage = $this->registry->get($key);

            return collect($this->cases($key))->contains(fn (array $case): bool => $this->roleOf($usage, $case) === $role);
        }));
    }

    /**
     * @param  ModelLink|null  $candidate  remplace le premier maillon de `$role`
     * @param  AiModelRole|null  $role  ne joue que les cas de ce rôle ; avec un candidat, défaut : le rôle de l'usage
     * @return array<string, mixed>
     */
    public function run(string $usageKey, ?ModelLink $candidate = null, ?AiModelRole $role = null): array
    {
        $usage = $this->registry->get($usageKey);
        $role ??= $candidate !== null ? $usage->role() : null;
        $cases = array_values(array_filter(
            $this->cases($usageKey),
            fn (array $case): bool => $role === null || $this->roleOf($usage, $case) === $role,
        ));
        if ($cases === []) {
            throw new InvalidArgumentException('ai.eval.no_cases');
        }
        $links = [];
        $linkFor = function (AiModelRole $caseRole) use ($usage, $candidate, &$links): ModelLink {
            if (! array_key_exists($caseRole->value, $links)) {
                $first = $this->resolver->chainFor($usage, role: $caseRole)[0] ?? null;
                $links[$caseRole->value] = $candidate !== null
                    ? new ModelLink($candidate->provider, $candidate->model, $candidate->maxTokens ?? $first?->maxTokens)
                    : $first;
            }

            return $links[$caseRole->value] ?? throw new InvalidArgumentException('ai.role_unassigned');
        };
        // Tout se résout avant le premier appel : un jeu mal formé ou un rôle sans modèle ne coûte rien.
        $plans = array_map(function (array $case) use ($usage, $usageKey, $linkFor): array {
            $caseRole = $this->roleOf($usage, $case);

            return [$caseRole, $linkFor($caseRole), $this->attachments($usageKey, $case)];
        }, $cases);

        $fields = is_file($this->dir($usageKey).'/fields.json')
            ? json_decode((string) file_get_contents($this->dir($usageKey).'/fields.json'), true, flags: JSON_THROW_ON_ERROR)
            : [];
        $scored = [];
        $cost = AiMoney::ZERO;
        foreach ($cases as $i => $case) {
            [$caseRole, $link, $attachments] = $plans[$i];
            $actual = null;
            try {
                $result = $this->gateway->run(new AiRequest($usageKey, (string) $case['input'], attachments: $attachments, link: $link, evaluation: true));
                $actual = $result->structured;
                $cost = AiMoney::add($cost, $result->call->cost_estimate_usd ?? AiMoney::ZERO);
            } catch (AiUnavailable|AiRefused) {
            }
            // Un cas sans réponse ne vaut jamais 1.0, même sur un champ attendu nul ou vide.
            $scored[] = [
                'role' => $caseRole->value,
                'model' => $link->provider.'/'.$link->model,
                'failed' => $actual === null,
                'scores' => $actual === null ? array_map(fn (): float => 0.0, $case['expected']) : $this->scorer->score($case['expected'], $actual, $fields),
            ];
        }

        $sections = [];
        foreach (array_unique(array_column($scored, 'role')) as $caseRole) {
            $sections[$caseRole] = $this->section(array_values(array_filter($scored, fn (array $c): bool => $c['role'] === $caseRole)));
        }
        $whole = $this->section($scored);
        $models = array_values(array_unique(array_column($scored, 'model')));

        return [
            'usage' => $usageKey,
            'prompt_version' => $usage->promptVersion(),
            'role' => $role?->value,
            // UN modèle : le seul joué, sinon celui du rôle de l'usage ; `models` les nomme tous.
            'model' => count($models) === 1 ? $models[0] : ($sections[$usage->role()->value]['model'] ?? $models[0]),
            'models' => $models,
            'cases' => $whole['cases'],
            'failures' => $whole['failures'],
            'fields' => $whole['fields'],
            'global' => $whole['global'],
            'cost_usd' => $cost,
            'ran_at' => now()->toIso8601String(),
            'roles' => $sections,
        ];
    }

    /**
     * Score par champ (moyenne sur les cas qui le portent) et score global d'un ensemble de cas.
     *
     * @param  list<array{role: string, model: string, failed: bool, scores: array<string, float>}>  $scored
     * @return array{model: string, cases: int, failures: int, fields: array<string, float>, global: float}
     */
    private function section(array $scored): array
    {
        $sums = [];
        $counts = [];
        foreach ($scored as $case) {
            foreach ($case['scores'] as $field => $score) {
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
            'model' => implode(', ', array_values(array_unique(array_column($scored, 'model')))),
            'cases' => count($scored),
            'failures' => count(array_filter($scored, fn (array $c): bool => $c['failed'])),
            'fields' => $byField,
            'global' => $byField === [] ? 0.0 : round(array_sum($byField) / count($byField), 4),
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

    /**
     * La référence d'un usage. Elle porte une section par rôle (`roles`) ; une référence écrite avant
     * TCK-2386, sans `roles`, ne vaut que pour le rôle de l'usage — elle ne juge jamais la vision.
     *
     * @return array<string, mixed>|null
     */
    public function baseline(string $usageKey): ?array
    {
        $path = $this->dir($usageKey).'/baseline.json';
        if (! is_file($path)) {
            return null;
        }
        $baseline = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        if (! isset($baseline['roles']) && isset($baseline['global']) && $this->registry->has($usageKey)) {
            $baseline['roles'] = [$this->registry->get($usageKey)->role()->value => array_intersect_key($baseline, array_flip(['global', 'fields', 'model']))];
        }

        return $baseline;
    }

    /**
     * Un rapport complet (sans rôle) réécrit toute la référence ; le rapport d'un seul rôle ne
     * réécrit que la section de ce rôle, le reste demeure.
     *
     * ⚠ La référence du JEU COMPLET (`global`, `fields`) n'est réinitialisée que par un rapport
     * complet : après la réécriture d'une seule section, elle reste celle du dernier jeu complet, et
     * c'est contre elle qu'un jeu complet suivant est jugé. Elle ne se recalcule pas depuis les
     * sections (une moyenne par champ demande le compte des cas de chaque champ). Une première
     * référence vient donc d'un jeu complet : celle d'un seul rôle, sans référence complète, est
     * refusée (`ai.eval.baseline_needs_full_run`).
     *
     * @param  array<string, mixed>  $report
     */
    public function writeBaseline(string $usageKey, array $report): void
    {
        if (($report['role'] ?? null) !== null && ! isset($this->baseline($usageKey)['global'])) {
            throw new InvalidArgumentException('ai.eval.baseline_needs_full_run');
        }
        $sections = array_map(
            fn (array $section): array => ['global' => $section['global'], 'fields' => $section['fields'], 'model' => $section['model']],
            $report['roles'],
        );
        $baseline = ($report['role'] ?? null) === null
            ? ['global' => $report['global'], 'fields' => $report['fields'], 'model' => $report['model'], 'models' => $report['models'], 'roles' => $sections]
            : array_replace($this->baseline($usageKey) ?? [], ['roles' => $sections + ($this->baseline($usageKey)['roles'] ?? [])]);

        File::put($this->dir($usageKey).'/baseline.json', $this->encode(array_replace($baseline, [
            'prompt_version' => $report['prompt_version'],
            'updated_at' => $report['ran_at'],
        ])));
    }

    /**
     * Le score de référence auquel un rapport est comparé : la section de son rôle pour un rapport
     * d'un seul rôle, le global du jeu complet sinon ; `$role` lit une section précise.
     *
     * @param  array<string, mixed>  $report
     * @param  array<string, mixed>|null  $baseline
     */
    public function referenceGlobal(array $report, ?array $baseline, ?string $role = null): ?float
    {
        $role ??= $report['role'] ?? null;
        $global = $role !== null ? ($baseline['roles'][$role]['global'] ?? null) : ($baseline['global'] ?? null);

        return $global !== null ? (float) $global : null;
    }

    /**
     * Le verdict du cliquet : un code, ou null quand l'évaluation passe. Une panne ou une référence
     * qui ne porte pas les champs du rapport ne passent jamais en silence. Chaque rôle du rapport se
     * compare à SA section de la référence ; un rapport complet, en outre, au score global.
     *
     * @param  array<string, mixed>  $report
     * @param  array<string, mixed>|null  $baseline
     */
    public function verdict(array $report, ?array $baseline): ?string
    {
        if ((int) $report['failures'] > 0) {
            return 'ai.eval.failures';
        }
        foreach ($this->comparisons($report, $baseline) as [$mesure, $reference]) {
            $attendus = array_keys($reference['fields'] ?? []);
            $mesures = array_keys($mesure['fields']);
            sort($attendus);
            sort($mesures);
            if ($attendus !== $mesures) {
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
        foreach ($this->comparisons($report, $baseline) as [$mesure, $reference]) {
            if ((float) $mesure['global'] < (float) $reference['global']) {
                return true;
            }
        }

        return false;
    }

    /**
     * Les paires (mesure, référence) qui se comparent : chaque section de rôle à la section du même
     * rôle ; le score global seulement pour un rapport complet. Un rôle sans section n'a pas de référence.
     *
     * @param  array<string, mixed>  $report
     * @param  array<string, mixed>|null  $baseline
     * @return list<array{0: array<string, mixed>, 1: array<string, mixed>}>
     */
    private function comparisons(array $report, ?array $baseline): array
    {
        if ($baseline === null) {
            return [];
        }
        $pairs = [];
        if (($report['role'] ?? null) === null && isset($baseline['global'])) {
            $pairs[] = [$report, $baseline];
        }
        foreach ($report['roles'] ?? [] as $role => $section) {
            if (isset($baseline['roles'][$role]['global'])) {
                $pairs[] = [$section, $baseline['roles'][$role]];
            }
        }

        return $pairs;
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
        $relatives = $case['attachments'] ?? [];
        if (! is_array($relatives) || ! array_is_list($relatives)) {
            throw new InvalidArgumentException('ai.eval.attachment_invalid');
        }

        return array_map(function (mixed $relative) use ($dir): Image {
            if (! is_string($relative) || $relative === '' || str_starts_with($relative, '/') || in_array('..', explode('/', $relative), true)) {
                throw new InvalidArgumentException('ai.eval.attachment_invalid');
            }
            if (! is_file($dir.'/'.$relative)) {
                throw new InvalidArgumentException('ai.eval.attachment_missing');
            }

            return Image::fromPath($dir.'/'.$relative);
        }, $relatives);
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
