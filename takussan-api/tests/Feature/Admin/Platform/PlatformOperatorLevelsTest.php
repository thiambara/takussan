<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0047) — ce que chaque niveau d'opérateur fait, et ce qu'il ne fait pas.
 *
 * AC11 : un `support` ou un `viewer` n'a AUCUNE capacité d'agence — les listes blanches de
 * `resolvePlatform` lui ouvraient les données de toute agence par les routes d'agence.
 */
class PlatformOperatorLevelsTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    public function test_me_abilities_rend_les_gestes_du_niveau(): void
    {
        foreach (PlatformProfileLevel::cases() as $level) {
            $this->agirEnOperateur($level);

            $reponse = $this->getJson('/api/admin/me/abilities')->assertOk();

            $reponse->assertJsonPath('data.level', $level->value);
            $this->assertSame(
                array_map(fn (PlatformAbility $a) => $a->value, PlatformAbility::forLevel($level)),
                $reponse->json('data.abilities'),
            );
        }
    }

    public function test_la_matrice_garde_au_super_admin_ses_gestes_reserves(): void
    {
        foreach ([PlatformProfileLevel::Viewer, PlatformProfileLevel::Support] as $level) {
            foreach ([
                PlatformAbility::UsersImpersonate, PlatformAbility::UsersErase, PlatformAbility::OperatorsManage,
                PlatformAbility::AgenciesSuspend, PlatformAbility::KycView, PlatformAbility::SettingsManage,
            ] as $reserve) {
                $this->assertFalse($reserve->grantedTo($level), "{$level->value} ne doit pas détenir {$reserve->value}");
            }
        }
        $this->assertFalse(PlatformAbility::UsersView->grantedTo(PlatformProfileLevel::Viewer));
        $this->assertFalse(PlatformAbility::SearchGlobal->grantedTo(PlatformProfileLevel::Viewer));
    }

    /** AC11. */
    public function test_un_support_ou_un_viewer_n_a_aucune_capacite_d_agence(): void
    {
        $agence = Agency::factory()->create();
        $resolver = app(MembershipCapabilityResolver::class);

        foreach ([PlatformProfileLevel::Support, PlatformProfileLevel::Viewer] as $level) {
            $operateur = $this->operateur($level);
            foreach ([Capability::CrmViewAll, Capability::CrmExport, Capability::PaymentsExport] as $capacite) {
                $this->assertFalse($resolver->allows($operateur, $capacite, $agence), "{$level->value} : {$capacite->value}");
            }
        }

        $this->assertTrue($resolver->allows($this->operateur(PlatformProfileLevel::SuperAdmin), Capability::CrmViewAll, $agence));
    }

    /** Un `support` qui agirait sur le compte d'un `super_admin` monterait en privilège par lui. */
    public function test_un_support_n_agit_pas_sur_le_compte_d_un_operateur(): void
    {
        $superAdmin = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $client = User::factory()->create();
        $client->createToken('mobile');
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->postJson("/api/admin/users/{$superAdmin->id}/reset-2fa", ['reason' => 'Support : téléphone perdu signalé'])
            ->assertForbidden()
            ->assertJsonPath('code', 'platform.target_is_operator');
        $this->postJson("/api/admin/users/{$superAdmin->id}/revoke-sessions", ['reason' => 'Support : appareil perdu signalé'])
            ->assertForbidden()
            ->assertJsonPath('code', 'platform.target_is_operator');
        $this->assertTrue($superAdmin->fresh()->two_factor_enabled);

        $this->postJson("/api/admin/users/{$client->id}/revoke-sessions", ['reason' => 'Support : appareil perdu signalé'])->assertSuccessful();
    }

    public function test_la_2fa_est_exigee_a_tous_les_niveaux(): void
    {
        foreach ([PlatformProfileLevel::Viewer, PlatformProfileLevel::Support] as $level) {
            $operateur = $this->operateur($level, ['two_factor_enabled' => false, 'two_factor_secret' => null]);
            $this->actingAs($operateur);

            $this->getJson('/api/admin/system/metrics')->assertForbidden();
        }
    }

    public function test_un_profil_revoque_n_entre_pas(): void
    {
        $operateur = $this->operateur(PlatformProfileLevel::Support);
        $operateur->platformProfile->forceFill(['revoked_at' => now()])->save();
        $this->actingAsWithStepUp($operateur->fresh());

        $this->getJson('/api/admin/system/metrics')
            ->assertForbidden()
            ->assertJsonPath('code', 'auth.super_admin_required');
    }

    /** Un `viewer` lit l'agence, pas les personnes qui la composent ni celles de ses biens. */
    public function test_un_viewer_ne_lit_aucune_personne_par_la_fiche_d_agence(): void
    {
        $admin = User::factory()->create();
        $agence = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        Property::factory()->create(['agency_id' => $agence->id, 'user_id' => $admin->id]);

        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->getJson("/api/admin/agencies/{$agence->id}")
            ->assertOk()
            ->assertJsonPath('data.primary_admin', null);
        $biens = $this->getJson("/api/admin/agencies/{$agence->id}/properties?include=owner,collaborators,owner.addresses")
            ->assertOk();
        $this->assertArrayNotHasKey('owner', $biens->json('data.0'));
        $this->assertStringNotContainsString($admin->email, $biens->getContent());

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->getJson("/api/admin/agencies/{$agence->id}")
            ->assertOk()
            ->assertJsonPath('data.primary_admin.email', $admin->email);
    }
}
