<?php

namespace Tests\Feature\Ai;

use App\Models\AiCall;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2383 (AC5) — aucune donnée `sensible` ne quitte la passerelle, quel que soit l'usage. */
class AiSensitiveDataTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    /** @return array<string, array{list<AiDataClass>, AiRefusalReason}> */
    public static function charges(): array
    {
        return [
            'sensible seule' => [[AiDataClass::Sensible], AiRefusalReason::SensitiveData],
            'sensible parmi d\'autres' => [[AiDataClass::Publique, AiDataClass::Sensible], AiRefusalReason::SensitiveData],
            'personnelle sur un usage publique' => [[AiDataClass::Personnelle], AiRefusalReason::DataClass],
        ];
    }

    #[DataProvider('charges')]
    public function test_the_charge_is_refused_before_the_provider(array $classes, AiRefusalReason $motif): void
    {
        $this->installerSocleDEssai();
        $operateur = $this->actingAsRole('super_admin');
        AgentDEssai::fake();

        try {
            app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'pièce n° 1 234 567', $classes, actor: $operateur));
            $this->fail('la charge devait être refusée');
        } catch (AiRefused $refus) {
            $this->assertSame($motif, $refus->reason);
        }

        AgentDEssai::assertNeverPrompted();
        $this->assertSame($motif, AiCall::query()->sole()->refusal_reason);
    }
}
