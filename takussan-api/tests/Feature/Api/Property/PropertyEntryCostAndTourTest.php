<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PropertyDuplicationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-598 — le coût d'entrée d'une location mensuelle (V9, contrainte 8, AC8), la confiance (V8,
 * contrainte 9, AC9) et la visite virtuelle (V19, contrainte 13, AC15).
 *
 * Chaque écriture se vérifie sur la valeur RELUE (`PropertyWritableFieldsTest`) : une règle absente
 * ne produit pas d'erreur, elle produit un `validated()` amputé et un 200 parfaitement vert.
 */
class PropertyEntryCostAndTourTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $this->agency->id]);
    }

    /** @return array<string, mixed> */
    private function locationMensuelle(array $plus = []): array
    {
        return $plus + [
            'title' => 'Appartement F3 à Mermoz',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
            'agency_id' => $this->agency->id,
        ];
    }

    private function bienPublicEnLocation(array $attributs = []): Property
    {
        return Property::factory()->published()->create($attributs + [
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 300_000,
        ]);
    }

    /** AC8 — 300 000 F, 2 mois d'avance, 2 de caution, 1 de frais, 10 000 F de charges → 1 520 000. */
    public function test_le_cout_d_entree_d_une_location_mensuelle(): void
    {
        $reponse = $this->postJson('/api/properties', $this->locationMensuelle([
            'advance_months' => 2,
            'deposit_months' => 2,
            'agency_fee_months' => 1,
            'monthly_charges' => 10_000,
        ]))->assertCreated();

        $bien = Property::query()->findOrFail($reponse->json('data.id'));
        $this->assertSame(2, $bien->advance_months);
        $this->assertSame(2, $bien->deposit_months);

        $bien->forceFill(['status' => 'available', 'visibility' => 'public', 'published_at' => now()])->save();

        $fiche = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk();
        $this->assertEquals(1_520_000, $fiche->json('data.entry_cost.total'));
        $this->assertSame(2, $fiche->json('data.entry_cost.advance_months'));
        $this->assertEquals(10_000, $fiche->json('data.entry_cost.monthly_charges'));
    }

    /** Le total est arrondi à l'UNITÉ en franc CFA : un demi-mois de frais sur un loyer impair. */
    public function test_le_total_n_a_pas_de_decimale_en_franc_cfa(): void
    {
        $bien = $this->bienPublicEnLocation(['price' => 150_001, 'agency_fee_months' => 0.5]);

        $total = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()->json('data.entry_cost.total');

        $this->assertEquals(75_001, $total);
        $this->assertSame((float) round((float) $total), (float) $total);
    }

    /** L'état de fabrique `withEntryCost()` produit un bloc complet, que la fiche émet. */
    public function test_l_etat_de_fabrique_produit_un_cout_d_entree(): void
    {
        $bien = Property::factory()->published()->withEntryCost()->create(['price' => 200_000]);

        $cout = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()->json('data.entry_cost');

        $this->assertSame(2, $cout['deposit_months']);
        $this->assertGreaterThan(0, $cout['total']);
    }

    /** Les quatre vides → `entry_cost: null`, et non un bloc à zéro. */
    public function test_sans_rien_de_renseigne_le_cout_d_entree_est_absent(): void
    {
        $bien = $this->bienPublicEnLocation();

        $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()->assertJsonPath('data.entry_cost', null);
    }

    /** AC8 — sur une vente, `entry_cost` vaut null et envoyer `deposit_months` rend 422. */
    public function test_hors_location_mensuelle_les_champs_sont_refuses(): void
    {
        $this->postJson('/api/properties', $this->locationMensuelle([
            'contract_type' => 'sale',
            'rent_period' => null,
            'deposit_months' => 2,
        ]))->assertUnprocessable()->assertJsonValidationErrors(['deposit_months']);

        $this->postJson('/api/properties', $this->locationMensuelle([
            'rent_period' => 'weekly',
            'agency_fee_months' => 1,
        ]))->assertUnprocessable()->assertJsonValidationErrors(['agency_fee_months']);

        $vente = Property::factory()->published()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'contract_type' => ContractType::Sale,
            'rent_period' => null,
            // Des colonnes héritées d'une ancienne location : la vente ne les émet pas.
            'deposit_months' => 2,
        ]);
        $this->getJson("/api/public/properties/{$vente->slug}")->assertOk()->assertJsonPath('data.entry_cost', null);
    }

    /** La modification juge le contrat RÉSULTANT : envoyé, sinon celui du bien. */
    public function test_la_modification_juge_le_contrat_resultant(): void
    {
        $location = $this->bienPublicEnLocation();
        $this->putJson("/api/properties/{$location->id}", ['deposit_months' => 3])->assertOk();
        $this->assertSame(3, $location->refresh()->deposit_months);

        $this->putJson("/api/properties/{$location->id}", ['contract_type' => 'sale', 'deposit_months' => 1])
            ->assertUnprocessable()->assertJsonValidationErrors(['deposit_months']);
    }

    /** Bornes : mois de 0 à 24, montants ≥ 0, deux décimales au plus pour les frais. */
    public function test_les_bornes(): void
    {
        $this->postJson('/api/properties', $this->locationMensuelle([
            'deposit_months' => 25,
            'advance_months' => -1,
            'agency_fee_months' => 0.555,
            'monthly_charges' => -10,
        ]))->assertUnprocessable()->assertJsonValidationErrors([
            'deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges',
        ]);
    }

    /** La duplication d'un bien copie son coût d'entrée et sa visite virtuelle. */
    public function test_la_duplication_copie_le_cout_d_entree(): void
    {
        $source = $this->bienPublicEnLocation([
            'deposit_months' => 2,
            'advance_months' => 1,
            'agency_fee_months' => 0.5,
            'monthly_charges' => 15_000,
            'virtual_tour_url' => 'https://my.matterport.com/show/?m=abc',
        ]);

        $copie = app(PropertyDuplicationService::class)->duplicate($source, $this->agent);

        $this->assertSame(2, $copie->deposit_months);
        $this->assertSame(1, $copie->advance_months);
        $this->assertEquals(0.5, $copie->agency_fee_months);
        $this->assertEquals(15_000, $copie->monthly_charges);
        $this->assertSame('https://my.matterport.com/show/?m=abc', $copie->virtual_tour_url);
    }

    /** AC15 — un lien https d'un hôte autorisé est accepté, et sort au premier niveau et dans `media_extra`. */
    public function test_une_visite_virtuelle_autorisee_est_acceptee_et_emise(): void
    {
        $bien = $this->bienPublicEnLocation();

        $this->putJson("/api/properties/{$bien->id}", ['virtual_tour_url' => 'https://www.youtube.com/watch?v=abc'])
            ->assertOk();

        $this->getJson("/api/public/properties/{$bien->slug}")
            ->assertOk()
            ->assertJsonPath('data.virtual_tour_url', 'https://www.youtube.com/watch?v=abc')
            ->assertJsonPath('data.media_extra.virtual_tour_url', 'https://www.youtube.com/watch?v=abc');
    }

    /** AC15 — refusés : `http://`, un hôte hors liste, un suffixe, des identifiants d'URL, `javascript:`. */
    public function test_une_visite_virtuelle_hors_liste_est_refusee(): void
    {
        $bien = $this->bienPublicEnLocation();

        foreach ([
            'http://www.youtube.com/watch?v=abc',
            'https://evil.example/tour',
            'https://evilyoutube.com/watch?v=abc',
            'https://youtube.com.evil.example/watch',
            'https://youtube.com@evil.example/watch',
            'javascript:alert(1)',
        ] as $url) {
            $this->putJson("/api/properties/{$bien->id}", ['virtual_tour_url' => $url])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['virtual_tour_url']);
        }

        $this->assertNull($bien->refresh()->virtual_tour_url);
    }

    /**
     * AC9 — `primary_contact.phone_verified` et `owner.phone_verified` sont vrais SI ET SEULEMENT SI
     * `phone_verified_at` est renseigné ; ni le numéro, ni la date, ni rien de KYC ne sortent.
     */
    public function test_le_telephone_verifie_sort_en_booleen_seulement(): void
    {
        $verifie = User::factory()->create(['phone_verified_at' => now()]);
        $nonVerifie = User::factory()->create(['phone_verified_at' => null]);

        $bienVerifie = Property::factory()->published()->create(['user_id' => $verifie->id]);
        $bienNonVerifie = Property::factory()->published()->create(['user_id' => $nonVerifie->id]);

        $oui = $this->getJson("/api/public/properties/{$bienVerifie->slug}")->assertOk();
        $non = $this->getJson("/api/public/properties/{$bienNonVerifie->slug}")->assertOk();

        $oui->assertJsonPath('data.primary_contact.phone_verified', true)
            ->assertJsonPath('data.owner.phone_verified', true);
        $non->assertJsonPath('data.primary_contact.phone_verified', false)
            ->assertJsonPath('data.owner.phone_verified', false);

        foreach ([$oui, $non] as $reponse) {
            foreach (['primary_contact', 'owner'] as $bloc) {
                $cles = array_keys((array) $reponse->json("data.{$bloc}"));
                $this->assertNotContains('phone', $cles);
                $this->assertNotContains('phone_verified_at', $cles);
                $this->assertSame([], preg_grep('/^kyc/i', $cles));
            }
            $this->assertStringNotContainsString((string) $verifie->phone, $reponse->getContent());
        }
    }
}
