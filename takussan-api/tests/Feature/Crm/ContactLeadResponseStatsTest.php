<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\Enums\ContactLeadChannel;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2583 (ADR-0103 § 7) — le délai médian de première réponse, de l'agence et par agent, et les
 * demandes ouvertes depuis plus de 24 h ; réservé au personnel qui détient `crm.view_all`.
 */
class ContactLeadResponseStatsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 12:00:00'));

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->agent = $this->personnel($this->agence);
    }

    /** Une demande du formulaire déposée il y a `$ilYa` heures, répondue `$apres` heures plus tard par `$par`. */
    private function demande(Agency $agence, float $ilYa, ?float $apres = null, ?User $par = null, array $attributs = []): PropertyContactLead
    {
        $recue = now()->subMinutes((int) round($ilYa * 60));
        $lead = PropertyContactLead::factory()->create($attributs + [
            'property_id' => $this->bienDe($agence)->id,
            'agency_id' => $agence->id,
            'recipient_user_id' => $par?->id ?? $this->agent->id,
        ]);
        $lead->forceFill(['created_at' => $recue])->saveQuietly();

        if ($apres !== null) {
            PropertyContactLead::query()->whereKey($lead->id)->toBase()->update([
                'first_responded_at' => $recue->copy()->addMinutes((int) round($apres * 60)),
                'first_responded_by_id' => ($par ?? $this->agent)->id,
                'first_response_channel' => 'whatsapp',
            ]);
        }

        return $lead;
    }

    /** @return array<string, mixed> */
    private function agentDans(array $agents, int $userId): array
    {
        $ligne = collect($agents)->firstWhere('user.id', $userId);
        $this->assertNotNull($ligne, "l'agent {$userId} devrait figurer dans les statistiques");

        return $ligne;
    }

    /** AC4 — 1 h, 3 h, 10 h : médiane 3 h (10 800 s) ; une demande ouverte depuis 30 h compte dans « > 24 h ». */
    public function test_ac4_mediane_sur_un_jeu_connu_et_ouvertes_depuis_plus_de_24_h(): void
    {
        $this->demande($this->agence, 48, 1);
        $this->demande($this->agence, 72, 3);
        $this->demande($this->agence, 96, 10);
        $this->demande($this->agence, 30);           // ouverte depuis 30 h : compte
        $this->demande($this->agence, 10);           // ouverte depuis 10 h : trop jeune
        $traitee = $this->demande($this->agence, 40); // traitée sans geste : ne compte pas
        $traitee->update(['handled_at' => now()->subHours(20)]);
        // Un clic WhatsApp n'est pas une demande : ni médiane ni « > 24 h ».
        $this->demande($this->agence, 50, 40, null, ['channel' => ContactLeadChannel::Whatsapp]);
        $this->demande($this->agence, 50, null, null, ['channel' => ContactLeadChannel::Call]);

        Sanctum::actingAs($this->admin);
        $data = $this->getJson('/api/contact-leads/response-stats?period=30')->assertOk()->json('data');

        $this->assertSame(30, $data['period_days']);
        $this->assertSame(10800, $data['agency']['median_first_response_seconds']);
        $this->assertSame(3, $data['agency']['responded_count']);
        $this->assertSame(1, $data['agency']['open_over_24h_count']);

        $agent = $this->agentDans($data['agents'], $this->agent->id);
        $this->assertSame(10800, $agent['median_first_response_seconds']);
        $this->assertSame(3, $agent['responded_count']);
        $this->assertSame(1, $agent['open_over_24h_count']);
        $this->assertSame(['id', 'first_name', 'last_name'], array_keys($agent['user']));
    }

    public function test_la_periode_borne_la_mediane_et_une_autre_agence_est_exclue(): void
    {
        $this->demande($this->agence, 24 * 2, 2);
        $this->demande($this->agence, 24 * 40, 20);   // hors des 30 jours
        $autre = $this->agence();
        $etranger = $this->personnel($autre);
        $this->demande($autre, 24 * 2, 50, $etranger);
        $this->demande($autre, 60, null, $etranger);

        Sanctum::actingAs($this->admin);
        $data = $this->getJson('/api/contact-leads/response-stats')->assertOk()->json('data');

        $this->assertSame(30, $data['period_days']);
        $this->assertSame(7200, $data['agency']['median_first_response_seconds']);
        $this->assertSame(1, $data['agency']['responded_count']);
        $this->assertSame(0, $data['agency']['open_over_24h_count']);
        $this->assertNull(collect($data['agents'])->firstWhere('user.id', $etranger->id));

        $large = $this->getJson('/api/contact-leads/response-stats?period=60')->assertOk()->json('data');
        $this->assertSame(2, $large['agency']['responded_count']);
        $this->assertSame(39600, $large['agency']['median_first_response_seconds']);
    }

    public function test_sans_reponse_la_mediane_est_nulle(): void
    {
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/contact-leads/response-stats')
            ->assertOk()
            ->assertJsonPath('data.agency.median_first_response_seconds', null)
            ->assertJsonPath('data.agency.responded_count', 0)
            ->assertJsonPath('data.agents', []);
    }

    /** AC5 — sans `crm.view_all` : 403, avant toute validation ; bailleur et client aussi. */
    public function test_ac5_403_sans_crm_view_all(): void
    {
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        $restreint = $this->personnel($this->agence, agencyRole: $role);

        foreach ([$restreint, $this->bailleur($this->agence), $this->client()] as $lecteur) {
            Sanctum::actingAs($lecteur);
            $this->getJson('/api/contact-leads/response-stats')->assertForbidden();
            $this->getJson('/api/contact-leads/response-stats?period=abc')->assertForbidden();
        }

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/contact-leads/response-stats?period=abc')->assertStatus(422);
        $this->getJson('/api/contact-leads/response-stats?period=0')->assertStatus(422);
    }
}
