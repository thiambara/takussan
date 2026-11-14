<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\SettingScope;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Lease\ReglagesDeBailDeLAgence;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2832 — l'admin qui configure l'agence règle, une fois pour toute l'agence, ce que chaque bail
 * neuf reprend (pénalité de retard, délai de grâce, indemnité de départ, plafond de révision) :
 *
 * - `GET /api/settings/lease` rend, pour chaque clé, la valeur appliquée, sa source, la valeur de
 *   la plateforme, la ligne d'agence et les bornes du catalogue — à qui configure l'agence, seul ;
 * - l'écriture passe par `POST /api/settings` (portée `agency`), et « revenir à la valeur de la
 *   plateforme » par `DELETE /api/settings/{id}` : la ligne disparaît, une ligne à 0 n'y sert pas ;
 * - `GET /api/leases/defaults` dit au front si l'appelant peut modifier ces réglages
 *   (`can_edit_agency_settings`) : le front ne le déduit pas du rôle.
 */
class ReglagesDeBailDeLAgenceTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $agent;

    private User $bailleur;

    private User $adminDAilleurs;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agence);
        $this->agent = $this->agencyAgent($this->agence);
        $this->bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agence->id]);
        $this->adminDAilleurs = $this->agencyAdmin(Agency::factory()->create());
        $this->bien = Property::factory()->create([
            'user_id' => $this->bailleur->id,
            'agency_id' => $this->agence->id,
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 300_000,
            'currency' => 'XOF',
        ]);
        app(PlatformSettingService::class)->bulkUpdate(['lease.late_fee_percent' => 3], User::factory()->create());
    }

    private function poser(User $qui, string $cle, mixed $valeur): TestResponse
    {
        $this->actingAsApi($qui);

        return $this->postJson('/api/settings', ['key' => $cle, 'value' => ['value' => $valeur], 'scope' => 'agency']);
    }

    private function ligne(string $cle): ?Setting
    {
        return Setting::query()->where('key', $cle)->where('scope', SettingScope::Agency)->where('scope_id', $this->agence->id)->first();
    }

    // ── AC1, AC2 : régler puis revenir à la plateforme ────────────────────────────────────────────

    public function test_ac1_le_reglage_de_l_admin_preremplit_le_bail_suivant_avec_la_source_agence(): void
    {
        $this->poser($this->admin, 'lease.late_fee_percent', 5)->assertCreated();

        $this->actingAsApi($this->agent);
        $this->getJson('/api/leases/defaults?property_id='.$this->bien->id)->assertOk()
            ->assertJsonPath('data.late_fee_percent', ['value' => 5, 'source' => 'agency']);
    }

    public function test_ac2_revenir_a_la_plateforme_retire_la_ligne_et_le_bail_reprend_le_catalogue(): void
    {
        $this->poser($this->admin, 'lease.late_fee_percent', 5)->assertCreated();
        $id = $this->ligne('lease.late_fee_percent')->id;

        $this->actingAsApi($this->admin);
        $this->deleteJson('/api/settings/'.$id)->assertNoContent();
        $this->assertNull($this->ligne('lease.late_fee_percent'), 'la ligne d’agence est retirée, pas remise à 0');

        $this->actingAsApi($this->agent);
        $this->getJson('/api/leases/defaults?property_id='.$this->bien->id)->assertOk()
            ->assertJsonPath('data.late_fee_percent', ['value' => 3, 'source' => 'platform']);
    }

    // ── La lecture de l'écran ────────────────────────────────────────────────────────────────────

    public function test_l_ecran_lit_la_valeur_appliquee_sa_source_la_plateforme_et_la_ligne(): void
    {
        $this->actingAsApi($this->admin);
        $avant = $this->getJson('/api/settings/lease')->assertOk();
        $avant->assertJsonPath('data.can_edit', true);
        $cles = array_column($avant->json('data.settings'), 'key');
        $this->assertSame([
            'lease.late_fee_percent',
            'lease.late_fee_grace_days',
            'lease.early_termination_penalty_months',
            'lease.rent_review_max_pct',
        ], $cles);
        $avant->assertJsonPath('data.settings.0.value', 3)
            ->assertJsonPath('data.settings.0.source', 'platform')
            ->assertJsonPath('data.settings.0.platform_value', 3)
            ->assertJsonPath('data.settings.0.setting_id', null)
            ->assertJsonPath('data.settings.0.min', 0)
            ->assertJsonPath('data.settings.0.max', 50)
            ->assertJsonPath('data.settings.0.type', 'decimal')
            ->assertJsonPath('data.settings.3.min', 0)
            ->assertJsonPath('data.settings.3.min_exclusive', true);

        $this->poser($this->admin, 'lease.late_fee_percent', 5)->assertCreated();
        $id = $this->ligne('lease.late_fee_percent')->id;

        $this->actingAsApi($this->admin);
        $this->getJson('/api/settings/lease')->assertOk()
            ->assertJsonPath('data.settings.0.value', 5)
            ->assertJsonPath('data.settings.0.source', 'agency')
            ->assertJsonPath('data.settings.0.platform_value', 3)
            ->assertJsonPath('data.settings.0.setting_id', $id);
    }

    /** r6 — une ligne à 0 sous le plancher n'est pas un réglage : source plateforme, mais la ligne se retire. */
    public function test_une_ligne_sous_le_plancher_se_dit_plateforme_et_reste_retirable(): void
    {
        $ligne = Setting::query()->create([
            'key' => 'lease.early_termination_penalty_months', 'value' => ['value' => 0],
            'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id,
        ]);

        $this->actingAsApi($this->admin);
        $this->getJson('/api/settings/lease')->assertOk()
            ->assertJsonPath('data.settings.2.source', 'platform')
            ->assertJsonPath('data.settings.2.setting_id', $ligne->id);
    }

    /** @return array<string, array{string}> */
    public static function quiNeConfigurePas(): array
    {
        return ['agent' => ['agent'], 'bailleur' => ['bailleur'], 'admin d’une autre agence' => ['adminDAilleurs']];
    }

    #[DataProvider('quiLitLesDefautsSansConfigurer')]
    public function test_l_ecran_est_refuse_a_qui_ne_configure_pas_l_agence(string $qui): void
    {
        $this->actingAsApi($this->{$qui});
        $this->getJson('/api/settings/lease')->assertForbidden();
    }

    /** L'admin d'une autre agence lit les SIENS : jamais la valeur ni la ligne de cette agence-ci. */
    public function test_l_admin_d_une_autre_agence_ne_lit_que_son_agence(): void
    {
        $this->poser($this->admin, 'lease.late_fee_percent', 5)->assertCreated();

        $this->actingAsApi($this->adminDAilleurs);
        $this->getJson('/api/settings/lease')->assertOk()
            ->assertJsonPath('data.settings.0.value', 3)
            ->assertJsonPath('data.settings.0.source', 'platform')
            ->assertJsonPath('data.settings.0.setting_id', null);
    }

    // ── AC3 : le drapeau de `defaults` ───────────────────────────────────────────────────────────

    public function test_ac3_defaults_dit_a_l_admin_qu_il_peut_modifier_les_reglages(): void
    {
        $this->actingAsApi($this->admin);
        $this->getJson('/api/leases/defaults?property_id='.$this->bien->id)->assertOk()
            ->assertJsonPath('data.can_edit_agency_settings', true);
    }

    /** @return array<string, array{string}> */
    public static function quiLitLesDefautsSansConfigurer(): array
    {
        return ['agent' => ['agent'], 'bailleur' => ['bailleur']];
    }

    #[DataProvider('quiLitLesDefautsSansConfigurer')]
    public function test_ac3_defaults_ne_le_dit_ni_a_l_agent_ni_au_bailleur(string $qui): void
    {
        $this->actingAsApi($this->{$qui});
        $this->getJson('/api/leases/defaults?property_id='.$this->bien->id)->assertOk()
            ->assertJsonPath('data.can_edit_agency_settings', false);
    }

    /**
     * Le drapeau vise l'agence du bien ET celle de l'appelant : les routes d'écriture visent l'agence
     * du profil actif, « Modifier » mènerait sinon aux réglages d'une autre. Cas atteignable : l'admin
     * principal d'une agence (`AgencyPolicy::configure` le laisse passer) qui travaille ailleurs.
     */
    public function test_ac3_le_drapeau_exige_que_l_agence_du_bien_soit_celle_de_l_appelant(): void
    {
        $this->agence->forceFill(['primary_admin_id' => $this->adminDAilleurs->id])->save();
        $this->assertTrue($this->adminDAilleurs->can('configure', $this->agence->fresh()), 'prémisse : la policy le laisse passer');

        $this->assertFalse(ReglagesDeBailDeLAgence::peutModifier($this->adminDAilleurs, $this->agence->id));
    }

    // ── AC4 : 403 en écriture, avant toute validation ────────────────────────────────────────────

    #[DataProvider('quiNeConfigurePas')]
    public function test_ac4_l_ecriture_est_refusee_avant_la_validation(string $qui): void
    {
        $ligne = Setting::query()->create([
            'key' => 'lease.late_fee_percent', 'value' => ['value' => 4],
            'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id,
        ]);
        $this->actingAsApi($this->{$qui});

        // Une valeur hors catalogue (999) : un 422 dirait que la validation a couru avant la garde.
        $this->postJson('/api/settings', [
            'key' => 'lease.late_fee_percent', 'value' => ['value' => 999], 'scope' => 'agency', 'scope_id' => $this->agence->id,
        ])->assertForbidden();
        $this->putJson('/api/settings/'.$ligne->id, ['value' => ['value' => 999]])->assertForbidden();
        $this->deleteJson('/api/settings/'.$ligne->id)->assertForbidden();

        $this->assertSame(['value' => 4], $ligne->fresh()->value);
    }

    // ── AC5 : la règle du catalogue ──────────────────────────────────────────────────────────────

    /** @return array<string, array{string, mixed}> */
    public static function horsDuCatalogue(): array
    {
        return [
            'pénalité au-delà de 50' => ['lease.late_fee_percent', 51],
            'grâce au-delà de 30' => ['lease.late_fee_grace_days', 31],
            'indemnité sous 1' => ['lease.early_termination_penalty_months', 0],
            'révision à 0' => ['lease.rent_review_max_pct', 0],
        ];
    }

    #[DataProvider('horsDuCatalogue')]
    public function test_ac5_une_valeur_hors_du_catalogue_est_refusee_avec_le_message_du_champ(string $cle, mixed $valeur): void
    {
        $this->poser($this->admin, $cle, $valeur)->assertUnprocessable()->assertJsonValidationErrors(['value']);
        $this->assertNull($this->ligne($cle));
    }
}
