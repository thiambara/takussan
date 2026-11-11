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
