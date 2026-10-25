<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P203.04 (TCK-2163) — la Gate des capacités, sans agence en contexte, juge un compte à l'agence de
 * SON profil actif (`$user->activeProfile()`), jamais à celle du profil actif de la requête quand
 * ce profil est celui d'un autre compte.
 *
 * Rouge avant le correctif : dans une requête d'un agent de A, `$agentDeB->can('properties.create')`
 * était jugé dans A, où il n'a aucun profil, et refusé.
 */
class GateJugeLeTiersDansSonAgenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_tiers_n_est_pas_juge_dans_l_agence_du_profil_actif_de_la_requete(): void
    {
        [$agentDeA, $profilA] = $this->agentDe(Agency::factory()->create());
        [$agentDeB] = $this->agentDe($b = Agency::factory()->create());

        $this->assertTrue($agentDeB->can(Capability::PropertiesCreate->value), 'hors requête : son agence unique');

        request()->attributes->set('active_profile', $profilA);

        $this->assertTrue($agentDeB->can(Capability::PropertiesCreate->value), 'le profil de la requête est celui d\'un autre compte');
        $this->assertTrue($agentDeB->can(Capability::PropertiesCreate->value, $b));
        $this->assertTrue($agentDeA->can(Capability::PropertiesCreate->value), 'l\'appelant reste jugé à son profil actif');
    }

    public function test_le_profil_actif_de_l_appelant_reste_celui_qui_juge(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $a);
        $this->materializeRoleProfile($user, 'agent', $b);
        $profilA = AgentProfile::query()->where('user_id', $user->id)->where('agency_id', $a->id)->sole();

        request()->attributes->set('active_profile', $profilA);

        $this->assertTrue($user->fresh()->can(Capability::PropertiesCreate->value), 'jugé dans A, son profil actif ; sans lui, compte de deux agences, aucune');
    }

    /** @return array{0: User, 1: AgentProfile} */
    private function agentDe(Agency $agency): array
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $agency);

        return [$user->fresh(), AgentProfile::query()->where('user_id', $user->id)->sole()];
    }
}
