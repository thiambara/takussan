<?php

namespace Tests\Feature\Crm;

use App\Http\Middleware\ThrottleRequestsByNetwork;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Crm\CustomerDuplicateDetector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2590 (décision 8 du porteur, troisième porte, nuit du 2026-11-12) — la demande de contact ne
 * signale plus une fiche que son lecteur ne lit pas, et sa conversion (demande ou visite → fiche) suit la
 * règle de `POST /customers` : chaque signalement masqué puise dans le seau de la sonde, vingt par heure
 * et par personne, et le budget vide rend 429 générique sans rien créer. L'e-mail complet est le même
 * oracle que le numéro complet : il puise dans le même seau, à la sonde comme à la création (E5).
 *
 * Fixture : l'agence A, la fiche cachée de Mariama (téléphone et e-mail), un membre M d'A sans vue
 * globale du CRM (rôle `PropertiesCreate` seul), destinataire des demandes.
 */
class SignalementMasqueTroisiemePorteTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $membre;

    private Customer $mariama;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = $this->agence();
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        $this->membre = $this->personnel($this->agence, agencyRole: $role);
        $this->mariama = $this->ficheClient($this->agence, null, [
            'first_name' => 'Mariama', 'last_name' => 'Fall', 'phone' => '+221706482056', 'email' => 'Mariama.Fall@example.com',
        ]);
    }

    private function demande(?string $phone, ?string $email = null): PropertyContactLead
    {
        return PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id, 'agency_id' => $this->agence->id,
            'recipient_user_id' => $this->membre->id, 'name' => 'Essai Inconnu', 'phone' => $phone, 'email' => $email,
        ]);
    }

    private function seau(): string
    {
        return ThrottleRequestsByNetwork::namedLimiterKey(
            CustomerDuplicateDetector::LIMITEUR_DU_NUMERO_COMPLET,
            CustomerDuplicateDetector::seauDuNumeroComplet($this->membre->id),
        );
    }

    private function epuiser(int $unites = CustomerDuplicateDetector::NUMEROS_COMPLETS_PAR_HEURE): void
    {
        for ($i = 0; $i < $unites; $i++) {
            RateLimiter::hit($this->seau(), 3600);
        }
    }

    private function unitesConsommees(): int
    {
        return (int) RateLimiter::attempts($this->seau());
    }

    /** Décision 1 — `known_customer` ne signale que ce que le lecteur lit : la fiche cachée, au numéro comme à l'e-mail, n'existe pas pour lui. */
    public function test_la_demande_ne_signale_pas_une_fiche_cachee(): void
    {
        $auNumero = $this->demande('+221706482056');
        $alEmail = $this->demande(null, 'mariama.fall@EXAMPLE.com');
        $libre = $this->demande('+221771112233');

        Sanctum::actingAs($this->membre);
        foreach ([$auNumero, $alEmail, $libre] as $lead) {
            $detail = $this->getJson("/api/contact-leads/{$lead->id}")->assertOk();
            $this->assertArrayHasKey('known_customer', $detail->json('data'));
            $this->assertNull($detail->json('data.known_customer'), "demande {$lead->id}");
        }
        foreach ($this->getJson('/api/contact-leads')->assertOk()->json('data') as $ligne) {
            $this->assertNull($ligne['known_customer'], "ligne {$ligne['id']}");
        }
        $this->assertSame(0, $this->unitesConsommees(), 'la boîte ne consomme rien : elle ne signale rien');

        // L'admin, qui lit la fiche, la voit nommée.
        Sanctum::actingAs($this->personnel($this->agence, 'agency_admin'));
        $this->getJson("/api/contact-leads/{$auNumero->id}")->assertOk()
            ->assertJsonPath('data.known_customer.id', $this->mariama->id)
            ->assertJsonPath('data.known_customer.name', 'Mariama Fall');
    }

    /** Une fiche cachée au téléphone ne masque pas la fiche lisible à l'e-mail : c'est celle-ci qui est nommée. */
    public function test_la_premiere_fiche_lisible_est_nommee(): void
    {
        $sienne = $this->ficheClient($this->agence, null, [
            'first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => null, 'email' => 'awa@example.com', 'added_by_id' => $this->membre->id,
        ]);
        $lead = $this->demande('+221706482056', 'awa@example.com');

        Sanctum::actingAs($this->membre);
        $this->getJson("/api/contact-leads/{$lead->id}")->assertOk()
            ->assertJsonPath('data.known_customer.id', $sienne->id)
            ->assertJsonPath('data.known_customer.name', 'Awa Ndiaye');
    }

    /** Décision 2 — la conversion d'une demande : 409 masqué tant que le seau a de quoi, une unité chacune ; vide, 429 et rien de créé. */
    public function test_la_conversion_puise_dans_le_seau(): void
    {
        $lead = $this->demande('+221706482056');
        Sanctum::actingAs($this->membre);

        $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertStatus(409)
            ->assertJsonPath('code', 'customer.duplicate')
            ->assertJsonPath('existing.0.id', null);
        $this->assertSame(1, $this->unitesConsommees());

        $this->epuiser(CustomerDuplicateDetector::NUMEROS_COMPLETS_PAR_HEURE - 1);
        $refus = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertStatus(429)
            ->assertJsonPath('code', 'http.too_many_requests');
        $this->assertArrayNotHasKey('existing', $refus->json());
        $this->assertSame(1, Customer::query()->where('agency_id', $this->agence->id)->count(), 'aucune fiche créée');
        $this->assertNull($lead->fresh()->customer_id);

        // Une demande au numéro libre se convertit toujours, sans rien consommer.
        $this->postJson('/api/contact-leads/'.$this->demande('+221771112233')->id.'/convert')->assertCreated();
    }

    /** Décision 2 — la visite qui crée la fiche de sa demande suit la même règle. */
    public function test_la_visite_qui_cree_la_fiche_puise_dans_le_seau(): void
    {
        $lead = $this->demande('+221706482056');
        $this->epuiser();

        Sanctum::actingAs($this->membre);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id,
            'scheduled_at' => $this->creneau(),
            'create_customer' => true,
        ])->assertStatus(429);
        $this->assertSame(1, Customer::query()->where('agency_id', $this->agence->id)->count());
        $this->assertNull($lead->fresh()->customer_id);
    }

    /** E5 — à la création, l'e-mail complet d'une fiche cachée consomme une unité ; le seau vide, 429. */
    public function test_e5_l_email_masque_consomme_a_la_creation(): void
    {
        Sanctum::actingAs($this->membre);
        $this->epuiser(CustomerDuplicateDetector::NUMEROS_COMPLETS_PAR_HEURE - 1);

        $this->postJson('/api/customers', ['first_name' => 'Essai', 'last_name' => 'Un', 'email' => 'mariama.fall@example.com'])
            ->assertStatus(409)->assertJsonPath('existing.0.id', null)->assertJsonPath('existing.0.matched_on', 'email');
        $this->assertSame(CustomerDuplicateDetector::NUMEROS_COMPLETS_PAR_HEURE, $this->unitesConsommees());

        $this->postJson('/api/customers', ['first_name' => 'Essai', 'last_name' => 'Deux', 'email' => 'MARIAMA.FALL@example.com'])
            ->assertStatus(429);
        $this->assertSame(1, Customer::query()->where('agency_id', $this->agence->id)->count());

        // Un e-mail libre ne consomme rien et passe.
        $this->postJson('/api/customers', ['first_name' => 'Libre', 'last_name' => 'Mail', 'email' => 'libre@example.com'])->assertCreated();
    }

    /** E5, à la sonde — l'e-mail complet d'une fiche cachée consomme une unité ; vide, 429 sans rien de la fiche. */
    public function test_e5_l_email_masque_consomme_a_la_sonde(): void
    {
        Sanctum::actingAs($this->membre);
        $this->getJson('/api/customers/duplicates?email=mariama.fall@example.com')->assertOk()
            ->assertJsonPath('data.0.id', null);
        $this->assertSame(1, $this->unitesConsommees());

        // Un e-mail sans fiche cachée ne consomme rien.
        $this->getJson('/api/customers/duplicates?email=libre@example.com')->assertOk()->assertJsonPath('data', []);
        $this->assertSame(1, $this->unitesConsommees());

        $this->epuiser(CustomerDuplicateDetector::NUMEROS_COMPLETS_PAR_HEURE - 1);
        $refus = $this->getJson('/api/customers/duplicates?email=mariama.fall@example.com')->assertStatus(429);
        $this->assertArrayNotHasKey('data', $refus->json());
    }

    /** À la sonde, le numéro complet n'est compté qu'une fois : par le limiteur de la route, pas une seconde fois au signalement. */
    public function test_le_numero_complet_n_est_pas_compte_deux_fois_a_la_sonde(): void
    {
        Sanctum::actingAs($this->membre);
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk()->assertJsonPath('data.0.id', null);
        $this->assertSame(1, $this->unitesConsommees());
    }
}
