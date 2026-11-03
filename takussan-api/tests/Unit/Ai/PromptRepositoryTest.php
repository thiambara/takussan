<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\PromptRepository;
use RuntimeException;
use Tests\TestCase;

/** TCK-2384 — un prompt se charge par usage et par version ; une version absente est un code. */
class PromptRepositoryTest extends TestCase
{
    public function test_it_loads_the_requested_version_from_the_first_root_that_has_it(): void
    {
        $repository = new PromptRepository([resource_path('ai/prompts'), base_path('tests/Support/Ai/prompts')]);

        $this->assertStringContainsString('OK', $repository->load('socle.test_connexion', 1));
        $this->assertStringContainsString('JSON', $repository->load('essai.extraction', 1));
    }

    public function test_a_missing_version_is_refused(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('ai.prompt_missing');

        (new PromptRepository)->load('socle.test_connexion', 99);
    }
}
