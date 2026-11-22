<?php

namespace Tests\Feature\Directory;

use App\Models\Activity;
use App\Models\Address;
use App\Models\Agency;
use App\Models\AgencySpotlight;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\GeoCity;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-2520 (ADR-0092) — la place « Mise en avant » de l'annuaire des agences : une par ville et par
 * instant (la requête ET la base le refusent), émise à côté de la liste sans changer le rang, jamais
 * pour une agence que l'annuaire refuse.
 */
class AgencySpotlightTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $dakar;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
    }

    private function agence(string $nom, int $biens, string $ville = 'Dakar', array $attributs = []): Agency
    {
        $agence = Agency::factory()->create(['name' => $nom, 'status' => AgencyStatus::Active, ...$attributs]);
        for ($i = 0; $i < $biens; $i++) {
            $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);
            Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => $ville]);
        }

        return $agence;
    }

    private function offrir(Agency $agence, ?int $ville, string $debut, string $fin): TestResponse
    {
        return $this->postJson('/api/admin/agency-spotlights', [
            'agency_id' => $agence->id,
            'geo_city_id' => $ville,
            'starts_at' => $debut,
            'ends_at' => $fin,
            'note' => 'Lancement de l’annuaire',
        ]);
    }

    public function test_seul_le_super_admin_offre_et_l_offre_est_journalisee(): void
    {
        $agence = $this->agence('Teranga', 1);
        $this->actingAsRole('agency_admin', ['agency' => $agence]);
        $this->offrir($agence, $this->dakar->id, now()->toIso8601String(), now()->addDays(7)->toIso8601String())->assertForbidden();
        $this->getJson('/api/admin/agency-spotlights')->assertForbidden();

        $this->actingAsRole('super_admin');
        $id = $this->offrir($agence, $this->dakar->id, now()->toIso8601String(), now()->addDays(7)->toIso8601String())
            ->assertCreated()
            ->assertJsonPath('data.agency.name', 'Teranga')
            ->assertJsonPath('data.city.name', 'Dakar')
            ->json('data.id');

        $this->getJson('/api/admin/agency-spotlights?filter[when]=current')->assertOk()->assertJsonPath('data.0.id', $id);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_agency_spotlight_granted')->exists());

        $this->deleteJson("/api/admin/agency-spotlights/{$id}")->assertOk();
        $this->assertFalse(AgencySpotlight::query()->whereKey($id)->exists());
        // Pour le super-admin, un identifiant inconnu reste un 404 (la ligne se cherche après la garde).
        $this->deleteJson("/api/admin/agency-spotlights/{$id}")->assertNotFound();
        $this->assertTrue(Activity::query()->where('event', 'super_admin_agency_spotlight_revoked')->exists());
    }

    /** AC1 — deux places qui se chevauchent sur Dakar : la seconde est refusée (422), la base n'en garde qu'une. */
    public function test_ac1_deux_places_qui_se_chevauchent_sur_dakar_la_seconde_est_refusee(): void
    {
        $a = $this->agence('A', 1);
        $b = $this->agence('B', 1);
        $this->actingAsRole('super_admin');

        $this->offrir($a, $this->dakar->id, '2026-12-01T00:00:00Z', '2026-12-15T00:00:00Z')->assertCreated();
        $this->offrir($b, $this->dakar->id, '2026-12-14T00:00:00Z', '2026-12-20T00:00:00Z')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('starts_at');

        $this->assertSame(1, AgencySpotlight::query()->where('geo_city_id', $this->dakar->id)->count());

        // Bord exclu : une place qui commence à la fin de la précédente ne la chevauche pas ; une autre ville non plus.
        $this->offrir($b, $this->dakar->id, '2026-12-15T00:00:00Z', '2026-12-20T00:00:00Z')->assertCreated();
        $this->offrir($b, GeoCity::factory()->create()->id, '2026-12-01T00:00:00Z', '2026-12-15T00:00:00Z')->assertCreated();
        // L'annuaire sans ville a ses places, et elles se gardent entre elles.
        $this->offrir($a, null, '2026-12-01T00:00:00Z', '2026-12-15T00:00:00Z')->assertCreated();
        $this->offrir($b, null, '2026-12-10T00:00:00Z', '2026-12-12T00:00:00Z')->assertUnprocessable();
    }

    /** AC1, côté base — une écriture qui contourne la requête se heurte à la contrainte d'exclusion. */
    public function test_ac1_la_base_refuse_le_chevauchement_meme_sans_passer_par_l_api(): void
    {
        $a = $this->agence('A', 1);
        $b = $this->agence('B', 1);
        $ligne = fn (Agency $agence, ?int $ville) => ['agency_id' => $agence->id, 'geo_city_id' => $ville, 'starts_at' => '2026-12-01 00:00:00', 'ends_at' => '2026-12-15 00:00:00'];

        AgencySpotlight::query()->create($ligne($a, $this->dakar->id));
        AgencySpotlight::query()->create($ligne($a, null));

        foreach ([$this->dakar->id, null] as $ville) {
            try {
                DB::transaction(fn () => AgencySpotlight::query()->create($ligne($b, $ville)));
                $this->fail('la base a accepté deux places qui se chevauchent pour la ville '.var_export($ville, true));
            } catch (QueryException $e) {
                $this->assertSame('23P01', $e->getCode());
            }
        }
        $this->assertSame(2, AgencySpotlight::query()->count());
    }

    /** AC2 — l'agence mise en avant est dans `spotlight` ET à son rang dans `data`, le même que sans la place. */
    public function test_ac2_l_agence_mise_en_avant_garde_son_rang(): void
    {
        $this->agence('Grande', 3);
        $petite = $this->agence('Petite', 1);
        $this->agence('Moyenne', 2);

        $sans = array_column($this->getJson('/api/public/agencies?filter[city]=Dakar')->assertOk()
            ->assertJsonPath('spotlight', null)->json('data'), 'id');

        AgencySpotlight::query()->create(['agency_id' => $petite->id, 'geo_city_id' => $this->dakar->id, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);

        $avec = $this->getJson('/api/public/agencies?filter[city]=Dakar')->assertOk()
            ->assertJsonPath('spotlight.id', $petite->id)
            ->assertJsonPath('spotlight.name', 'Petite')
            ->assertJsonStructure(['spotlight' => ['cover', 'portfolio_count', 'reviews', 'leases_signed_this_month', 'median_response_minutes']]);

        $this->assertSame($sans, array_column($avec->json('data'), 'id'));
        $this->assertSame(2, array_search($petite->id, array_column($avec->json('data'), 'id'), true), 'dernière, par nombre de biens');

        // Une place d'une autre ville, ou passée, n'est pas émise ; l'annuaire sans ville a la sienne.
        $this->getJson('/api/public/agencies')->assertOk()->assertJsonPath('spotlight', null);
    }

    /** AC3 — suspendre l'agence la retire de `spotlight` à la requête suivante, sans écriture sur la place. */
    public function test_ac3_une_agence_suspendue_n_est_jamais_emise_et_sa_place_reste_intacte(): void
    {
        $agence = $this->agence('Teranga', 1);
        $place = AgencySpotlight::query()->create(['agency_id' => $agence->id, 'geo_city_id' => $this->dakar->id, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        $this->getJson('/api/public/agencies?filter[city]=Dakar')->assertJsonPath('spotlight.id', $agence->id);
        $avant = $place->fresh()->only(['agency_id', 'geo_city_id', 'starts_at', 'ends_at', 'updated_at']);

        $agence->forceFill(['status' => AgencyStatus::Suspended])->save();

        $this->getJson('/api/public/agencies?filter[city]=Dakar')->assertOk()->assertJsonPath('spotlight', null);
        $this->assertEquals($avant, $place->fresh()->only(['agency_id', 'geo_city_id', 'starts_at', 'ends_at', 'updated_at']));

        $agence->forceFill(['status' => AgencyStatus::Inactive])->save();
        $this->getJson('/api/public/agencies?filter[city]=Dakar')->assertJsonPath('spotlight', null);
    }

    /** Revue — la vitrine de Dakar passe le filtre de `data` POUR DAKAR : une agence tout à Thiès n'y est pas. */
    public function test_une_agence_sans_bien_public_dans_la_ville_n_a_pas_la_vitrine_de_cette_ville(): void
    {
        $ici = $this->agence('Ici', 1);
        $ailleurs = $this->agence('Ailleurs', 2, 'Thiès');
        AgencySpotlight::query()->create(['agency_id' => $ailleurs->id, 'geo_city_id' => $this->dakar->id, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);

        $reponse = $this->getJson('/api/public/agencies?filter[city]=Dakar')->assertOk();

        $this->assertSame([$ici->id], array_column($reponse->json('data'), 'id'));
        $this->assertNull($reponse->json('spotlight'));
    }

    /** Revue — le statut ne suffit pas : un espace `individual` ou une agence sans bien public n'a jamais la vitrine. */
    public function test_un_espace_individuel_ou_une_agence_sans_bien_public_n_a_jamais_la_vitrine(): void
    {
        $individuel = $this->agence('Solo', 1, attributs: ['kind' => AgencyKind::Individual]);
        AgencySpotlight::query()->create(['agency_id' => $individuel->id, 'geo_city_id' => $this->dakar->id, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        $this->getJson('/api/public/agencies?filter[city]=Dakar')->assertOk()->assertJsonPath('spotlight', null);

        $vide = $this->agence('Vide', 0);
        AgencySpotlight::query()->create(['agency_id' => $vide->id, 'geo_city_id' => null, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        $this->getJson('/api/public/agencies')->assertOk()->assertJsonPath('spotlight', null);
    }

    /** Revue — une période envoyée avec un décalage est rangée en UTC, et comparée en temps réel. */
    public function test_une_periode_avec_decalage_horaire_est_rangee_en_utc(): void
    {
        $a = $this->agence('A', 1);
        $b = $this->agence('B', 1);
        $this->actingAsRole('super_admin');

        $this->offrir($a, null, '2026-12-01T00:00:00+02:00', '2026-12-02T00:00:00+02:00')->assertCreated();
        $this->assertSame(
            ['2026-11-30 22:00:00', '2026-12-01 22:00:00'],
            array_values((array) DB::table('agency_spotlights')->first(['starts_at', 'ends_at'])),
        );

        // [01/12 23:00 Z, 02/12 01:00 Z) ne chevauche pas [30/11 22:00 Z, 01/12 22:00 Z) en temps réel.
        $this->offrir($b, null, '2026-12-01T23:00:00Z', '2026-12-02T01:00:00Z')->assertCreated();
    }

    /** Revue — le message de chevauchement est neutre : juste aussi quand la place prise est celle de la MÊME agence. */
    public function test_le_message_de_chevauchement_est_juste_pour_un_doublon_de_la_meme_agence(): void
    {
        $a = $this->agence('A', 1);
        $this->actingAsRole('super_admin');
        $this->offrir($a, $this->dakar->id, '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z')->assertCreated();

        foreach (['fr' => 'Une place est déjà réservée pour cette ville sur cette période.', 'en' => 'A spot is already booked for this city during this period.'] as $langue => $message) {
            $this->withHeader('Accept-Language', $langue)
                ->offrir($a, $this->dakar->id, '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z')
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['starts_at' => $message]);
        }
    }

    public function test_une_ville_inconnue_n_a_pas_de_vitrine(): void
    {
        $agence = $this->agence('Teranga', 1);
        AgencySpotlight::query()->create(['agency_id' => $agence->id, 'geo_city_id' => null, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);

        $this->getJson('/api/public/agencies')->assertJsonPath('spotlight.id', $agence->id);
        $this->getJson('/api/public/agencies?filter[city]=Atlantis')->assertOk()->assertJsonPath('spotlight', null);
    }

    public function test_sans_second_facteur_recent_ni_offre_ni_retrait(): void
    {
        $agence = $this->agence('Teranga', 1);
        $place = AgencySpotlight::query()->create(['agency_id' => $agence->id, 'geo_city_id' => $this->dakar->id, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay()]);
        $perime = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP']);
        $this->materializeRoleProfile($perime, 'super_admin');
        $this->actingAs($perime);

        $this->offrir($agence, null, now()->toIso8601String(), now()->addDay()->toIso8601String())
            ->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->deleteJson("/api/admin/agency-spotlights/{$place->id}")
            ->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');

        $this->assertSame(1, AgencySpotlight::query()->count());
    }
}
