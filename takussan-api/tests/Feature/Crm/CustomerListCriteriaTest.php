<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * Vérification adverse de TCK-2756 (d1, préexistant ; colonne « Cherche » de TCK-2590) — la liste du
 * CRM, lue avec les colonnes du front (`DASHBOARD_CUSTOMER_FIELDS`, sans `agency_id`), rend les critères
 * du prospect au personnel de l'agence. `readsCriteria` les jugeait sur la fiche telle que la liste l'a
 * lue : sans son agence, la règle refusait, et la colonne « Cherche » restait vide pour tout le
 * personnel (seul le super-admin les recevait). La règle se juge sur la fiche relue
 * (`ficheJugeable()`), comme les visites et l'origine.
 */
class CustomerListCriteriaTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** `DASHBOARD_CUSTOMER_FIELDS` de `takussan-web/src/lib/queries/customers.ts`, et son `include`. */
    private const LISTE_DU_FRONT = '/api/customers?per_page=20&include=tags&sort=-created_at&fields[customers]='
        .'id,first_name,last_name,email,phone,status,pipeline_stage,seeking_contract_type,budget_max,'
        .'seeking_property_types,seeking_cities,seeking_neighborhoods,next_action,follow_up,referent,created_at';

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
    }

    private function ficheAvecCriteres(array $attributs = []): Customer
    {
        return Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'budget_max' => 300000,
            'seeking_cities' => ['Dakar'],
            'seeking_contract_type' => 'rent',
            ...$attributs,
        ]);
    }

    /** @return array<int, array<string, mixed>> les lignes par id */
    private function lignes(User $lecteur): array
    {
        return collect($this->actingAsApi($lecteur)->getJson(self::LISTE_DU_FRONT)->assertOk()->json('data'))->keyBy('id')->all();
    }

    public function test_le_personnel_recoit_les_criteres_avec_les_colonnes_du_front(): void
    {
        $fiche = $this->ficheAvecCriteres();

        foreach (['admin' => $this->agencyAdmin($this->agency), 'agent' => $this->agentWith($this->agency, Capability::CrmViewAll)] as $qui => $lecteur) {
            $ligne = $this->lignes($lecteur)[$fiche->id] ?? null;
            $this->assertNotNull($ligne, "{$qui} : la fiche est dans sa liste");
            $this->assertEquals(300000, $ligne['budget_max'] ?? null, "{$qui} : budget_max");
            $this->assertSame(['Dakar'], $ligne['seeking_cities'] ?? null, "{$qui} : seeking_cities");
            $this->assertSame('rent', $ligne['seeking_contract_type'] ?? null, "{$qui} : seeking_contract_type");
            $this->assertArrayNotHasKey('agency_id', $ligne, "{$qui} : l'agence relue pour juger n'est pas émise");
            $this->app['auth']->forgetGuards();
        }
    }

    /** La règle existante (TCK-591 §5) : le bailleur auteur d'une fiche d'agence garde la fiche, pas ses critères. */
    public function test_le_bailleur_auteur_d_une_fiche_tierce_ne_recoit_pas_les_criteres(): void
    {
        $bailleur = User::factory()->create();
        $this->materializeRoleProfile($bailleur, 'owner', $this->agency);
        $fiche = $this->ficheAvecCriteres(['added_by_id' => $bailleur->id, 'user_id' => null]);

        $ligne = $this->lignes($bailleur)[$fiche->id] ?? null;

        $this->assertNotNull($ligne, 'sa fiche est dans sa liste');
        foreach (['budget_max', 'seeking_cities', 'seeking_contract_type', 'seeking_property_types', 'seeking_neighborhoods'] as $cle) {
            $this->assertArrayNotHasKey($cle, $ligne, $cle);
        }
    }
}
