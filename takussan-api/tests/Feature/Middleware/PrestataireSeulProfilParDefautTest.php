<?php

namespace Tests\Feature\Middleware;

use App\Models\Agency;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2800 — un compte dont le SEUL profil actif n'a pas d'agence (prestataire) le voit lié sans cookie ni
 * signal : la connexion efface le cookie, et l'auto-bascule mono-agence ne comptait aucune agence pour lui.
 * Les gardes d'agence ne bougent pas : aucune agence n'est ouverte, plusieurs agences ne lient toujours rien.
 */
class PrestataireSeulProfilParDefautTest extends TestCase
{
    use RefreshDatabase;

    private const SONDE = '/api/__test/tck-2800-profil-lie';

    protected function setUp(): void
    {
        parent::setUp();

        Route::prefix('api')
            ->middleware(['api', 'auth:sanctum'])
            ->get('/__test/tck-2800-profil-lie', function () {
                $profil = request()->activeProfile();

                return response()->json([
                    'classe' => $profil ? $profil::class : null,
                    'id' => $profil?->getKey(),
                    'agency_id' => request()->user()->agency_id,
                ]);
            });
    }

    public function test_un_prestataire_seul_est_lie_sans_ouvrir_d_agence(): void
    {
        $sp = ServiceProviderProfile::factory()->create();
        Sanctum::actingAs($sp->user);

        $this->getJson(self::SONDE)
            ->assertOk()
            ->assertJsonPath('classe', ServiceProviderProfile::class)
            ->assertJsonPath('id', $sp->id)
            ->assertJsonPath('agency_id', null);

        $this->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('meta.active_profile_id', "service_provider:{$sp->id}");
    }

    public function test_un_prestataire_seul_suspendu_n_est_pas_lie(): void
    {
        $sp = ServiceProviderProfile::factory()->create(['status' => ServiceProviderProfileStatus::Suspended->value]);
        Sanctum::actingAs($sp->user);

        $this->getJson(self::SONDE)
            ->assertOk()
            ->assertJsonPath('classe', null)
            ->assertJsonPath('agency_id', null);
    }

    public function test_un_prestataire_de_deux_agences_n_est_pas_lie(): void
    {
        $sp = ServiceProviderProfile::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $sp->user_id, 'agency_id' => Agency::factory()->create()->id]);
        AgentProfile::factory()->create(['user_id' => $sp->user_id, 'agency_id' => Agency::factory()->create()->id]);
        Sanctum::actingAs($sp->user);

        $this->getJson(self::SONDE)
            ->assertOk()
            ->assertJsonPath('classe', null)
            ->assertJsonPath('agency_id', null);
    }

    public function test_un_prestataire_d_une_agence_garde_le_profil_d_agence(): void
    {
        $agence = Agency::factory()->create();
        $sp = ServiceProviderProfile::factory()->create();
        $bailleur = OwnerProfile::factory()->create(['user_id' => $sp->user_id, 'agency_id' => $agence->id]);
        Sanctum::actingAs($sp->user);

        $this->getJson(self::SONDE)
            ->assertOk()
            ->assertJsonPath('classe', OwnerProfile::class)
            ->assertJsonPath('id', $bailleur->id)
            ->assertJsonPath('agency_id', $agence->id);
    }

    public function test_un_compte_sans_profil_reste_sans_profil(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson(self::SONDE)->assertOk()->assertJsonPath('classe', null);
    }

    public function test_vos_pieces_du_prestataire_seul_sans_cookie(): void
    {
        $sp = ServiceProviderProfile::factory()->create();
        Sanctum::actingAs($sp->user);

        $codes = collect($this->getJson('/api/me/pieces')->assertOk()->json('data'))->pluck('code')->all();

        $this->assertSame(['cni', 'insurance'], $codes);
    }
}
