<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PropertyOccupancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2638 (suite back) — un bien à VENDRE n'est ni occupé, ni vacant, ni en préavis : `not_rental`.
 * « Vacant » ne compte que les biens à louer (`contract_type = rent`, toutes périodes), et le résumé
 * ajoute `for_sale`, dont la liste est `filter[occupancy]=not_rental`.
 *
 * Un test par lecteur touché : le scope et son filtre, le bloc `occupancy` de la liste et de la fiche
 * ({@see PropertyOccupancy::attach()}), `vacantForAtLeast` (la tuile des
 * vacances longues) et le résumé, sous la portée de l'agence.
 */
class OccupationHorsLocationTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private const VENTE = ['contract_type' => 'sale', 'rent_period' => null];

    private Agency $agency;

    private User $admin;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->owner = $this->bailleur($this->agency);

        // À louer : occupé, en préavis, vacant depuis 90 jours, jamais loué, courte durée sans bail.
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Loué'), 'Awa Ndiaye');
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Préavis'), 'Fatou Diop', ['status' => LeaseStatus::Terminating]);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Vacant 90 j'), 'Ancien Un', ['status' => LeaseStatus::Expired, 'start_date' => '2025-08-01', 'end_date' => '2026-08-12']);
        $this->bienLoue($this->agency, $this->owner, 'Jamais loué');
        $this->bienLoue($this->agency, $this->owner, 'Courte durée', ['rent_period' => 'daily']);

        // À vendre : sans bail, avec un bail en cours (le locataire reste dans les lieux), en préavis,
        // et un dont le dernier bail a pris fin il y a 90 jours.
        $this->bienLoue($this->agency, $this->owner, 'Vente libre', self::VENTE);
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'Vente occupée', self::VENTE), 'Moussa Fall'), '2026-11-05', PaymentStatus::Late);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Vente en préavis', self::VENTE), 'Ibou Sarr', ['status' => LeaseStatus::Terminating]);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Vente libérée', self::VENTE), 'Ancien Deux', ['status' => LeaseStatus::Expired, 'start_date' => '2025-08-01', 'end_date' => '2026-08-12']);

        // Une autre agence : ses ventes ne comptent jamais ici.
        $ailleurs = $this->agence();
        $this->bienLoue($ailleurs, $this->bailleur($ailleurs), 'Vente d’ailleurs', self::VENTE);
    }

    /** @return list<string> */
    private function titres(User $user, string $occupancy): array
    {
        $this->actingAsApi($user);
        $titres = array_column($this->getJson('/api/properties?per_page=100&fields[properties]=id,title&filter[occupancy]='.$occupancy)->assertOk()->json('data'), 'title');
        sort($titres);

        return $titres;
    }

    /** @return array<string, array<string, mixed>> */
    private function blocs(User $user): array
    {
        $this->actingAsApi($user);
        // Sans `contract_type` dans les champs demandés : l'état ne dépend pas des colonnes lues.
        $data = $this->getJson('/api/properties?per_page=100&include=occupancy&fields[properties]=id,title')->assertOk()->json('data');

        return array_column(array_map(fn (array $p) => ['title' => $p['title'], 'occupancy' => $p['occupancy']], $data), 'occupancy', 'title');
    }

    public function test_le_filtre_separe_les_ventes_des_biens_a_louer(): void
    {
        $this->assertSame(['Vente en préavis', 'Vente libre', 'Vente libérée', 'Vente occupée'], $this->titres($this->admin, 'not_rental'));
        $this->assertSame(['Courte durée', 'Jamais loué', 'Vacant 90 j'], $this->titres($this->admin, 'vacant'));
        $this->assertSame(['Loué', 'Préavis'], $this->titres($this->admin, 'occupied'));
        $this->assertSame(['Préavis'], $this->titres($this->admin, 'notice'));
    }

    public function test_le_bloc_de_la_liste_dit_not_rental_pour_une_vente(): void
    {
        $blocs = $this->blocs($this->admin);

        foreach (['Vente libre', 'Vente occupée', 'Vente en préavis', 'Vente libérée'] as $titre) {
            $this->assertSame('not_rental', $blocs[$titre]['state'], $titre);
            $this->assertNull($blocs[$titre]['vacant_since'], "{$titre} : une vente n'est pas vacante « depuis »");
        }
        // Le bail en cours d'une vente reste un fait : son bloc est servi à qui peut lire le bail.
        $this->assertSame('Moussa', $blocs['Vente occupée']['tenant']['first_name']);
        $this->assertSame('late', $blocs['Vente occupée']['current_month']['status']);
        $this->assertNull($blocs['Vente libre']['lease']);

        $this->assertSame('vacant', $blocs['Vacant 90 j']['state']);
        $this->assertSame('2026-08-12', $blocs['Vacant 90 j']['vacant_since']);
        $this->assertSame('occupied', $blocs['Loué']['state']);
        $this->assertSame('notice', $blocs['Préavis']['state']);
        // Limite connue (Notes) : une courte durée sans bail est vacante, sans date de vacance.
        $this->assertSame('vacant', $blocs['Courte durée']['state']);
        $this->assertNull($blocs['Courte durée']['vacant_since']);
    }

    public function test_la_fiche_dit_not_rental_pour_une_vente(): void
    {
        $vente = Property::query()->where('title', 'Vente occupée')->firstOrFail();
        $this->actingAsApi($this->admin);

        $this->getJson("/api/properties/{$vente->id}?include=occupancy")->assertOk()
            ->assertJsonPath('data.occupancy.state', 'not_rental')
            ->assertJsonPath('data.occupancy.vacant_since', null);
    }

    public function test_le_resume_compte_les_ventes_a_part_et_egale_chaque_liste(): void
    {
        $this->actingAsApi($this->admin);
        $summary = $this->getJson('/api/properties/portfolio-summary')->assertOk()->json('data');

        $this->assertSame(
            ['total' => 9, 'occupied' => 2, 'vacant' => 3, 'vacant_over_60_days' => 1, 'notice' => 1, 'for_sale' => 4],
            array_intersect_key($summary, array_flip(['total', 'occupied', 'vacant', 'notice', 'for_sale', 'vacant_over_60_days'])),
        );
        $this->assertSame($summary['total'], $summary['occupied'] + $summary['vacant'] + $summary['for_sale'], 'occupés + vacants + à vendre = tous');
        foreach (['occupied' => 'occupied', 'vacant' => 'vacant', 'notice' => 'notice', 'for_sale' => 'not_rental'] as $tuile => $etat) {
            $this->assertCount($summary[$tuile], $this->titres($this->admin, $etat), "tuile {$tuile}");
        }
        // Décision du porteur (Q2a) : le retard de loyer ne dépend pas du contrat.
        $this->assertSame(1, $summary['rent_late']);
    }

    public function test_le_bailleur_lit_les_memes_regles_sous_sa_portee(): void
    {
        $this->assertSame(['Vente en préavis', 'Vente libre', 'Vente libérée', 'Vente occupée'], $this->titres($this->owner, 'not_rental'));

        $this->actingAsApi($this->owner);
        $this->getJson('/api/properties/portfolio-summary')->assertOk()
            ->assertJsonPath('data.for_sale', 4)
            ->assertJsonPath('data.vacant', 3);
    }

    public function test_une_valeur_inconnue_reste_refusee(): void
    {
        $this->actingAsApi($this->admin);
        $this->getJson('/api/properties?filter[occupancy]=for_sale')->assertStatus(422);
    }
}
