<?php

namespace Tests\Feature\Ai;

use App\Models\Agency;
use App\Models\AiCall;
use App\Models\Enums\AiRefusalReason;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Ai\AiAuthority;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Exceptions\AiRefused;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageAgenceDEssai;
use Tests\TestCase;

/**
 * TCK-2383 (ADR-0076 §9, principe 2 de CLAUDE.md) — une capacité d'usage se juge pour le couple
 * (utilisateur, agence) : un membre de A qui demande B est refusé, et refusé AVANT tout appel.
 */
class AiAgencyIsolationTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private Agency $agenceA;

    private Agency $agenceB;

    private User $membreDeA;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry([UsageAgenceDEssai::class]));
        $this->agenceA = Agency::factory()->create();
        $this->agenceB = Agency::factory()->create();
        $this->membreDeA = User::factory()->create(['agency_id' => $this->agenceA->id]);
        $this->materializeRoleProfile($this->membreDeA, 'agent', $this->agenceA);
    }

    private function requete(?int $agencyId): AiRequest
    {
        return new AiRequest(UsageAgenceDEssai::KEY, 'Villa à Ngor, 100 francs', actor: $this->membreDeA, agencyId: $agencyId);
    }

    private function refus(AiRequest $requete): AiRefused
    {
        try {
            app(AiGateway::class)->run($requete);
        } catch (AiRefused $refus) {
            return $refus;
        }
        $this->fail('la passerelle devait refuser');
    }

    public function test_a_member_of_an_agency_is_allowed_for_that_agency(): void
    {
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 100]);

        $result = app(AiGateway::class)->run($this->requete($this->agenceA->id));

        $this->assertSame(['titre' => 'Villa', 'prix' => 100], $result->structured);
    }

    public function test_a_member_of_an_agency_is_refused_for_another_agency_and_the_refusal_is_journaled(): void
    {
        AgentDEssai::fake();

        $this->assertSame(AiRefusalReason::Forbidden, $this->refus($this->requete($this->agenceB->id))->reason);

        AgentDEssai::assertNeverPrompted();
        $this->assertSame(1, AiCall::query()->where('refusal_reason', 'forbidden')->where('agency_id', $this->agenceB->id)->count());
    }

    public function test_a_capability_usage_without_an_agency_is_refused(): void
    {
        AgentDEssai::fake();

        $this->assertSame(AiRefusalReason::Forbidden, $this->refus($this->requete(null))->reason);
        AgentDEssai::assertNeverPrompted();
    }

    public function test_the_authority_refuses_a_null_agency_by_itself_even_for_an_operator(): void
    {
        $operateur = $this->actingAsRole('super_admin');

        $this->assertFalse(app(AiAuthority::class)->allows($operateur, Capability::PropertiesCreate, null));
    }
}
