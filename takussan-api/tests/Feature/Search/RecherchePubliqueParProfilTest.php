<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\SearchQueryStat;
use App\Models\User;
use App\Services\Public\AgentPublic;
use App\Support\Search\CleDeQuartier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2517 — la liste publique filtrée par agence (`agency=<slug>`) et par agent (`agent=<slug>`), au prédicat du
 * portefeuille des fiches, et les comptes par option (`facets`), chacun hors de son propre filtre.
 */
class RecherchePubliqueParProfilTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/public/properties/search';

    private Agency $agence;

    private User $agent;

    /** @param  array<string, mixed>  $attributs */
    private function bien(array $attributs, string $quartier = 'Mermoz'): Property
    {
        $bien = Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            'user_id' => $this->agent->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'type' => PropertyType::Apartment,
            'bedrooms' => 2,
            ...$attributs,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
            'neighborhood' => $quartier,
        ]);

        return $bien;
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = Agency::factory()->create(['slug' => 'dakar-immo']);
        $this->agent = User::factory()->create(['username' => 'agent-technique-7', 'public_slug' => 'sokhna-gueye']);

        // Le portefeuille de l'agence : 4 à louer (3 appartements, 1 maison), 2 à vendre.
        $this->bien(['bedrooms' => 2]);
        $this->bien(['bedrooms' => 3]);
        $this->bien(['bedrooms' => 3], 'Almadies');
        $this->bien(['type' => PropertyType::House, 'bedrooms' => 4], 'Grand-Yoff');
        $this->bien(['contract_type' => ContractType::Sale, 'rent_period' => null, 'type' => PropertyType::Villa, 'bedrooms' => 5], 'Grand Yoff');
        $this->bien(['contract_type' => ContractType::Sale, 'rent_period' => null, 'type' => PropertyType::Land, 'bedrooms' => null], 'Almadies');
        // Publics mais HORS du portefeuille : `published` et `pending` (le seul `public()` les admet).
        $this->bien(['status' => PropertyStatus::Published]);
        $this->bien(['status' => PropertyStatus::Pending]);
        // Jamais : loué, brouillon, test.
        $this->bien(['status' => PropertyStatus::Rented]);
        $this->bien(['status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->bien(['is_test' => true]);
        // Une autre agence, un autre agent.
        Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly]);

        $this->indexProperties();
    }

    /** AC1 — le total de `agency=<slug>` est celui du portefeuille de la fiche d'agence. */
    public function test_ac1_le_total_de_l_agence_est_celui_de_sa_fiche(): void
    {
        $fiche = $this->getJson('/api/public/agencies/dakar-immo/properties')->assertOk()->json('meta.total');
        $liste = $this->getJson($this->url.'?agency=dakar-immo')->assertOk();

        $this->assertSame(6, $fiche);
        $this->assertSame($fiche, $liste->json('meta.total'));
        $this->assertCount(6, $liste->json('data'));

        // Même égalité sous un contrat (le seul filtre de la fiche, dans SON dialecte `filter[…]`).
        $this->assertSame(
            $this->getJson('/api/public/agencies/dakar-immo/properties?filter[contract_type]=rent')->json('meta.total'),
            $this->getJson($this->url.'?agency=dakar-immo&contract_type=rent')->json('meta.total'),
        );
    }

    /** Par agent : le slug public, et `username` en repli ; même total que la fiche de l'agent. */
    public function test_le_total_de_l_agent_est_celui_de_sa_fiche_par_slug_public_ou_username(): void
    {
        $fiche = $this->getJson('/api/public/agents/agent-technique-7/properties')->assertOk()->json('meta.total');

        $this->assertSame(6, $fiche);
        $this->assertSame($fiche, $this->getJson($this->url.'?agent=sokhna-gueye')->json('meta.total'));
        $this->assertSame($fiche, $this->getJson($this->url.'?agent=agent-technique-7')->json('meta.total'));
    }

    /**
     * TCK-2519 — un ANCIEN slug au nom (nom ou rôle changé) mène à la fiche, qui redirige ; il filtre donc la liste au
     * même portefeuille. Le filtre et la fiche partagent une seule résolution ({@see AgentPublic::parSlug()}).
     */
    public function test_un_ancien_slug_rend_le_portefeuille_de_l_agent(): void
    {
        $this->agent->forceFill(['metadata' => ['previous_public_slugs' => ['sokhna-ndiaye']]])->save();

        $fiche = $this->getJson('/api/public/agents/sokhna-ndiaye/properties')->assertOk()->json('meta.total');
        $liste = $this->getJson($this->url.'?agent=sokhna-ndiaye')->assertOk();

        $this->assertSame(6, $fiche);
        $this->assertSame($fiche, $liste->json('meta.total'));
        $this->assertSame($fiche, $this->getJson($this->url.'?agent=Sokhna-Gueye')->json('meta.total'), 'le slug est replié en minuscules, comme la fiche');
    }

    /** AC2 — sous l'agence et la location, les comptes par type somment au total de l'agence en location. */
    public function test_ac2_les_comptes_par_type_somment_au_total(): void
    {
        $reponse = $this->getJson($this->url.'?agency=dakar-immo&contract_type=rent&facets=type')->assertOk();

        $this->assertSame(4, $reponse->json('meta.total'));
        $this->assertSame(
            [['value' => 'apartment', 'count' => 3], ['value' => 'house', 'count' => 1]],
            $reponse->json('meta.facets.type'),
        );
        $this->assertSame($reponse->json('meta.total'), array_sum(array_column($reponse->json('meta.facets.type'), 'count')));
    }

    /** AC3 — la facette du contrat ignore son propre filtre : « vente » compte les biens à vendre de l'agence. */
    public function test_ac3_la_facette_ignore_son_propre_filtre(): void
    {
        $facettes = $this->getJson($this->url.'?agency=dakar-immo&contract_type=rent&rent_period=monthly&type=apartment&facets=contract_type,bedrooms,neighborhood')
            ->assertOk()->json('meta.facets');

        // Contrat : sous type=apartment, hors contrat (et hors période, qui ne s'entend que d'une location).
        $this->assertSame([['value' => 'rent', 'count' => 3]], $facettes['contract_type']);
        $vente = $this->getJson($this->url.'?agency=dakar-immo&contract_type=rent&facets=contract_type')->json('meta.facets.contract_type');
        $this->assertSame(['rent' => 4, 'sale' => 2], array_column($vente, 'count', 'value'));
        $this->assertSame(2, $this->getJson($this->url.'?agency=dakar-immo&contract_type=sale')->json('meta.total'));

        // Chambres : un MINIMUM, donc cumulé (« 3+ » compte 3 et plus).
        $this->assertSame([['value' => 2, 'count' => 3], ['value' => 3, 'count' => 2]], $facettes['bedrooms']);
        // Quartier : sous les autres filtres, écritures repliées en une option.
        $this->assertSame([['value' => 'Mermoz', 'count' => 2], ['value' => 'Almadies', 'count' => 1]], $facettes['neighborhood']);
    }

    public function test_les_ecritures_d_un_quartier_sont_une_option(): void
    {
        $quartiers = $this->getJson($this->url.'?agency=dakar-immo&facets=neighborhood')->json('meta.facets.neighborhood');

        // « Grand-Yoff » et « Grand Yoff » : une seule option, de deux biens.
        $parCle = [];
        foreach ($quartiers as ['value' => $valeur, 'count' => $compte]) {
            $parCle[CleDeQuartier::de($valeur)] = $compte;
        }
        $this->assertEqualsCanonicalizing(['almadies' => 2, 'mermoz' => 2, 'grand yoff' => 2], $parCle);
        $this->assertCount(3, $quartiers);
    }

    /** AC4 — un slug inexistant, ou une agence hors ligne : liste vide, 200. */
    public function test_ac4_un_slug_inconnu_rend_une_liste_vide(): void
    {
        foreach (['agency=inconnue', 'agent=personne', 'agency=dakar-immo&agent=personne'] as $filtre) {
            $this->getJson($this->url.'?'.$filtre)->assertOk()
                ->assertJsonPath('data', [])
                ->assertJsonPath('meta.total', 0);
        }

        $this->agence->update(['status' => AgencyStatus::Suspended]);
        $this->getJson($this->url.'?agency=dakar-immo')->assertOk()->assertJsonPath('meta.total', 0);
    }

    /** Une recherche dans les biens d'une fiche n'est pas une recherche du catalogue : le journal n'en garde rien. */
    /**
     * Revue de TCK-2517 — un agent rattaché à une agence hors ligne n'a pas de fiche (TCK-600) : `agent=` ne fait pas
     * sortir ses biens PERSONNELS (sans agence), que la suspension, elle, laisse dans l'index.
     */
    public function test_un_agent_d_une_agence_hors_ligne_ne_sort_aucun_bien_personnel(): void
    {
        $horsLigne = Agency::factory()->create(['slug' => 'agence-off']);
        $agent = User::factory()->create(['username' => 'agent-off', 'public_slug' => 'moussa-fall']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $horsLigne->id]);
        $personnel = Property::factory()->published()->create(['agency_id' => null, 'user_id' => $agent->id, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly]);
        $this->indexProperties();

        $this->assertSame(1, $this->getJson($this->url.'?agent=moussa-fall')->json('meta.total'), 'témoin : agence en ligne');

        $horsLigne->update(['status' => AgencyStatus::Suspended]);
        $this->waitForMeilisearch();
        $this->assertContains($personnel->id, array_column($this->getJson($this->url.'?placements=false&per_page=50')->json('data'), 'id'), 'le bien personnel reste public');
        $this->getJson('/api/public/agents/moussa-fall')->assertNotFound();

        foreach (['agent=moussa-fall', 'agent=agent-off'] as $filtre) {
            $this->assertSame(0, $this->getJson($this->url.'?'.$filtre)->assertOk()->json('meta.total'), $filtre);
        }
    }

    public function test_la_recherche_d_une_fiche_n_est_pas_journalisee(): void
    {
        $this->getJson($this->url.'?agency=dakar-immo&type=villa')->assertOk();
        $this->getJson($this->url.'?agent=sokhna-gueye&type=villa')->assertOk();
        $this->assertSame(0, SearchQueryStat::query()->count());

        $this->getJson($this->url.'?type=villa')->assertOk();
        $this->assertSame(1, SearchQueryStat::query()->count());
    }

    public function test_une_facette_inconnue_rend_422(): void
    {
        $this->getJson($this->url.'?facets=type,price')->assertStatus(422);
    }

    /** Sans `facets`, la méta reste les quatre clés canoniques. */
    public function test_sans_demande_aucune_facette(): void
    {
        $this->assertSame(
            ['total', 'per_page', 'current_page', 'last_page'],
            array_keys($this->getJson($this->url.'?agency=dakar-immo')->json('meta')),
        );
    }
}
