<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2585 — `filter[search]` (nom du visiteur, téléphone, titre du bien) et `filter[day]` (jour
 * de Dakar). Le nom et le téléphone ne se cherchent que là où le lecteur les lit.
 */
class PropertyVisitSearchFilterTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private Property $bien;

    private User $proprietaire;

    private PropertyVisit $parFiche;

    private PropertyVisit $parCompte;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->proprietaire = $this->bailleur($this->x);
        $this->bien = $this->bienDe($this->x, $this->proprietaire);
        $this->bien->update(['title' => 'Villa Almadies']);

        $this->parFiche = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => null,
            'customer_id' => $this->ficheClient($this->x)->id,
            'visitor_name' => 'Abdoulaye Cissé', 'visitor_phone' => '+221770000001',
            'scheduled_at' => CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2)->setTime(10, 0)->utc(),
        ]);
        $this->parCompte = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->x, $this->proprietaire)->id,
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567',
            'scheduled_at' => CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->setTime(23, 30)->utc(),
            'status' => VisitStatus::Confirmed,
        ]);
    }

    /** @return list<int> */
    private function ids(User $user, array $filter): array
    {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/property-visits?'.http_build_query(['filter' => $filter]))->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    public function test_le_personnel_cherche_par_nom_telephone_et_titre(): void
    {
        $agent = $this->personnel($this->x);

        $this->assertSame([$this->parFiche->id], $this->ids($agent, ['search' => 'CISSÉ']));
        $this->assertSame([$this->parFiche->id], $this->ids($agent, ['search' => 'cissé']));
        $this->assertSame([$this->parCompte->id], $this->ids($agent, ['search' => '77 123']));
        $this->assertSame([$this->parFiche->id], $this->ids($agent, ['search' => 'almadies']));
        $this->assertSame([], $this->ids($agent, ['search' => 'personne']));
        // Une virgule n'est pas un séparateur de valeurs : « Diop, Awa » est UNE recherche.
        $this->assertSame([], $this->ids($agent, ['search' => 'Diop, Awa']));
        $this->assertSame([$this->parCompte->id], $this->ids($agent, ['search' => 'Awa D']));
        // Les jokers SQL sont des caractères : `%` ne trouve pas tout.
        $this->assertSame([], $this->ids($agent, ['search' => '%']));
    }

    /** Le bailleur ne lit pas le nom d'un client de l'agence : il ne le trouve pas davantage. */
    public function test_le_bailleur_ne_trouve_pas_le_client_de_l_agence_par_son_nom(): void
    {
        $this->assertSame([], $this->ids($this->proprietaire, ['search' => 'Cissé']));
        $this->assertSame([], $this->ids($this->proprietaire, ['search' => '770000001']));
        $this->assertSame([$this->parFiche->id], $this->ids($this->proprietaire, ['search' => 'Villa']));
        $this->assertSame([$this->parCompte->id], $this->ids($this->proprietaire, ['search' => 'Awa']));
    }

    /**
     * TCK-2587 — la console affiche le nom de la FICHE client (`visitor_display`) : la recherche le
     * trouve, mot par mot (prénom ou nom), ainsi que son téléphone, et les compteurs suivent la liste.
     */
    public function test_le_personnel_trouve_la_visite_par_le_nom_et_le_telephone_de_sa_fiche(): void
    {
        $fiche = $this->ficheClient($this->x, null, ['first_name' => 'Mariama', 'last_name' => 'Ndiayé', 'phone' => '+221765554433']);
        $parFicheSeule = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => null, 'customer_id' => $fiche->id,
            'visitor_name' => null, 'visitor_phone' => null,
        ]);
        $agent = $this->personnel($this->x);

        foreach (['mariama', 'NDIAYÉ', 'Mariama Ndi', 'ndiayé mariama', '76 555 44'] as $recherche) {
            $this->assertSame([$parFicheSeule->id], $this->ids($agent, ['search' => $recherche]), $recherche);
        }
        // Chaque mot doit se trouver dans la fiche : « Mariama Diop » n'est pas Mariama Ndiayé.
        $this->assertSame([], $this->ids($agent, ['search' => 'Mariama Diop']));

        // Les compteurs sous la même recherche : « Toutes » vaut le total de la liste.
        foreach (['mariama', 'Ndiayé'] as $recherche) {
            $total = $this->getJson('/api/property-visits?'.http_build_query(['filter' => ['search' => $recherche]]))->json('meta.total');
            $this->assertSame(1, $total);
            $this->assertSame($total, $this->getJson('/api/property-visits/counts?'.http_build_query(['filter' => ['search' => $recherche]]))->assertOk()->json('data.all'));
        }
    }

    /**
     * TCK-2587 (contre-vérification, m1) — un numéro recopié à l'international, « 00221 … », se trouve
     * comme « +221 … » : sur le téléphone de la fiche comme sur le téléphone saisi de la visite.
     */
    public function test_un_numero_en_00221_trouve_la_fiche_et_le_visiteur(): void
    {
        $fiche = $this->ficheClient($this->x, null, ['first_name' => 'Mariama', 'last_name' => 'Ndiayé', 'phone' => '+221765554433']);
        $parFicheSeule = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => null, 'customer_id' => $fiche->id,
            'visitor_name' => null, 'visitor_phone' => null,
        ]);
        $agent = $this->personnel($this->x);

        foreach (['00221 76 555 44 33', '00221765554433', '+221 76 555 44 33', '765554433'] as $recherche) {
            $this->assertSame([$parFicheSeule->id], $this->ids($agent, ['search' => $recherche]), $recherche);
        }
        $this->assertSame([$this->parCompte->id], $this->ids($agent, ['search' => '00221 77 123 45 67']));

        // Une ligne ancienne, écrite avant la normalisation (sans indicatif) : la saisie brute la trouve encore.
        $ancienne = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => null, 'customer_id' => null,
            'visitor_name' => 'Ousmane Fall', 'visitor_phone' => '781112233',
        ]);
        $this->assertSame([$ancienne->id], $this->ids($agent, ['search' => '781112233']));
    }

    /** TCK-2587 — le nom d'une fiche ne se cherche ni hors de son agence, ni par le bailleur. */
    public function test_le_nom_de_la_fiche_ne_fuit_ni_vers_une_autre_agence_ni_vers_le_bailleur(): void
    {
        $nom = ['first_name' => 'Mariama', 'last_name' => 'Ndiayé'];
        $deX = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => null, 'visitor_name' => null, 'visitor_phone' => null,
            'customer_id' => $this->ficheClient($this->x, null, $nom)->id,
        ]);
        $y = $this->agence();
        $deY = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($y)->id, 'visitor_id' => null, 'visitor_name' => null, 'visitor_phone' => null,
            'customer_id' => $this->ficheClient($y, null, $nom)->id,
        ]);

        $this->assertSame([$deX->id], $this->ids($this->personnel($this->x), ['search' => 'Mariama']));
        $this->assertSame([$deY->id], $this->ids($this->personnel($y), ['search' => 'Mariama']));
        $this->assertSame([], $this->ids($this->proprietaire, ['search' => 'Mariama']));
        $this->assertSame(0, $this->getJson('/api/property-visits/counts?filter[search]=Mariama')->assertOk()->json('data.all'));
    }

    /** Le jour de Dakar, début inclus, lendemain exclu ; une valeur mal formée → 422. */
    public function test_le_jour_de_dakar(): void
    {
        $agent = $this->personnel($this->x);
        $jour = fn (int $n) => CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays($n)->format('Y-m-d');

        $this->assertSame([$this->parFiche->id], $this->ids($agent, ['day' => $jour(2)]));
        $this->assertSame([$this->parCompte->id], $this->ids($agent, ['day' => $jour(3)]));
        $this->assertSame([], $this->ids($agent, ['day' => $jour(4)]));

        foreach (['2026-13-01', 'demain', '2026-11-11T10:00'] as $mauvais) {
            $this->getJson('/api/property-visits?filter[day]='.urlencode($mauvais))->assertStatus(422)->assertJsonValidationErrors('filter.day');
        }
        $this->getJson('/api/property-visits?filter[day][]=2026-11-11')->assertStatus(422);
    }
}
