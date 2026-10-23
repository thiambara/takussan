<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1730 (P168.02) — les routes paginées du portefeuille d'un profil public filtrent par
 * `filter[contract_type]` (`rent`|`sale`, exact), pour que les onglets « À louer » et « À vendre »
 * se chargent par l'API. Avant, l'onglet filtrait côté client les 24 biens les plus récents,
 * tous contrats confondus, et se montrait vide quand ses biens n'y étaient pas.
 */
class PortefeuilleFiltreParContratTest extends TestCase
{
    use RefreshDatabase;

    private Property $location;

    private Property $vente;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create(['slug' => 'sahel-homes']);
        $agent = User::factory()->create(['username' => 'awa-diop']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        $bien = fn (ContractType $contrat) => Property::factory()->published()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'contract_type' => $contrat,
        ]);
        $this->location = $bien(ContractType::Rent);
        $this->vente = $bien(ContractType::Sale);
    }

    public static function routes(): array
    {
        return [
            'agent' => ['/api/public/agents/awa-diop/properties'],
            'agence' => ['/api/public/agencies/sahel-homes/properties'],
        ];
    }

    #[DataProvider('routes')]
    public function test_le_filtre_de_contrat_borne_la_page_et_son_total(string $route): void
    {
        $this->getJson($route.'?filter[contract_type]=rent')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $this->location->id);

        $this->getJson($route.'?filter[contract_type]=sale')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $this->vente->id);
    }

    #[DataProvider('routes')]
    public function test_sans_filtre_la_page_garde_tous_les_contrats(string $route): void
    {
        $this->getJson($route)->assertOk()->assertJsonPath('meta.total', 2);
    }

    #[DataProvider('routes')]
    public function test_un_contrat_inconnu_est_refuse(string $route): void
    {
        $this->getJson($route.'?filter[contract_type]=lease')->assertStatus(422);
    }

    /**
     * TCK-1853 (P187.06) — `per_page` est validé comme sur les autres listes publiques : une
     * valeur illisible rend 422 au lieu d'une page d'un bien.
     *
     * @return array<string, array{string, string}>
     */
    public static function routesEtPerPageIllisible(): array
    {
        $cas = [];
        foreach (self::routes() as $nom => [$route]) {
            $cas["{$nom}, abc"] = [$route, 'per_page=abc'];
            $cas["{$nom}, liste"] = [$route, 'per_page[]=3'];
        }

        return $cas;
    }

    #[DataProvider('routesEtPerPageIllisible')]
    public function test_un_per_page_illisible_est_refuse(string $route, string $requete): void
    {
        $this->getJson($route.'?'.$requete)->assertStatus(422)->assertJsonValidationErrors('per_page');
    }

    /** La borne haute reste le plafond de 48 du contrôleur : aucun 422 neuf au-delà. */
    #[DataProvider('routes')]
    public function test_un_per_page_au_dela_du_plafond_reste_servi(string $route): void
    {
        $this->getJson($route.'?per_page=100')->assertOk()->assertJsonPath('meta.per_page', 48);
    }
}
