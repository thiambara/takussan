<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelResolver;
use ReflectionMethod;
use Tests\TestCase;

/**
 * TCK-2384 — les jeux d'évaluation doivent partir dans l'image de l'API : `.dockerignore` exclut
 * `tests`, un jeu qui y vivrait ferait échouer toute évaluation lancée depuis la console déployée
 * (`ai.eval.no_cases`). La racine par défaut du lanceur ne doit donc être sous aucune entrée du fichier.
 */
class EvalSetsShipInTheImageTest extends TestCase
{
    public function test_the_default_evaluation_root_is_not_excluded_from_the_docker_context(): void
    {
        $runner = new EvaluationRunner(app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer);
        $dir = (new ReflectionMethod($runner, 'dir'))->invoke($runner, 'x');
        $relatif = ltrim(str_replace(base_path(), '', $dir), '/');

        $exclues = collect(file(base_path('.dockerignore'), FILE_IGNORE_NEW_LINES))
            ->map(fn (string $ligne): string => trim($ligne))
            ->reject(fn (string $ligne): bool => $ligne === '' || str_starts_with($ligne, '#'))
            ->filter(fn (string $entree): bool => $relatif === rtrim($entree, '/') || str_starts_with($relatif, rtrim($entree, '/').'/'));

        $this->assertSame([], $exclues->values()->all(), "« {$relatif} » est exclu de l'image par .dockerignore.");
    }
}
