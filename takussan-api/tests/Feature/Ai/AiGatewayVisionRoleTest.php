<?php

namespace Tests\Feature\Ai;

use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiModelRole;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Exceptions\AiUnavailable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Files\Image;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\Support\Ai\UsageVisionDEssai;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0076 §2) — une requête qui porte des pièces jointes, pour un usage marqué
 * `AttachmentsUseVision`, est servie par la chaîne du rôle `vision` et journalisée sous ce rôle.
 * Sans pièce jointe, ou pour un usage non marqué, rien ne change. Le modèle forcé de l'usage
 * s'applique dans les deux cas.
 */
class AiGatewayVisionRoleTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private User $operateur;

    private string $dossier;

    /** @var list<string> */
    private array $modeles = [];

    /** @var list<int> */
    private array $piecesRecues = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
        ]);
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry([UsageDEssai::class, UsageVisionDEssai::class]));
        $this->operateur = $this->actingAsRole('super_admin');
        $this->dossier = storage_path('framework/testing/ai-vision-'.Str::random(8));
        File::ensureDirectoryExists($this->dossier);
        File::put($this->dossier.'/capture.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));

        AgentDEssai::fake(function (string $prompt, Collection $attachments, $provider, string $model) {
            $this->modeles[] = $model;
            $this->piecesRecues[] = $attachments->count();

            return ['titre' => 'Villa', 'prix' => 100];
        });
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->dossier);
        parent::tearDown();
    }

    private function requete(string $usage, bool $avecCapture): AiRequest
    {
        return new AiRequest(
            $usage, 'Villa à Ngor', actor: $this->operateur,
            attachments: $avecCapture ? [Image::fromPath($this->dossier.'/capture.png')] : [],
        );
    }

    public function test_an_attachment_on_a_vision_usage_is_served_by_the_vision_chain_and_journaled_as_vision(): void
    {
        app(AiGateway::class)->run($this->requete(UsageVisionDEssai::KEY, true));

        $this->assertSame(['modele-v'], $this->modeles);
        $this->assertSame([1], $this->piecesRecues);
        $call = AiCall::query()->sole();
        $this->assertSame(AiModelRole::Vision, $call->role);
        $this->assertSame([AiCallOutcome::Success, 'modele-v'], [$call->outcome, $call->model]);
    }

    public function test_without_attachment_the_vision_usage_keeps_its_own_role(): void
    {
        app(AiGateway::class)->run($this->requete(UsageVisionDEssai::KEY, false));

        $this->assertSame(['modele-a'], $this->modeles);
        $this->assertSame(AiModelRole::Extraction, AiCall::query()->sole()->role);
    }

    public function test_an_attachment_on_an_unmarked_usage_keeps_the_usage_role(): void
    {
        app(AiGateway::class)->run($this->requete(UsageDEssai::KEY, true));

        $this->assertSame(['modele-a'], $this->modeles);
        $this->assertSame(AiModelRole::Extraction, AiCall::query()->sole()->role);
    }

    public function test_the_forced_model_of_the_usage_applies_with_attachments_and_keeps_the_vision_ceiling(): void
    {
        AiUsageSetting::query()->create([
            'usage_key' => UsageVisionDEssai::KEY, 'enabled' => true, 'forced_provider' => 'anthropic', 'forced_model' => 'modele-b',
        ]);

        app(AiGateway::class)->run($this->requete(UsageVisionDEssai::KEY, true));
        app(AiGateway::class)->run($this->requete(UsageVisionDEssai::KEY, false));

        $this->assertSame(['modele-b', 'modele-b'], $this->modeles);
        $this->assertSame(
            [AiModelRole::Vision, AiModelRole::Extraction],
            AiCall::query()->orderBy('id')->get()->map(fn (AiCall $c) => $c->role)->all(),
        );
    }

    public function test_an_unassigned_vision_role_does_not_fall_back_on_the_usage_role(): void
    {
        config(['ai.roles.vision' => []]);

        try {
            app(AiGateway::class)->run($this->requete(UsageVisionDEssai::KEY, true));
            $this->fail('la passerelle devait être indisponible');
        } catch (AiUnavailable $e) {
            $this->assertSame('ai.role_unassigned', $e->getMessage());
        }

        $this->assertSame([], $this->modeles);
        $call = AiCall::query()->sole();
        $this->assertSame([AiModelRole::Vision, 'ai.role_unassigned'], [$call->role, $call->error_code]);
    }

    /** Revue M5 — la bascule reste dans la chaîne vision, et chaque maillon tenté est journalisé `vision`. */
    public function test_a_failover_inside_the_vision_chain_journals_every_link_as_vision(): void
    {
        config(['ai.roles.vision' => [
            ['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000],
            ['provider' => 'anthropic', 'model' => 'modele-b', 'max_tokens' => 2000],
        ]]);
        AgentDEssai::fake(function (string $prompt, Collection $attachments, $provider, string $model) {
            $this->modeles[] = $model;
            if ($model === 'modele-v') {
                throw RateLimitedException::forProvider('anthropic');
            }

            return ['titre' => 'Villa', 'prix' => 100];
        });

        app(AiGateway::class)->run($this->requete(UsageVisionDEssai::KEY, true));

        $this->assertSame(['modele-v', 'modele-b'], $this->modeles);
        $this->assertSame(
            [[AiModelRole::Vision, 'modele-v', AiCallOutcome::FailedOver], [AiModelRole::Vision, 'modele-b', AiCallOutcome::Success]],
            AiCall::query()->orderBy('id')->get()->map(fn (AiCall $c) => [$c->role, $c->model, $c->outcome])->all(),
        );
    }
}
