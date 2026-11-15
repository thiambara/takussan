<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2587 (lot C, reprise de la vérification) — `notes` d'une visite mêle le message d'une demande
 * publique et la note de planification du personnel ; rien ne dit qui a écrit une ligne. Elle suit la
 * règle des outils de la console (`metadata`, `visitor_display`) : le personnel actif de l'agence du
 * bien, le super-admin et, sur un bien sans agence, son propriétaire la lisent ; le visiteur, le client
 * de la fiche et le bailleur d'un bien d'agence ne la reçoivent pas — clé absente, en détail comme en
 * liste.
 */
class VisitNotesPrivacyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const NOTE = 'Interne : sonner chez le gardien, le client négocie.';

    private Agency $agence;

    private User $bailleur;

    private User $visiteur;

    private Property $bien;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->bailleur = $this->bailleur($this->agence);
        $this->visiteur = $this->client();
        $this->bien = $this->bienDe($this->agence, $this->bailleur);
        $this->visite = $this->visite($this->bien, [
            'visitor_id' => $this->visiteur->id,
            'customer_id' => $this->ficheClient($this->agence, $this->visiteur)->id,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function visite(Property $bien, array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $bien->id,
            'agent_id' => $bien->agency_id !== null ? $this->personnel($this->agence)->id : null,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDay(),
            'notes' => self::NOTE,
        ]);
    }

    private function assertNotesAbsentes(User $lecteur, PropertyVisit $visite, string $pourquoi): void
    {
        Sanctum::actingAs($lecteur);

        $detail = $this->getJson("/api/property-visits/{$visite->id}")->assertOk();
        $this->assertArrayNotHasKey('notes', $detail->json('data'), $pourquoi.' (détail)');
        $this->assertStringNotContainsString(self::NOTE, $detail->getContent(), $pourquoi.' (détail)');

        $liste = $this->getJson('/api/property-visits')->assertOk();
        $ligne = collect($liste->json('data'))->firstWhere('id', $visite->id);
        $this->assertNotNull($ligne, $pourquoi.' : la visite reste pourtant dans sa liste');
        $this->assertArrayNotHasKey('notes', $ligne, $pourquoi.' (liste)');
        $this->assertStringNotContainsString(self::NOTE, $liste->getContent(), $pourquoi.' (liste)');
    }

    private function assertNotesLues(User $lecteur, PropertyVisit $visite, string $pourquoi): void
    {
        Sanctum::actingAs($lecteur);

        $this->assertSame(self::NOTE, $this->getJson("/api/property-visits/{$visite->id}")->assertOk()->json('data.notes'), $pourquoi.' (détail)');
        $ligne = collect($this->getJson('/api/property-visits')->assertOk()->json('data'))->firstWhere('id', $visite->id);
        $this->assertSame(self::NOTE, $ligne['notes'] ?? null, $pourquoi.' (liste)');
    }

    public function test_le_visiteur_ne_recoit_pas_les_notes(): void
    {
        $this->assertNotesAbsentes($this->visiteur, $this->visite, 'le visiteur');
    }

    public function test_le_client_de_la_fiche_qui_n_est_pas_le_visiteur_ne_recoit_pas_les_notes(): void
    {
        $client = $this->client();
        $visite = $this->visite($this->bien, ['customer_id' => $this->ficheClient($this->agence, $client)->id]);

        $this->assertNotesAbsentes($client, $visite, 'le client de la fiche');
    }

    public function test_le_bailleur_d_un_bien_d_agence_ne_recoit_pas_les_notes(): void
    {
        $this->assertNotesAbsentes($this->bailleur, $this->visite, 'le bailleur');
    }

    public function test_le_personnel_de_l_agence_lit_les_notes(): void
    {
        $this->assertNotesLues($this->personnel($this->agence), $this->visite, 'le personnel');
    }

    public function test_le_proprietaire_d_un_bien_sans_agence_lit_les_notes(): void
    {
        $proprietaire = User::factory()->create(['phone' => '+221770000001']);
        $visite = $this->visite($this->bienDe(null, $proprietaire));

        $this->assertNotesLues($proprietaire, $visite, 'le propriétaire d’un bien sans agence');
    }
}
