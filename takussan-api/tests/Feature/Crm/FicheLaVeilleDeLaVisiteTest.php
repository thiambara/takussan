<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2761 — la fiche, la veille de la visite : l'adresse du bien de chaque visite à venir
 * (`fields[customers]=visit_places`, rendue sur `upcoming_visits[].address`), et le marqueur d'une
 * recherche déduite du bien d'une demande (`seeking_deduced_at`).
 *
 * Deux barrières à l'adresse, chacune éprouvée seule : la fiche (le lecteur des visites de la fiche,
 * {@see Customer::criteriaBelongTo()}) et la visite (le lecteur de l'adresse du bien : super-admin,
 * personnel de l'agence DU BIEN, propriétaire du bien).
 */
class FicheLaVeilleDeLaVisiteTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function bienAvecAdresse(?Agency $agence, ?User $proprietaire = null, bool $coordonnees = true): Property
    {
        $bien = $this->bienDe($agence, $proprietaire);
        $bien->address()->create([
            'street' => 'Rue OU-48', 'neighborhood' => 'Ouakam', 'city' => 'Dakar', 'country' => 'SN',
            'latitude' => $coordonnees ? 14.7234567 : null, 'longitude' => $coordonnees ? -17.4876543 : null,
        ]);

        return $bien->fresh();
    }

    private function visite(Customer $fiche, Property $bien, VisitStatus $statut = VisitStatus::Confirmed): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'customer_id' => $fiche->id,
            'status' => $statut, 'scheduled_at' => now()->addDay(),
        ]);
    }

    private function fiche(int $id, string $fields = 'next_action,visit_places'): array
    {
        return $this->getJson("/api/customers/{$id}?fields[customers]={$fields}&include=upcomingVisits")
            ->assertOk()->json('data');
    }

    // ── AC1 — l'adresse et les coordonnées du bien ────────────────────────────────────────────────

    public function test_ac1_le_personnel_lit_l_adresse_et_les_coordonnees_du_bien(): void
    {
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $fiche = $this->ficheClient($agence, null, ['added_by_id' => $agent->id]);
        $this->visite($fiche, $this->bienAvecAdresse($agence));

        Sanctum::actingAs($agent);
        $data = $this->fiche($fiche->id);

        $this->assertSame([
            'line' => 'Rue OU-48', 'neighborhood' => 'Ouakam', 'city' => 'Dakar',
            'latitude' => 14.7234567, 'longitude' => -17.4876543,
        ], $data['upcoming_visits'][0]['address']);
        // Rendue SUR la visite, jamais en clé de tête.
        $this->assertArrayNotHasKey('visit_places', $data);
    }

    public function test_ac1_sans_coordonnees_l_adresse_reste_et_les_coordonnees_sont_nulles(): void
    {
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $fiche = $this->ficheClient($agence, null, ['added_by_id' => $agent->id]);
        $this->visite($fiche, $this->bienAvecAdresse($agence, coordonnees: false));

        Sanctum::actingAs($agent);
        $adresse = $this->fiche($fiche->id)['upcoming_visits'][0]['address'];

        $this->assertSame('Rue OU-48', $adresse['line']);
        $this->assertNull($adresse['latitude']);
        $this->assertNull($adresse['longitude']);
    }

    public function test_l_adresse_ne_part_que_demandee(): void
    {
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $fiche = $this->ficheClient($agence, null, ['added_by_id' => $agent->id]);
        $this->visite($fiche, $this->bienAvecAdresse($agence));

        Sanctum::actingAs($agent);
        $data = $this->fiche($fiche->id, 'next_action');

        $this->assertCount(1, $data['upcoming_visits']);
        $this->assertArrayNotHasKey('address', $data['upcoming_visits'][0]);
    }

    // ── AC4 — le bailleur auteur ne reçoit rien ───────────────────────────────────────────────────

    /**
     * Barrière de la FICHE seule : le bailleur auteur est propriétaire du bien visité (la barrière
     * de la visite le laisserait passer) ; il ne lit pas les visites de sa fiche, donc rien.
     */
    public function test_ac4_le_bailleur_auteur_proprietaire_du_bien_ne_recoit_aucune_adresse(): void
    {
        $agence = $this->agence();
        $bailleur = $this->bailleur($agence);
        $fiche = $this->ficheClient($agence, null, ['added_by_id' => $bailleur->id]);
        $this->visite($fiche, $this->bienAvecAdresse($agence, $bailleur));

        Sanctum::actingAs($bailleur);
        $data = $this->fiche($fiche->id);

        $this->assertArrayNotHasKey('upcoming_visits', $data);
        $this->assertStringNotContainsString('OU-48', json_encode($data));
        $this->assertStringNotContainsString('14.72', json_encode($data));
    }

    /**
     * Barrière de la VISITE seule : le personnel de l'agence de la fiche lit la visite, mais le bien
     * est celui d'une AUTRE agence, dont il ne lit pas l'adresse.
     */
    public function test_le_personnel_ne_lit_pas_l_adresse_d_un_bien_d_une_autre_agence(): void
    {
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $fiche = $this->ficheClient($agence, null, ['added_by_id' => $agent->id]);
        $this->visite($fiche, $this->bienAvecAdresse($this->agence()));

        Sanctum::actingAs($agent);
        $data = $this->fiche($fiche->id);

        $this->assertCount(1, $data['upcoming_visits']);
        $this->assertArrayNotHasKey('address', $data['upcoming_visits'][0]);
        $this->assertStringNotContainsString('OU-48', json_encode($data));
    }

    /**
     * La règle de l'adresse du bien d'une visite (`PersonnelDeLAgence::personnelActifDe`) : l'agent de X
     * qui agit sous son profil de Y lit les visites de sa fiche de X (`staffAgencyIds`), mais pas
     * l'adresse du bien de X — `GET /property-visits/{id}` ne la lui donne pas non plus.
     */
    public function test_sous_le_profil_d_une_autre_agence_l_adresse_ne_part_pas(): void
    {
        $x = $this->agence();
        $y = $this->agence();
        $agent = $this->personnel($x);
        $profilY = AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $y->id]);
        $fiche = $this->ficheClient($x, null, ['added_by_id' => $agent->id]);
        $this->visite($fiche, $this->bienAvecAdresse($x));

        Sanctum::actingAs($agent);
        $data = $this->withHeaders(['X-Profile-Id' => "agent:{$profilY->id}"])
            ->getJson("/api/customers/{$fiche->id}?fields[customers]=next_action,visit_places&include=upcomingVisits")
            ->assertOk()->json('data');

        $this->assertCount(1, $data['upcoming_visits']);
        $this->assertArrayNotHasKey('address', $data['upcoming_visits'][0]);
    }

    /** L'auteur d'une fiche sans agence lit les visites de sa fiche, et l'adresse de SON bien. */
    public function test_l_auteur_d_une_fiche_sans_agence_lit_l_adresse_de_son_bien(): void
    {
        $particulier = User::factory()->create();
        $fiche = Customer::factory()->create(['agency_id' => null, 'added_by_id' => $particulier->id]);
        $this->visite($fiche, $this->bienAvecAdresse(null, $particulier));

        Sanctum::actingAs($particulier);
        $data = $this->fiche($fiche->id);

        $this->assertSame('Rue OU-48', $data['upcoming_visits'][0]['address']['line']);
    }

    public function test_la_liste_lit_les_adresses_en_un_nombre_de_requetes_constant(): void
    {
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $creer = function (int $n) use ($agence, $agent): void {
            for ($i = 0; $i < $n; $i++) {
                $fiche = $this->ficheClient($agence, null, ['added_by_id' => $agent->id]);
                $this->visite($fiche, $this->bienAvecAdresse($agence));
            }
        };
        $compter = function (int $attendues) use ($agent): int {
            Sanctum::actingAs($agent);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $data = $this->getJson('/api/customers?per_page=20&fields[customers]=id,visit_places&include=upcomingVisits')
                ->assertOk()->json('data');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();
            $this->assertCount($attendues, $data);
            foreach ($data as $ligne) {
                $this->assertSame('Rue OU-48', $ligne['upcoming_visits'][0]['address']['line']);
            }

            return $n;
        };

        $creer(2);
        $compter(2);
        $deux = $compter(2);
        $creer(6);
        $this->assertSame($deux, $compter(8));
    }

    // ── AC3 — la recherche déduite d'une demande ──────────────────────────────────────────────────

    private function pieceDeOuakam(Agency $agence): Property
    {
        $bien = $this->bienDe($agence);
        $bien->update(['type' => PropertyType::Room->value, 'price' => 85000, 'rent_period' => RentPeriod::Monthly->value]);
        $bien->address()->create(['neighborhood' => 'Ouakam', 'city' => 'Dakar', 'country' => 'SN']);

        return $bien->fresh();
    }

    private function demande(Agency $agence, Property $bien, User $agent, string $telephone = '+221778103538'): PropertyContactLead
    {
        return PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $agence->id, 'recipient_user_id' => $agent->id,
            'name' => 'Mouhamed Dieng', 'phone' => $telephone, 'email' => null, 'message' => 'La pièce m’intéresse.',
        ]);
    }

    /** @return array{0: Customer, 1: User, 2: Agency} */
    private function ficheDeduite(): array
    {
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $lead = $this->demande($agence, $this->pieceDeOuakam($agence), $agent);
        Sanctum::actingAs($agent);
        $id = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated()->json('customer.id');

        return [Customer::query()->findOrFail($id), $agent, $agence];
    }

    public function test_ac3_la_recherche_deduite_d_une_demande_se_dit_telle(): void
    {
        [$fiche, $agent] = $this->ficheDeduite();

        $this->assertNotNull($fiche->seeking_deduced_at);
        Sanctum::actingAs($agent);
        $this->assertNotNull($this->getJson("/api/customers/{$fiche->id}")->assertOk()->json('data.seeking_deduced_at'));
    }

    public function test_ac3_la_premiere_modification_de_la_recherche_efface_le_marqueur(): void
    {
        [$fiche, $agent] = $this->ficheDeduite();

        Sanctum::actingAs($agent);
        $this->patchJson("/api/customers/{$fiche->id}", ['budget_max' => 120000])->assertOk();

        $this->assertNull($fiche->fresh()->seeking_deduced_at);
        $this->assertNull($this->getJson("/api/customers/{$fiche->id}")->json('data.seeking_deduced_at'));
    }

    public function test_ac3_un_renvoi_a_l_identique_ne_l_efface_pas(): void
    {
        [$fiche, $agent] = $this->ficheDeduite();

        Sanctum::actingAs($agent);
        $this->patchJson("/api/customers/{$fiche->id}", [
            'budget_max' => '102000',
            'seeking_contract_type' => 'rent',
            'seeking_property_types' => ['room'],
            'seeking_neighborhoods' => $fiche->seeking_neighborhoods,
            'occupation' => 'Fonctionnaire',
            // La feuille d'édition renvoie les critères vides en `[]` / chaîne vide (`CustomerForm`) : ce
            // n'est pas une modification de la recherche.
            'seeking_cities' => [],
            'budget_min' => '',
            'min_bedrooms' => '',
        ])->assertOk();

        $this->assertNotNull($fiche->fresh()->seeking_deduced_at);
    }

    public function test_ac3_une_fiche_aux_criteres_saisis_n_est_pas_marquee_au_rattachement(): void
    {
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $existante = $this->ficheClient($agence, null, [
            'added_by_id' => $agent->id, 'phone' => '+221778103538', 'email' => null, 'seeking_neighborhoods' => ['Mermoz'],
        ]);
        $lead = $this->demande($agence, $this->pieceDeOuakam($agence), $agent);

        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$lead->id}/convert", ['customer_id' => $existante->id])->assertCreated();

        $this->assertSame('rent', $existante->fresh()->seeking_contract_type);
        $this->assertNull($existante->fresh()->seeking_deduced_at);
    }

    /** Une seconde demande qui complète une recherche toute déduite la laisse déduite. */
    public function test_ac3_une_seconde_demande_garde_le_marqueur(): void
    {
        [$fiche, $agent, $agence] = $this->ficheDeduite();
        $fiche->forceFill(['budget_max' => null])->saveQuietly();
        $this->assertNotNull($fiche->fresh()->seeking_deduced_at);

        $lead = $this->demande($agence, $this->pieceDeOuakam($agence), $agent);
        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$lead->id}/convert", ['customer_id' => $fiche->id])->assertCreated();

        $this->assertSame('102000.00', (string) $fiche->fresh()->budget_max);
        $this->assertNotNull($fiche->fresh()->seeking_deduced_at);
    }

    /** AC4 — le bailleur auteur ne lit pas le marqueur, ni au show, ni en liste sous `fields`. */
    public function test_ac4_le_bailleur_auteur_ne_lit_pas_le_marqueur(): void
    {
        $agence = $this->agence();
        $bailleur = $this->bailleur($agence);
        $fiche = $this->ficheClient($agence, null, ['added_by_id' => $bailleur->id]);
        $fiche->forceFill(['seeking_deduced_at' => now(), 'seeking_contract_type' => 'rent'])->saveQuietly();

        Sanctum::actingAs($bailleur);
        $this->assertArrayNotHasKey('seeking_deduced_at', $this->getJson("/api/customers/{$fiche->id}")->assertOk()->json('data'));
        $ligne = collect($this->getJson('/api/customers?fields[customers]=id,seeking_deduced_at')->assertOk()->json('data'))
            ->firstWhere('id', $fiche->id);
        $this->assertNotNull($ligne);
        $this->assertArrayNotHasKey('seeking_deduced_at', $ligne);
    }
}
