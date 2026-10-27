<?php

namespace Tests\Feature\Api\Admin;

use App\Models\AiRoleAssignment;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2385 (AC1) — la chaîne d'un rôle se règle depuis la console et change le prochain appel. */
class AdminAiRolesTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
    }

    public function test_the_roles_show_their_chain_and_its_source(): void
    {
        $this->actingAsRole('super_admin');

        $roles = collect($this->getJson('/api/admin/ai/roles')->assertOk()->json('data.roles'))->keyBy('role');

        $this->assertSame('config', $roles['extraction']['source']);
        $this->assertSame('modele-a', $roles['extraction']['chain'][0]['model']);
        $this->assertSame(['modele-a', 'modele-b'], $this->getJson('/api/admin/ai/roles')->json('data.providers.0.models'));
    }

    public function test_reordering_a_chain_changes_the_model_called_next_and_is_journaled(): void
    {
        $operateur = $this->actingAsRole('super_admin');
        $modeles = [];
        AgentDEssai::fake(function (string $p, $a, $provider, string $model) use (&$modeles) {
            $modeles[] = $model;

            return ['titre' => 'Villa', 'prix' => 100];
        });

        $this->putJson('/api/admin/ai/roles/extraction', ['chain' => [
            ['provider' => 'anthropic', 'model' => 'modele-b', 'max_tokens' => 800],
            ['provider' => 'anthropic', 'model' => 'modele-a'],
        ]])->assertOk()->assertJsonPath('data.roles.0.source', 'database');
        app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'x', actor: $operateur));

        $this->assertSame(['modele-b'], $modeles);
        $journal = Activity::query()->where('event', 'super_admin_ai_role_updated')->sole();
        $this->assertSame('modele-a', $journal->properties['before'][0]['model']);
        $this->assertSame('modele-b', $journal->properties['after'][0]['model']);
    }

    public function test_an_unknown_provider_an_unpriced_model_and_an_empty_chain_are_refused(): void
    {
        $this->actingAsRole('super_admin');

        $this->putJson('/api/admin/ai/roles/extraction', ['chain' => [['provider' => 'openai', 'model' => 'modele-a']]])
            ->assertStatus(422)->assertJsonValidationErrors('chain.0.provider');
        $this->putJson('/api/admin/ai/roles/extraction', ['chain' => [['provider' => 'anthropic', 'model' => 'inconnu']]])->assertStatus(422)->assertJsonPath('code', 'ai.model_unpriced');
        $this->putJson('/api/admin/ai/roles/extraction', ['chain' => []])->assertStatus(422)->assertJsonValidationErrors('chain');
        $this->putJson('/api/admin/ai/roles/inconnu', ['chain' => [['provider' => 'anthropic', 'model' => 'modele-a']]])->assertStatus(404)->assertJsonPath('code', 'ai.role_unknown');
    }

    public function test_deleting_the_assignment_returns_to_the_configuration(): void
    {
        $this->actingAsRole('super_admin');
        AiRoleAssignment::query()->create(['role' => 'extraction', 'chain' => [['provider' => 'anthropic', 'model' => 'modele-b']]]);

        $this->deleteJson('/api/admin/ai/roles/extraction')->assertOk()->assertJsonPath('data.roles.0.source', 'config');
        $this->assertSame(0, AiRoleAssignment::query()->count());
    }
}
