<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Crm\ContactLeadResponseStatsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2865 — AC2 : `team-performance` porte, par agent, `median_response_minutes` — la médiane du délai de première
 * réponse aux demandes du formulaire déposées dans le mois (la mesure de `contact-leads/response-stats`), `null`
 * sous {@see ContactLeadResponseStatsService::TEAM_MIN_SAMPLE} réponses — et la réponse porte `totals`.
 */
class TeamPerformanceResponseTimeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
    }

    /** Une demande du formulaire déposée le `$le`, à laquelle `$par` a répondu `$apres` minutes plus tard. */
    private function demande(User $par, string $le, int $apres, ?Property $property = null): void
    {
        $lead = PropertyContactLead::factory()->create(['property_id' => ($property ?? $this->property)->id]);
        PropertyContactLead::query()->whereKey($lead->id)->toBase()->update([
            'created_at' => Carbon::parse($le),
            'first_responded_at' => Carbon::parse($le)->addMinutes($apres),
            'first_responded_by_id' => $par->id,
            'first_response_channel' => 'whatsapp',
        ]);
    }

    /** @return array<string, mixed> */
    private function lire(string $period = '2026-11'): array
    {
        return $this->getJson("/api/agencies/{$this->agency->id}/team-performance?period={$period}")->assertOk()->json('data');
    }

    public function test_ac2_median_of_42_minutes_null_under_threshold_and_totals(): void
    {
        $rapide = $this->agencyAgent($this->agency);
        $rare = $this->agencyAgent($this->agency);
        $agents = [$rapide, $rare, $this->agencyAgent($this->agency), $this->agencyAgent($this->agency), $this->agencyAgent($this->agency)];

        // Cinq réponses en novembre : 10, 30, 42, 50, 600 minutes → médiane 42 (une réponse lente ne la tire pas).
        foreach ([10, 30, 42, 50, 600] as $i => $minutes) {
            $this->demande($rapide, '2026-11-0'.($i + 2).' 09:00:00', $minutes);
        }
        // Hors du mois : une réponse d'octobre ne compte pas dans novembre.
        $this->demande($rapide, '2026-10-15 09:00:00', 5000);
        // Hors de l'agence : une autre agence ne compte jamais.
        $ailleurs = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->demande($rapide, '2026-11-03 09:00:00', 9000, $ailleurs);
        // Sous le seuil : quatre réponses seulement.
        foreach ([1, 2, 3, 4] as $i) {
            $this->demande($rare, "2026-11-1{$i} 09:00:00", 5);
        }

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $data = $this->lire();
        $lignes = collect($data['agents'])->keyBy('user_id');

        $this->assertSame(42, $lignes[$rapide->id]['median_response_minutes']);
        $this->assertNull($lignes[$rare->id]['median_response_minutes']);
        $this->assertSame(5, $data['totals']['agents']);
        $this->assertCount(count($agents), $data['agents']);
        // L'équipe : une médiane sur les neuf demandes de l'agence (5, 5, 5, 5, 10, 30, 42, 50, 600) → 10, jamais la
        // médiane des médianes.
        $this->assertSame(10, $data['totals']['median_response_minutes']);
        foreach (['leases_signed', 'visits_completed', 'leads_handled', 'commissions_earned', 'properties_managed'] as $colonne) {
            $this->assertArrayHasKey($colonne, $data['totals']);
        }

        // Octobre : une seule réponse, sous le seuil → `null`, pour l'agent comme pour l'équipe.
        $octobre = $this->lire('2026-10');
        $this->assertNull(collect($octobre['agents'])->firstWhere('user_id', $rapide->id)['median_response_minutes']);
        $this->assertNull($octobre['totals']['median_response_minutes']);
    }

    public function test_totals_sum_the_count_columns(): void
    {
        $a = $this->agencyAgent($this->agency);
        $b = $this->agencyAgent($this->agency);
        foreach ([$a, $a, $b] as $qui) {
            PropertyContactLead::factory()->create([
                'property_id' => $this->property->id, 'handled_by_id' => $qui->id, 'handled_at' => '2026-11-05 10:00:00',
            ]);
        }

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $data = $this->lire();

        $this->assertSame(2, $data['totals']['agents']);
        $this->assertSame(3, $data['totals']['leads_handled']);
    }

    /** `period` reste un mois `Y-m` : `last_12_months` rend 422, jamais un mois substitué. */
    public function test_last_12_months_is_refused_explicitly(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->getJson("/api/agencies/{$this->agency->id}/team-performance?period=last_12_months")->assertStatus(422);
    }
}
