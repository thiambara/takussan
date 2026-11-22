<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\User;
use App\Support\AgencyKindGuard;
use App\Support\Security\TwoFactorRequirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-2487 — `settings.require_team_two_factor` sur une agence `individual`.
 *
 * La MESURE d'abord (2026-11-06) : l'interrupteur n'a aucun effet sur une `individual`.
 * `TwoFactorRequirement::requiredAtAgency()` exige déjà la 2FA de tout admin d'agence, avant de lire
 * l'interrupteur, et l'hôte en est un (`HostIndividualOnboardingService` lui pose son
 * `AgencyAdminProfile`). Le personnel que vise l'interrupteur — agents, délégations — n'existe pas
 * dans une agence qui ne peut pas former d'équipe (`AgencyKindGuard::canFormTeam`).
 *
 * D'où la décision : l'API refuse la clé à une `individual` (`prohibited`, patron de
 * `settings.hidden_modules`) et la fiche n'en montre plus la section. Si la mesure ci-dessous
 * rougit, la décision est à reprendre : l'interrupteur aurait alors un effet sur l'hôte.
 */
class AgencyTeamTwoFactorIndividualTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, mixed>  $settings
     * @return array{User, Agency}
     */
    private function hote(array $settings = [], bool $individual = true): array
    {
        $factory = $individual ? Agency::factory()->individual() : Agency::factory();
        $agency = $factory->create(['settings' => $settings]);
        $hote = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $agency->forceFill(['primary_admin_id' => $hote->id])->save();

        return [$hote, $agency];
    }

    public function test_mesure_l_interrupteur_ne_change_rien_pour_l_hote_d_une_agence_individuelle(): void
    {
        [$hote, $agency] = $this->hote();
        $hote->forceFill(['two_factor_enabled' => false, 'two_factor_secret' => null])->save();

        $this->assertFalse(AgencyKindGuard::canFormTeam($agency), 'une `individual` ne forme pas d’équipe');

        $this->assertTrue(TwoFactorRequirement::requiredAtAgency($hote, $agency->id), 'interrupteur absent');
        $this->assertTrue(TwoFactorRequirement::isMandatory($hote));

        $agency->forceFill(['settings' => ['require_team_two_factor' => true]])->save();
        $this->assertTrue(TwoFactorRequirement::requiredAtAgency($hote, $agency->id), 'interrupteur posé');
        $this->assertTrue(TwoFactorRequirement::isMandatory($hote));
    }

    /**
     * @return array<string, array{bool}>
     */
    public static function valeurs(): array
    {
        return ['true' => [true], 'false' => [false]];
    }

    #[DataProvider('valeurs')]
    public function test_une_agence_individuelle_ne_pose_pas_l_interrupteur(bool $valeur): void
    {
        [, $agency] = $this->hote(['watermark_enabled' => false]);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['require_team_two_factor' => $valeur]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.require_team_two_factor');

        $this->assertSame(['watermark_enabled' => false], $agency->refresh()->settings);
    }

    public function test_null_reste_accepte_et_retire_une_valeur_ancienne(): void
    {
        [, $agency] = $this->hote(['require_team_two_factor' => true, 'watermark_enabled' => false]);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['require_team_two_factor' => null]])->assertOk();

        $this->assertSame(['watermark_enabled' => false], $agency->refresh()->settings);
    }

    public function test_les_autres_reglages_d_une_individuelle_s_enregistrent_toujours(): void
    {
        [, $agency] = $this->hote();

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['late_fee_online_collection' => true]])->assertOk();

        $this->assertTrue($agency->refresh()->settings['late_fee_online_collection']);
    }

    public function test_une_agence_standard_pose_toujours_l_interrupteur(): void
    {
        [, $agency] = $this->hote(individual: false);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['require_team_two_factor' => true]])
            ->assertOk()
            ->assertJsonPath('data.settings.require_team_two_factor', true);
    }
}
