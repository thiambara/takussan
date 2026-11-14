<?php

namespace Tests\Feature\Api;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2585 — l'adresse du bien d'une visite : le personnel de l'agence la lit toujours ; le
 * visiteur seulement une fois la visite confirmée (décision du porteur du 2026-11-10, features
 * § 1.3) ; le bailleur, sur ses biens. La carte du visiteur (`visitor_display`) est un outil du
 * personnel.
 */
class PropertyVisitAddressVisibilityTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private Property $bien;

    private User $visiteur;

    private User $proprietaire;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->proprietaire = $this->bailleur($this->x);
        $this->bien = $this->bienDe($this->x, $this->proprietaire);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $this->bien->id,
            'street' => 'Rue 10 x Rue 13',
            'neighborhood' => 'Point E',
            'city' => 'Dakar',
            'latitude' => 14.6928,
            'longitude' => -17.4467,
        ]);
        $this->visiteur = $this->client(['first_name' => 'Awa', 'last_name' => 'Diop', 'phone' => '+221771234567']);
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'visitor_id' => $this->visiteur->id,
            'visitor_name' => 'Awa Diop',
            'visitor_phone' => '+221771234567',
            'status' => VisitStatus::Scheduled,
        ]);
    }

    /** @return array<string, mixed> */
    private function lu(User $user, string $suffixe = '?include=property'): array
    {
        Sanctum::actingAs($user);
        $show = $this->getJson("/api/property-visits/{$this->visite->id}{$suffixe}")->assertOk()->json('data');
        $liste = collect($this->getJson('/api/property-visits'.$suffixe)->assertOk()->json('data'))->firstWhere('id', $this->visite->id);
        $this->assertNotNull($liste, 'la visite doit sortir dans la liste');
        $this->assertSame(array_key_exists('address', $show['property']), array_key_exists('address', $liste['property']), 'la liste et le détail disent la même chose');

        return $show;
    }

    /** AC1 (R) — l'agent lit l'adresse et les coordonnées du bien. */
    public function test_ac1_l_agent_lit_l_adresse_et_les_coordonnees(): void
    {
        $data = $this->lu($this->personnel($this->x));

        $this->assertSame([
            'line' => 'Rue 10 x Rue 13',
            'neighborhood' => 'Point E',
            'city' => 'Dakar',
            'latitude' => 14.6928,
            'longitude' => -17.4467,
        ], $data['property']['address']);
        $this->assertArrayHasKey('cover_url', $data['property']);
        $this->assertNull($data['property']['cover_url']);
    }

    /** La photo du bien sort par le chemin des URL publiques (une conversion, jamais l'original). */
    public function test_la_photo_du_bien_sort_en_cover_url(): void
    {
        $media = $this->bien->addMedia(UploadedFile::fake()->image('facade.jpg'))->toMediaCollection('photos');

        $cover = $this->lu($this->personnel($this->x))['property']['cover_url'];

        $this->assertIsString($cover);
        $this->assertStringNotContainsString($media->getUrl(), $cover);
        $this->assertSame($cover, $this->lu($this->visiteur)['property']['cover_url']);
    }

    /** AC1 (R) — le visiteur ne la lit pas sur une visite en attente, la lit une fois confirmée. */
    public function test_ac1_le_visiteur_la_lit_une_fois_la_visite_confirmee(): void
    {
        $this->assertArrayNotHasKey('address', $this->lu($this->visiteur)['property']);

        $this->visite->update(['status' => VisitStatus::Confirmed]);

        $this->assertSame('Rue 10 x Rue 13', $this->lu($this->visiteur)['property']['address']['line']);
    }

    /** Sous sparse fieldsets, le statut absent de la ligne n'ouvre pas l'adresse : il est relu. */
    public function test_le_statut_retire_des_champs_ne_l_ouvre_pas(): void
    {
        $suffixe = '?include=property&fields[property_visits]=id,property_id&fields[properties]=id,title';

        $this->assertArrayNotHasKey('address', $this->lu($this->visiteur, $suffixe)['property']);
        $this->assertSame('Point E', $this->lu($this->personnel($this->x), $suffixe)['property']['address']['neighborhood']);
    }

    public function test_le_bailleur_lit_l_adresse_de_son_bien_un_agent_d_une_autre_agence_rien(): void
    {
        $this->assertSame('Dakar', $this->lu($this->proprietaire)['property']['address']['city']);

        Sanctum::actingAs($this->personnel($this->agence()));
        $this->getJson("/api/property-visits/{$this->visite->id}?include=property")->assertForbidden();
        $this->assertSame([], $this->getJson('/api/property-visits?include=property')->assertOk()->json('data'));
    }

    /**
     * La carte du visiteur : au personnel ; « revient » compte ses visites non annulées du bien. Au
     * bailleur d'un bien d'agence, réduite et sur une visite sans fiche seulement (TCK-2717).
     */
    public function test_visitor_display_au_personnel_seulement(): void
    {
        $agent = $this->personnel($this->x);
        $this->assertSame(
            ['name' => 'Awa Diop', 'phone' => '+221771234567', 'kind' => 'account', 'visits_on_property' => 1],
            $this->lu($agent)['visitor_display'],
        );

        PropertyVisit::factory()->create(['property_id' => $this->bien->id, 'visitor_id' => $this->visiteur->id, 'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDays(5)]);
        PropertyVisit::factory()->create(['property_id' => $this->bien->id, 'visitor_id' => $this->visiteur->id, 'status' => VisitStatus::Cancelled, 'scheduled_at' => now()->subDays(4)]);
        $this->assertSame(2, $this->lu($agent)['visitor_display']['visits_on_property']);

        $fiche = $this->ficheClient($this->x, null, ['first_name' => 'Abdoulaye', 'last_name' => 'Cissé', 'phone' => '+221770000001']);
        $anonyme = PropertyVisit::factory()->create(['property_id' => $this->bien->id, 'visitor_id' => null, 'customer_id' => $fiche->id, 'visitor_name' => null, 'visitor_phone' => null]);
        Sanctum::actingAs($agent);
        $this->assertSame(
            ['name' => 'Abdoulaye Cissé', 'phone' => '+221770000001', 'kind' => 'customer', 'visits_on_property' => 1],
            $this->getJson("/api/property-visits/{$anonyme->id}")->assertOk()->json('data.visitor_display'),
        );

        $this->assertNull($this->lu($this->visiteur)['visitor_display']);
        // TCK-2717 — le bailleur du bien d'agence lit la carte RÉDUITE de la visite sans fiche : ce que
        // `visitor_*` lui montrent, sans le rang de visite ; sur la visite à fiche, rien.
        $this->assertSame(
            ['name' => 'Awa Diop', 'phone' => '+221771234567', 'kind' => 'account', 'visits_on_property' => null],
            $this->lu($this->proprietaire)['visitor_display'],
        );
        Sanctum::actingAs($this->proprietaire);
        $this->assertNull($this->getJson("/api/property-visits/{$anonyme->id}")->assertOk()->json('data.visitor_display'));
    }

    /**
     * La demande publique faite par le compte, puis la visite planifiée sur la fiche de ce compte :
     * la même personne, « revient » (comme `visits_on_property` d'une réservation, TCK-2593).
     */
    public function test_la_fiche_et_son_compte_sont_la_meme_personne(): void
    {
        $fiche = $this->ficheClient($this->x, $this->visiteur, ['first_name' => 'Awa', 'last_name' => 'Diop']);
        $planifiee = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'customer_id' => $fiche->id, 'visitor_id' => null,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => now()->addDays(4),
        ]);

        Sanctum::actingAs($this->personnel($this->x));
        $this->assertSame(2, $this->getJson("/api/property-visits/{$planifiee->id}")->assertOk()->json('data.visitor_display.visits_on_property'));
        $this->assertSame(2, $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk()->json('data.visitor_display.visits_on_property'));
    }

    /** L'adresse, la photo et la carte du visiteur se lisent pour la page, pas ligne par ligne. */
    public function test_la_liste_coute_le_meme_nombre_de_requetes_quelle_que_soit_sa_taille(): void
    {
        $agent = $this->personnel($this->x);
        $compter = function () use ($agent): int {
            Sanctum::actingAs($agent);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/property-visits?include=property,customer&per_page=50')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        // Chaque forme de visiteur déjà présente (compte, fiche), et une photo : on mesure la taille, pas la forme.
        $this->bien->addMedia(UploadedFile::fake()->image('facade.jpg'))->toMediaCollection('photos');
        PropertyVisit::factory()->create(['property_id' => $this->bien->id, 'visitor_id' => null, 'customer_id' => $this->ficheClient($this->x)->id]);
        $compter();
        $peu = $compter();
        foreach (range(1, 6) as $i) {
            $bien = $this->bienDe($this->x, $this->proprietaire);
            $bien->addMedia(UploadedFile::fake()->image("p{$i}.jpg"))->toMediaCollection('photos');
            Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id]);
            PropertyVisit::factory()->create(['property_id' => $bien->id, 'visitor_id' => $this->client()->id]);
            PropertyVisit::factory()->create(['property_id' => $bien->id, 'visitor_id' => null, 'customer_id' => $this->ficheClient($this->x)->id]);
        }

        $this->assertSame($peu, $compter());
    }
}
