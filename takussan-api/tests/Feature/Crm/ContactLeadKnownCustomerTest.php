<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2582 (ADR-0101) — la demande dit d'avance « déjà client » : `known_customer` est la fiche de
 * l'agence de la demande au même téléphone normalisé ou au même e-mail replié, avec son nombre de
 * visites ; `null` si la fiche est dans une autre agence ; absente pour qui n'est pas du personnel ;
 * calculée pour la page entière en un nombre de requêtes qui ne dépend pas de sa taille.
 */
class ContactLeadKnownCustomerTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private function admin(Agency $agency): User
    {
        return $this->personnel($agency, 'agency_admin');
    }

    /** AC3 — le même téléphone qu'une fiche de l'agence, saisi autrement, rend la fiche et ses visites. */
    public function test_ac3_meme_telephone_rend_la_fiche_et_ses_visites(): void
    {
        $x = $this->agence();
        $admin = $this->admin($x);
        $bien = $this->bienDe($x);
        $awa = $this->ficheClient($x, null, ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '77 810 35 38', 'email' => null]);
        PropertyVisit::factory()->count(2)->create(['property_id' => $bien->id, 'customer_id' => $awa->id]);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id, 'phone' => '+221778103538', 'email' => null]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/contact-leads')
            ->assertOk()
            ->assertJsonPath('data.0.id', $lead->id)
            ->assertJsonPath('data.0.known_customer.id', $awa->id)
            ->assertJsonPath('data.0.known_customer.name', 'Awa Ndiaye')
            ->assertJsonPath('data.0.known_customer.visits_count', 2);

        // Sous sparse fieldsets sans l'agence ni les coordonnées (ce que le front envoie toujours) :
        // la demande est relue. `known_customer` n'est pas une colonne et ne se demande pas.
        $this->getJson('/api/contact-leads?fields[property_contact_leads]=id,name')
            ->assertOk()
            ->assertJsonPath('data.0.known_customer.name', 'Awa Ndiaye');

        // Le détail d'une demande, sans l'amorce de la liste, rend la même chose.
        $this->getJson("/api/contact-leads/{$lead->id}")
            ->assertOk()
            ->assertJsonPath('data.known_customer.name', 'Awa Ndiaye');
    }

    /** Le même e-mail, à la casse près, vaut aussi. */
    public function test_meme_email_replie(): void
    {
        $x = $this->agence();
        $admin = $this->admin($x);
        $awa = $this->ficheClient($x, null, ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => null, 'email' => 'Awa.Ndiaye@Example.com']);
        PropertyContactLead::factory()->create(['property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'phone' => null, 'email' => 'awa.ndiaye@example.com']);

        Sanctum::actingAs($admin);
        $this->getJson('/api/contact-leads')->assertOk()->assertJsonPath('data.0.known_customer.id', $awa->id);
    }

    /** AC3 — la fiche au même téléphone dans une AUTRE agence ne compte pas : `null`. */
    public function test_ac3_une_fiche_d_une_autre_agence_rend_null(): void
    {
        $x = $this->agence();
        $admin = $this->admin($x);
        $this->ficheClient($this->agence(), null, ['phone' => '+221778103538', 'email' => null]);
        PropertyContactLead::factory()->create(['property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'phone' => '+221778103538', 'email' => null]);

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/contact-leads')->assertOk();
        $this->assertArrayHasKey('known_customer', $response->json('data.0'));
        $this->assertNull($response->json('data.0.known_customer'));
    }

    /** Le bailleur destinataire lit la demande sans la clé : il ne sonde pas le fichier de l'agence. */
    public function test_le_bailleur_destinataire_ne_recoit_pas_la_cle(): void
    {
        $x = $this->agence();
        $bailleur = $this->bailleur($x);
        $bien = $this->bienDe($x, $bailleur);
        $this->ficheClient($x, null, ['phone' => '+221778103538', 'email' => null]);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $bailleur->id, 'phone' => '+221778103538']);

        Sanctum::actingAs($bailleur);
        $response = $this->getJson("/api/contact-leads/{$lead->id}")->assertOk();
        $this->assertArrayNotHasKey('known_customer', $response->json('data'));
    }

    /** AC3 — 20 demandes en page coûtent le même nombre de requêtes que 2. */
    public function test_ac3_le_nombre_de_requetes_ne_depend_pas_de_la_page(): void
    {
        $x = $this->agence();
        $admin = $this->admin($x);
        $bien = $this->bienDe($x);

        $mesure = function (int $n) use ($x, $admin, $bien): int {
            PropertyContactLead::query()->delete();
            Customer::query()->forceDelete();
            for ($i = 0; $i < $n; $i++) {
                $phone = sprintf('+2217781%05d', $i);
                $fiche = $this->ficheClient($x, null, ['phone' => $phone, 'email' => null]);
                PropertyVisit::factory()->create(['property_id' => $bien->id, 'customer_id' => $fiche->id]);
                PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id, 'phone' => $phone, 'email' => null]);
            }

            Sanctum::actingAs($admin);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $response = $this->getJson('/api/contact-leads?per_page=50')->assertOk();
            $count = count(DB::getQueryLog());
            DB::disableQueryLog();

            // Chaque demande de la page trouve sa fiche : sinon la mesure ne dit rien.
            $this->assertCount($n, $response->json('data'));
            foreach ($response->json('data') as $row) {
                $this->assertNotNull($row['known_customer']['id'] ?? null);
                $this->assertSame(1, $row['known_customer']['visits_count']);
            }

            return $count;
        };

        // Un premier passage chauffe ce que la requête mémorise une fois par processus.
        $mesure(2);
        $deux = $mesure(2);
        $vingt = $mesure(20);

        $this->assertSame($deux, $vingt, "2 demandes : {$deux} requêtes ; 20 demandes : {$vingt}");
    }
}
