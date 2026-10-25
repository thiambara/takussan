<?php

namespace Tests\Feature\Features;

use App\Models\Agency;
use App\Models\Announcement;
use App\Models\FeatureFlag;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Announcements\AnnouncementResolver;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2006 (P176.05 ; ADR-0005, amendement du 2026-10-23, point 2) — le ciblage des annonces et des
 * drapeaux juge `roles` sur les profils ACTIFS, et `agency_ids` sur TOUTES les agences où le compte a
 * un profil actif, quel que soit le profil actif de la requête.
 *
 * Avant : `roles` croisait `profileTypes()` (suspendus compris), et `agency_ids` lisait
 * `$user->agency_id`, qui ne suit que l'agence active et vaut `null` pour un compte de deux agences
 * sans profil résolu.
 */
class CiblageParRoleEtAgenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_drapeau_cible_admin_n_atteint_pas_un_admin_suspendu(): void
    {
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $user->id]);

        $this->assertFalse(app(FeatureFlagEvaluator::class)->evaluate($this->drapeau(['roles' => ['agency_admin']]), $user));
    }

    public function test_une_annonce_ciblee_admin_n_atteint_pas_un_admin_suspendu(): void
    {
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $user->id]);

        $this->assertFalse(app(AnnouncementResolver::class)->matches($this->annonce(['roles' => ['agency_admin']]), $user));
    }

    public function test_l_admin_actif_reste_atteint(): void
    {
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id]);

        $this->assertTrue(app(FeatureFlagEvaluator::class)->evaluate($this->drapeau(['roles' => ['agency_admin']]), $user));
        $this->assertTrue(app(AnnouncementResolver::class)->matches($this->annonce(['roles' => ['agency_admin']]), $user));
    }

    public function test_un_compte_de_deux_agences_sans_profil_resolu_est_atteint_par_chacune(): void
    {
        [$user, $a, $b] = $this->membreDeDeuxAgences();

        foreach ([$a, $b] as $agency) {
            $this->assertTrue(app(FeatureFlagEvaluator::class)->evaluate($this->drapeau(['agency_ids' => [$agency->id]]), $user));
            $this->assertTrue(app(AnnouncementResolver::class)->matches($this->annonce(['agency_ids' => [$agency->id]]), $user));
        }
    }

    public function test_sous_profil_actif_dans_b_une_annonce_ciblee_sur_a_l_atteint(): void
    {
        [$user, $a, , $profilB] = $this->membreDeDeuxAgences();
        request()->attributes->set('active_profile', $profilB);

        $this->assertTrue(app(AnnouncementResolver::class)->matches($this->annonce(['agency_ids' => [$a->id]]), $user));
        $this->assertTrue(app(FeatureFlagEvaluator::class)->evaluate($this->drapeau(['agency_ids' => [$a->id]]), $user));
    }

    public function test_une_agence_ou_le_profil_est_suspendu_n_atteint_pas(): void
    {
        $a = Agency::factory()->create();
        $user = User::factory()->create();
        AgentProfile::factory()->suspended()->create(['user_id' => $user->id, 'agency_id' => $a->id]);

        $this->assertFalse(app(AnnouncementResolver::class)->matches($this->annonce(['agency_ids' => [$a->id]]), $user));
        $this->assertFalse(app(FeatureFlagEvaluator::class)->evaluate($this->drapeau(['agency_ids' => [$a->id]]), $user));
    }

    /** @return array{0: User, 1: Agency, 2: Agency, 3: AgentProfile} */
    private function membreDeDeuxAgences(): array
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $profilB = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        return [$user, $a, $b, $profilB];
    }

    /** @param  array<string, mixed>  $segments */
    private function drapeau(array $segments): FeatureFlag
    {
        return new FeatureFlag(['key' => 'k_ciblage', 'enabled' => true, 'segments_json' => $segments]);
    }

    /** @param  array<string, mixed>  $segment */
    private function annonce(array $segment): Announcement
    {
        return new Announcement(['segment' => $segment]);
    }
}
