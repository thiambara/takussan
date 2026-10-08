<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0048 §3-4) — AC4 : une agence suspendue se lit et s'exporte, elle ne s'écrit plus.
 *
 * Deux chemins, chacun éprouvé : `EnsureAgencyWritable` sur le profil ACTIF de la requête (423),
 * et le résolveur de capacités pour un membre qui viserait l'agence suspendue depuis un autre
 * profil (403).
 */
class AgencySuspendedWriteLockTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = $this->agence();
    }

    /** AC4. */
    public function test_un_agent_d_une_agence_suspendue_lit_exporte_et_n_ecrit_plus(): void
    {
        $agent = $this->personnel($this->agence);
        $this->suspendre();
        $this->actingAs($agent);

        $this->postJson('/api/properties', ['title' => 'Villa'])
            ->assertStatus(423)
            ->assertJsonPath('code', 'agency.suspended');
        $this->getJson('/api/properties')->assertOk();
        $this->postJson('/api/me/data-exports')->assertSuccessful();
    }

    public function test_l_admin_d_une_agence_suspendue_exporte_ses_donnees_et_ne_modifie_pas_l_agence(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agence]);
        $this->suspendre();

        $this->getJson('/api/export/customers')->assertOk();
        $this->putJson("/api/agencies/{$this->agence->id}", ['name' => 'Autre nom'])
            ->assertStatus(423)
            ->assertJsonPath('code', 'agency.suspended');
        $this->assertNotSame('Autre nom', $this->agence->fresh()->name);
    }

    /** Le verrou ne vaut que pour `suspended` : une agence `inactive` se remet en conformité. */
    public function test_une_agence_inactive_s_ecrit_encore(): void
    {
        $agent = $this->personnel($this->agence);
        $this->agence->forceFill(['status' => AgencyStatus::Inactive])->save();
        $this->actingAs($agent);

        $this->assertNotSame(423, $this->postJson('/api/properties', ['title' => 'Villa'])->status());
    }

    /**
     * Second chemin : un agent de deux agences, profil actif dans l'agence saine, qui modifie un
     * bien de l'agence suspendue. Le middleware ne voit que le profil actif ; le résolveur refuse.
     */
    public function test_un_membre_de_deux_agences_n_ecrit_pas_dans_la_suspendue_depuis_l_autre(): void
    {
        $saine = $this->agence();
        $agent = $this->personnel($this->agence);
        $profilSain = AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $saine->id]);
        $bien = $this->bienDe($this->agence, $agent);
        $this->actingAs($agent->fresh());

        $this->withHeader('X-Profile-Id', "agent:{$profilSain->id}")
            ->patchJson("/api/properties/{$bien->id}", ['title' => 'Avant suspension'])
            ->assertOk();

        $this->suspendre();

        $this->withHeader('X-Profile-Id', "agent:{$profilSain->id}")
            ->patchJson("/api/properties/{$bien->id}", ['title' => 'Après suspension'])
            ->assertForbidden();
        $this->assertSame('Avant suspension', $bien->fresh()->title);
    }

    public function test_le_resolveur_garde_la_lecture_et_l_export_et_refuse_l_ecriture(): void
    {
        $admin = $this->personnel($this->agence, 'agency_admin');
        $resolver = app(MembershipCapabilityResolver::class);
        $this->assertTrue($resolver->allows($admin, Capability::PropertiesCreate, $this->agence));

        $this->suspendre();
        $agence = $this->agence->fresh();

        $this->assertFalse($resolver->allows($admin, Capability::PropertiesCreate, $agence));
        $this->assertFalse($resolver->allows($admin, Capability::TeamInvite, $agence));
        $this->assertFalse($resolver->allows($admin, Capability::PaymentsRecord, $agence));
        $this->assertTrue($resolver->allows($admin, Capability::CrmExport, $agence));
        $this->assertTrue($resolver->allows($admin, Capability::CrmViewAll, $agence));
        $this->assertTrue($resolver->allows($admin, Capability::PaymentsExport, $agence));
    }

    private function suspendre(): void
    {
        $this->agence->forceFill(['status' => AgencyStatus::Suspended])->save();
    }
}
