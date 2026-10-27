<?php

namespace Tests\Feature\Ai;

use App\Models\AiCall;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiUnavailable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Ai\Responses\Data\FinishReason;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\AgentFinDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/**
 * TCK-2399 — une réponse tronquée (`length`) ou filtrée (`content_filter`) est un échec du maillon :
 * elle est journalisée avec sa raison de fin et un code `ai.*`, ses jetons comptent, et la passerelle
 * essaie le maillon suivant. Une réponse complète garde sa raison (`stop`).
 */
class AiGatewayStopReasonTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->operateur = $this->actingAsRole('super_admin');
    }

    /** @param  array<string, FinishReason>  $fins */
    private function lancer(array $fins): mixed
    {
        $this->app->bind(AgentDEssai::class, fn () => new AgentFinDEssai($fins));

        return app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'Villa à Ngor', [AiDataClass::Publique], actor: $this->operateur));
    }

    /** @return list<array{0: string, 1: AiCallOutcome, 2: ?string, 3: ?string}> */
    private function journal(): array
    {
        return AiCall::query()->orderBy('id')->get()
            ->map(fn (AiCall $c) => [$c->model, $c->outcome, $c->stop_reason, $c->error_code])->all();
    }

    public function test_une_reponse_complete_garde_sa_raison_de_fin(): void
    {
        $this->lancer([]);

        $this->assertSame([['modele-a', AiCallOutcome::Success, 'stop', null]], $this->journal());
    }

    public function test_une_reponse_tronquee_bascule_sur_le_maillon_suivant(): void
    {
        $resultat = $this->lancer(['modele-a' => FinishReason::Length]);

        $this->assertSame([
            ['modele-a', AiCallOutcome::FailedOver, 'length', 'ai.response_truncated'],
            ['modele-b', AiCallOutcome::Success, 'stop', null],
        ], $this->journal());
        $this->assertSame('modele-b', $resultat->call->model);
    }

    public function test_une_reponse_filtree_bascule_aussi(): void
    {
        $this->lancer(['modele-a' => FinishReason::ContentFilter]);

        $this->assertSame(['content_filter', 'ai.response_filtered'], [$this->journal()[0][2], $this->journal()[0][3]]);
    }

    public function test_les_jetons_d_une_reponse_tronquee_sont_comptes(): void
    {
        // Elle a été payée : le budget doit la voir.
        $this->lancer(['modele-a' => FinishReason::Length]);

        $tronquee = AiCall::query()->where('model', 'modele-a')->firstOrFail();
        $this->assertSame([1000, 200], [$tronquee->input_tokens, $tronquee->output_tokens]);
        $this->assertGreaterThan(0, (float) $tronquee->cost_estimate);
    }

    public function test_quand_chaque_maillon_tronque_la_passerelle_est_indisponible_avec_la_cause(): void
    {
        try {
            $this->lancer(['modele-a' => FinishReason::Length, 'modele-b' => FinishReason::Length]);
            $this->fail('la passerelle devait être indisponible');
        } catch (AiUnavailable $e) {
            $this->assertSame('ai.providers_unavailable', $e->getMessage());
            $this->assertSame('ai.response_truncated', $e->getPrevious()?->getMessage());
        }
        $this->assertSame([AiCallOutcome::FailedOver, AiCallOutcome::FailedOver], array_column($this->journal(), 1));
    }

    public function test_une_reponse_tronquee_n_entre_pas_dans_le_cache(): void
    {
        // L'usage d'essai est public et cache une heure : une sortie inexploitable n'y entre jamais.
        try {
            $this->lancer(['modele-a' => FinishReason::Length, 'modele-b' => FinishReason::Length]);
        } catch (AiUnavailable) {
        }

        $this->lancer([]);

        $this->assertSame(AiCallOutcome::Success, AiCall::query()->latest('id')->firstOrFail()->outcome);
    }
}
