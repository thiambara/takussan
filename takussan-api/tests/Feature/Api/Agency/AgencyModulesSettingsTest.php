<?php

namespace Tests\Feature\Api\Agency;

use App\Domain\Settings\AgencySettings;
use App\Http\Requests\AgencyUpdateRequest;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — `settings.hidden_modules` : les modules
 * qu'un admin d'agence `standard` retire du menu de son personnel.
 *
 * Un réglage d'AFFICHAGE : ce test n'éprouve que son écriture et sa lecture. Qu'aucun droit ni
 * aucune page n'en dépende se garde côté front (`modules.test.ts`).
 */
class AgencyModulesSettingsTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, mixed>  $settings
     * @return array{User, Agency}
     */
    private function admin(array $settings = [], bool $individual = false): array
    {
        $admin = User::factory()->create();
        $factory = $individual ? Agency::factory()->individual() : Agency::factory();
        $agency = $factory->create(['primary_admin_id' => $admin->id, 'settings' => $settings]);

        return [$admin, $agency];
    }

    private function agentDe(Agency $agency): User
    {
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);

        return $agent;
    }

    public function test_l_admin_masque_des_modules_et_l_agent_les_relit(): void
    {
        [$admin, $agency] = $this->admin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['hidden_modules' => ['commissions', 'analytics']],
        ])->assertOk();

        $this->assertSame(['commissions', 'analytics'], $agency->refresh()->settings['hidden_modules']);

        Sanctum::actingAs($this->agentDe($agency));
        $this->getJson("/api/agencies/{$agency->id}")
            ->assertOk()
            ->assertJsonPath('data.settings.hidden_modules', ['commissions', 'analytics']);
    }

    public function test_les_autres_reglages_sont_intacts(): void
    {
        [$admin, $agency] = $this->admin(['watermark_enabled' => false]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", [
            'settings' => ['hidden_modules' => ['calendar']],
        ])->assertOk();

        $this->assertFalse($agency->refresh()->settings['watermark_enabled']);
    }

    /**
     * @return array<string, array{mixed, string}>
     */
    public static function valeursRefusees(): array
    {
        return [
            'code inconnu' => [['payments'], 'settings.hidden_modules.0'],
            'doublon' => [['calendar', 'calendar'], 'settings.hidden_modules.1'],
            'objet, pas une liste' => [['a' => 'calendar'], 'settings.hidden_modules'],
            'chaîne' => ['calendar', 'settings.hidden_modules'],
            'entier' => [[1], 'settings.hidden_modules.0'],
        ];
    }

    #[DataProvider('valeursRefusees')]
    public function test_une_valeur_hors_regle_est_refusee(mixed $valeur, string $cleEnErreur): void
    {
        [$admin, $agency] = $this->admin(['hidden_modules' => ['credits']]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => $valeur]])
            ->assertStatus(422)
            ->assertJsonValidationErrors($cleEnErreur);

        $this->assertSame(['credits'], $agency->refresh()->settings['hidden_modules']);
    }

    public function test_null_rend_le_defaut(): void
    {
        [$admin, $agency] = $this->admin(['hidden_modules' => ['credits']]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => null]])->assertOk();

        $agency->refresh();
        $this->assertArrayNotHasKey('hidden_modules', $agency->settings ?? []);
        $this->assertSame([], $agency->setting('hidden_modules'));
    }

    public function test_une_liste_vide_est_acceptee(): void
    {
        [$admin, $agency] = $this->admin(['hidden_modules' => ['credits']]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => []]])->assertOk();

        $this->assertSame([], $agency->refresh()->setting('hidden_modules'));
    }

    public function test_une_agence_individuelle_ne_masque_rien(): void
    {
        [$admin, $agency] = $this->admin(individual: true);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => ['calendar']]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.hidden_modules');

        $this->assertArrayNotHasKey('hidden_modules', $agency->refresh()->settings ?? []);
    }

    public function test_un_agent_ne_peut_pas_ecrire(): void
    {
        [, $agency] = $this->admin();
        Sanctum::actingAs($this->agentDe($agency));

        $this->patchJson("/api/agencies/{$agency->id}", ['settings' => ['hidden_modules' => ['calendar']]])
            ->assertForbidden();

        $this->assertArrayNotHasKey('hidden_modules', $agency->refresh()->settings ?? []);
    }

    public function test_la_lecture_ne_rend_que_des_codes_connus(): void
    {
        $this->assertSame(['calendar'], AgencySettings::read(['hidden_modules' => ['calendar', 'obsolete', 3, 'calendar']], 'hidden_modules'));
        $this->assertSame([], AgencySettings::read(['hidden_modules' => 'calendar'], 'hidden_modules'));
        $this->assertSame([], AgencySettings::read(['hidden_modules' => ['x' => 'calendar']], 'hidden_modules'));
        $this->assertSame([], AgencySettings::read(null, 'hidden_modules'));
    }

    public function test_les_regles_viennent_du_catalogue(): void
    {
        $regles = (new AgencyUpdateRequest)->rules();

        $this->assertArrayHasKey('settings.hidden_modules', $regles);
        $this->assertArrayHasKey('settings.hidden_modules.*', $regles);
    }
}
