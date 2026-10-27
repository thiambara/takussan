<?php

namespace Tests\Feature\Ai;

use App\Models\AiRoleAssignment;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiModelRole;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2383 (AC1) — base, sinon configuration ; un modèle forcé l'emporte sur les deux. */
class ModelResolverTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
    }

    private function models(array $chain): array
    {
        return array_map(fn (ModelLink $link): string => $link->provider.'/'.$link->model, $chain);
    }

    public function test_without_a_row_the_chain_comes_from_the_configuration(): void
    {
        $this->assertSame(['anthropic/modele-a', 'anthropic/modele-b'], $this->models(app(ModelResolver::class)->chainFor(new UsageDEssai)));
    }

    public function test_a_stored_assignment_replaces_the_configuration(): void
    {
        AiRoleAssignment::query()->create(['role' => AiModelRole::Extraction, 'chain' => [
            ['provider' => 'anthropic', 'model' => 'modele-b', 'max_tokens' => 500],
        ]]);

        $chain = app(ModelResolver::class)->chainFor(new UsageDEssai);

        $this->assertSame(['anthropic/modele-b'], $this->models($chain));
        $this->assertSame(500, $chain[0]->maxTokens);
    }

    public function test_a_forced_model_wins_and_keeps_the_role_token_ceiling(): void
    {
        $setting = AiUsageSetting::query()->create([
            'usage_key' => UsageDEssai::KEY, 'enabled' => true, 'forced_provider' => 'anthropic', 'forced_model' => 'modele-b',
        ]);

        $chain = app(ModelResolver::class)->chainFor(new UsageDEssai, $setting);

        $this->assertSame(['anthropic/modele-b'], $this->models($chain));
        $this->assertSame(1000, $chain[0]->maxTokens);
    }

    public function test_a_link_parses_and_knows_whether_it_is_priced(): void
    {
        $this->assertTrue(ModelLink::parse('anthropic/modele-a')?->isPriced());
        $this->assertFalse(ModelLink::parse('anthropic/inconnu')?->isPriced());
        $this->assertNull(ModelLink::parse('sans-barre'));
    }
}
