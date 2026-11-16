<?php

namespace Tests\Feature\Api;

use App\Models\Address;
use App\Models\Agency;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2884 — la boîte lit le QUARTIER du bien demandé (`include=property.address`), jamais la rue,
 * et sans une requête par ligne.
 */
class ContactLeadNeighborhoodTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $destinataire;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->destinataire = $this->personnel($this->x);
    }

    private function demandeSurUnBienA(string $quartier): PropertyContactLead
    {
        $bien = $this->bienDe($this->x);
        Address::factory()->create([
            'addressable_type' => $bien->getMorphClass(),
            'addressable_id' => $bien->id,
            'neighborhood' => $quartier,
            'street' => 'Rue 10 x Corniche',
        ]);

        return PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $this->destinataire->id,
        ]);
    }

    /**
     * La requête de la console, champs clairsemés compris. L'adresse n'a pas de `fields[…]` : la
     * ressource n'en émet que le quartier, et un `select` partiel sur un `morphOne` qui omettrait
     * `addressable_id` rendrait `address: null` sans erreur.
     */
    private function urlDeLaBoite(): string
    {
        return '/api/contact-leads?'.http_build_query([
            'fields' => [
                'property_contact_leads' => 'id,property_id,name,handled_at,created_at',
                'properties' => 'id,title,slug',
            ],
            'include' => 'property.address,recipient',
            'per_page' => 20,
        ]);
    }

    private function requetesPour(string $url): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson($url)->assertOk();
        $compte = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $compte;
    }

    /** AC3 — chaque ligne porte le quartier de son bien ; la rue n'en sort pas. */
    public function test_ac3_la_liste_rend_le_quartier_de_chaque_bien(): void
    {
        $mermoz = $this->demandeSurUnBienA('Mermoz');
        $ouakam = $this->demandeSurUnBienA('Ouakam');
        $sansAdresse = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($this->x)->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $this->destinataire->id,
        ]);

        Sanctum::actingAs($this->destinataire);
        $lignes = collect($this->getJson($this->urlDeLaBoite())->assertOk()->json('data'))->keyBy('id');

        $this->assertSame(['neighborhood' => 'Mermoz'], $lignes[$mermoz->id]['property']['address']);
        $this->assertSame(['neighborhood' => 'Ouakam'], $lignes[$ouakam->id]['property']['address']);
        $this->assertNull($lignes[$sansAdresse->id]['property']['address']);
        $this->assertStringNotContainsString('Corniche', json_encode($lignes->all()));

        // Sans `include=property.address`, la forme d'avant : pas de clé `address`.
        $sans = collect($this->getJson('/api/contact-leads?include=property')->assertOk()->json('data'))->keyBy('id');
        $this->assertArrayNotHasKey('address', $sans[$mermoz->id]['property']);
    }

    /** AC3 — le nombre de requêtes ne dépend pas du nombre de lignes. */
    public function test_ac3_sans_requete_par_ligne(): void
    {
        Sanctum::actingAs($this->destinataire);

        $this->demandeSurUnBienA('Mermoz');
        $this->demandeSurUnBienA('Fann');
        // Un premier appel à blanc : la résolution des capacités de l'appelant est mémorisée.
        $this->requetesPour($this->urlDeLaBoite());
        $pourDeux = $this->requetesPour($this->urlDeLaBoite());

        foreach (['Ngor', 'Yoff', 'Plateau'] as $quartier) {
            $this->demandeSurUnBienA($quartier);
        }
        $pourCinq = $this->requetesPour($this->urlDeLaBoite());

        $this->assertSame($pourDeux, $pourCinq);
    }

    /** La fiche d'une demande sert le quartier aussi, sous la même lecture. */
    public function test_la_fiche_rend_le_quartier(): void
    {
        $lead = $this->demandeSurUnBienA('Point E');

        Sanctum::actingAs($this->destinataire);
        $this->getJson("/api/contact-leads/{$lead->id}")
            ->assertOk()
            ->assertJsonPath('data.property.address', ['neighborhood' => 'Point E']);

        Sanctum::actingAs($this->personnel($this->agence()));
        $this->getJson("/api/contact-leads/{$lead->id}")->assertForbidden();
    }
}
