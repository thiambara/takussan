<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Profiles\SousLeProfil;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2847 (ADR-0116) — `GET /api/me/locate` : l'espace de l'appelant sous lequel une fiche se lit,
 * jugé par la policy de la fiche sous chaque profil actif ; sinon le même 404 qu'un id inexistant.
 */
class LocateAcrossProfilesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $dakar;

    private Agency $thies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = Agency::factory()->create(['name' => 'Dakar Immo']);
        $this->thies = Agency::factory()->create(['name' => 'Thiès Properties']);
    }

    /** @return array{0: User, 1: AgentProfile, 2: AgentProfile} */
    private function agentDesDeuxAgences(): array
    {
        $user = User::factory()->create();
        $aDakar = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $aThies = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->thies->id]);

        return [$user, $aDakar, $aThies];
    }

    private function locate(User $user, string $type, int|string $id, ?string $actif = null)
    {
        Sanctum::actingAs($user);

        return $this->withHeaders($actif !== null ? ['X-Profile-Id' => $actif] : [])
            ->getJson("/api/me/locate?type={$type}&id={$id}");
    }

    public function test_ac1_une_fiche_de_thies_ouverte_depuis_dakar_nomme_thies_et_son_profil(): void
    {
        [$user, $aDakar, $aThies] = $this->agentDesDeuxAgences();
        $bien = Property::factory()->create(['agency_id' => $this->thies->id, 'title' => 'Villa secrète']);

        $reponse = $this->locate($user, 'bien', $bien->id, "agent:{$aDakar->id}")->assertOk();

        $this->assertSame([
            'profile_id' => "agent:{$aThies->id}",
            'agency' => ['id' => $this->thies->id, 'name' => 'Thiès Properties'],
            'role' => 'agent',
        ], $reponse->json('data'));
        // Jamais une donnée de la fiche.
        $this->assertStringNotContainsString('Villa secrète', $reponse->getContent());
    }

    public function test_ac1_sans_profil_a_thies_le_meme_404_qu_un_id_inexistant(): void
    {
        $user = User::factory()->create();
        $aDakar = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $bien = Property::factory()->create(['agency_id' => $this->thies->id]);
        $inexistant = (int) Property::query()->max('id') + 1000;

        $illisible = $this->locate($user, 'bien', $bien->id, "agent:{$aDakar->id}")->assertNotFound();
        $absent = $this->locate($user, 'bien', $inexistant, "agent:{$aDakar->id}")->assertNotFound();

        $this->assertSame($absent->getContent(), $illisible->getContent());
    }

    public function test_une_fiche_en_corbeille_rend_le_meme_404(): void
    {
        [$user] = $this->agentDesDeuxAgences();
        $bien = Property::factory()->create(['agency_id' => $this->thies->id]);
        $inexistant = (int) Property::query()->max('id') + 1000;
        $bien->delete();

        $corbeille = $this->locate($user, 'bien', $bien->id)->assertNotFound();
        $absent = $this->locate($user, 'bien', $inexistant)->assertNotFound();

        $this->assertSame($absent->getContent(), $corbeille->getContent());
    }

    public function test_ac2_le_profil_de_thies_suspendu_rend_404(): void
    {
        [$user, $aDakar, $aThies] = $this->agentDesDeuxAgences();
        $aThies->update(['status' => AgentProfileStatus::Suspended->value]);
        $bien = Property::factory()->create(['agency_id' => $this->thies->id]);

        $this->locate($user, 'bien', $bien->id, "agent:{$aDakar->id}")->assertNotFound();
    }

    public function test_aucun_profil_rend_404(): void
    {
        $user = User::factory()->create();
        $bien = Property::factory()->create(['agency_id' => $this->thies->id]);

        $this->locate($user, 'bien', $bien->id)->assertNotFound();
    }

    /**
     * Un profil ACTIF dans l'agence de la fiche ne suffit pas : c'est la policy qui juge. Le bailleur
     * de Thiès ne lit pas le bien d'un autre bailleur de Thiès.
     */
    public function test_un_profil_dans_l_agence_qui_ne_lit_pas_la_fiche_ne_la_nomme_pas(): void
    {
        $user = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->thies->id]);
        $autre = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $autre->id, 'agency_id' => $this->thies->id]);
        $bien = Property::factory()->create(['agency_id' => $this->thies->id, 'user_id' => $autre->id]);
        $sien = Property::factory()->create(['agency_id' => $this->thies->id, 'user_id' => $user->id]);

        $this->locate($user, 'bien', $bien->id)->assertNotFound();
        $this->locate($user, 'bien', $sien->id)->assertOk()->assertJsonPath('data.role', 'owner');
    }

    /**
     * AC4 — la policy, et non une comparaison d'agences, garde la réponse : une policy qui dit oui à
     * tout fait nommer l'espace de Dakar pour une fiche de Thiès à qui n'a aucun profil à Thiès.
     * (Le même test, policy réelle, est `test_ac1_sans_profil_a_thies_…` : 404.)
     */
    public function test_ac4_c_est_la_policy_qui_garde_la_reponse(): void
    {
        $user = User::factory()->create();
        $aDakar = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $bien = Property::factory()->create(['agency_id' => $this->thies->id]);

        Gate::policy(Property::class, PolitiqueQuiDitOui::class);

        $this->locate($user, 'bien', $bien->id, "agent:{$aDakar->id}")
            ->assertOk()
            ->assertJsonPath('data.profile_id', "agent:{$aDakar->id}");
    }

    public function test_le_profil_actif_est_rendu_quand_il_lit_deja_la_fiche(): void
    {
        [$user, $aDakar] = $this->agentDesDeuxAgences();
        $bien = Property::factory()->create(['agency_id' => $this->dakar->id]);

        $this->locate($user, 'bien', $bien->id, "agent:{$aDakar->id}")
            ->assertOk()
            ->assertJsonPath('data.profile_id', "agent:{$aDakar->id}");
    }

    /** `SousLeProfil` rend l'attribut tel qu'il était : présent, absent, et même sur une exception. */
    public function test_le_profil_actif_de_la_requete_est_rendu_intact(): void
    {
        [, $aDakar, $aThies] = $this->agentDesDeuxAgences();
        $attributs = request()->attributes;

        $attributs->set('active_profile', $aDakar);
        $vu = SousLeProfil::juger($aThies, fn () => request()->activeProfile());
        $this->assertSame($aThies, $vu);
        $this->assertSame($aDakar, request()->activeProfile());

        $attributs->remove('active_profile');
        try {
            SousLeProfil::juger($aThies, fn () => throw new \RuntimeException('policy'));
        } catch (\RuntimeException) {
        }
        $this->assertFalse($attributs->has('active_profile'));
    }

    public function test_le_super_admin_n_a_rien_a_localiser(): void
    {
        [$user] = $this->agentDesDeuxAgences();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $user->id]);
        $bien = Property::factory()->create(['agency_id' => $this->thies->id]);

        $this->locate($user, 'bien', $bien->id)->assertNotFound();
    }

    /** @return array<string, array{0: string, 1: Closure(Agency): Model}> */
    public static function lesHuitTypes(): array
    {
        $bien = fn (Agency $a) => Property::factory()->create(['agency_id' => $a->id]);

        return [
            'bien' => ['bien', $bien],
            'demande' => ['demande', fn (Agency $a) => PropertyContactLead::factory()->create(['property_id' => $bien($a)->id, 'agency_id' => $a->id])],
            'client' => ['client', fn (Agency $a) => Customer::factory()->create(['agency_id' => $a->id])],
            'bail' => ['bail', fn (Agency $a) => Lease::factory()->create(['property_id' => $bien($a)->id, 'agency_id' => $a->id])],
            'intervention' => ['intervention', fn (Agency $a) => MaintenanceRequest::factory()->create(['property_id' => $bien($a)->id])],
            'visite' => ['visite', fn (Agency $a) => PropertyVisit::factory()->create(['property_id' => $bien($a)->id])],
            'reservation' => ['reservation', fn (Agency $a) => Booking::factory()->create(['property_id' => $bien($a)->id, 'agency_id' => $a->id])],
            'bailleur' => ['bailleur', fn (Agency $a) => OwnerProfile::factory()->create(['agency_id' => $a->id])],
        ];
    }

    /**
     * Chaque type se résout vers le bon modèle et sa policy : l'agent de Thiès est nommé, celui de
     * Dakar seul reçoit 404.
     */
    #[DataProvider('lesHuitTypes')]
    public function test_chaque_type_nomme_l_agence_de_la_fiche(string $type, Closure $fabrique): void
    {
        [$user, $aDakar, $aThies] = $this->agentDesDeuxAgences();
        $seulADakar = User::factory()->create();
        $sonProfil = AgentProfile::factory()->create(['user_id' => $seulADakar->id, 'agency_id' => $this->dakar->id]);
        $fiche = $fabrique($this->thies);

        $this->locate($user, $type, $fiche->getKey(), "agent:{$aDakar->id}")
            ->assertOk()
            ->assertJsonPath('data.profile_id', "agent:{$aThies->id}");
        $this->locate($seulADakar, $type, $fiche->getKey(), "agent:{$sonProfil->id}")->assertNotFound();
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function entreesInvalides(): array
    {
        return [
            'type inconnu' => [['type' => 'agence', 'id' => '1']],
            'type en liste' => [['type' => ['bien'], 'id' => '1']],
            'id en liste' => [['type' => 'bien', 'id' => ['1']]],
            'id hors bigint' => [['type' => 'bien', 'id' => str_repeat('9', 30)]],
            'id négatif' => [['type' => 'bien', 'id' => '-3']],
            'id absent' => [['type' => 'bien']],
        ];
    }

    /** @param  array<string, mixed>  $query */
    #[DataProvider('entreesInvalides')]
    public function test_une_entree_hors_bornes_rend_422(array $query): void
    {
        [$user] = $this->agentDesDeuxAgences();
        Sanctum::actingAs($user);

        $this->getJson('/api/me/locate?'.http_build_query($query))->assertStatus(422);
    }
}

/** AC4 — une policy de bien qui dit oui à tout, pour montrer que c'est elle qui garde. */
class PolitiqueQuiDitOui
{
    public function view(): bool
    {
        return true;
    }
}
