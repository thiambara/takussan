<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Constat de TCK-2581 (terrain-5) — la `metadata` d'une visite porte l'avis de l'agence
 * (`feedback_agent`, commentaire libre compris), l'avis du visiteur et les marques des rappels. Elle
 * sortait à QUICONQUE lit la visite : visiteur, client de la fiche, bailleur. Elle suit désormais la
 * règle des autres outils de la console de la visite (`visitor_display`) : le super-admin, le
 * personnel actif de l'agence du bien, et, sur un bien sans agence, son propriétaire — clé ABSENTE
 * pour tout autre lecteur, en détail comme en liste. L'avis du visiteur lui reste lisible par
 * `feedback` et `rating`, qui le recopient au premier niveau.
 */
class VisitMetadataPrivacyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const AVIS_DE_L_AGENCE = 'Interne : le client hésite sur le prix.';

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
        $this->visite = $this->visiteTerminee($this->bien, [
            'visitor_id' => $this->visiteur->id,
            'customer_id' => $this->ficheClient($this->agence, $this->visiteur)->id,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function visiteTerminee(Property $bien, array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $bien->id,
            'agent_id' => $this->personnel($this->agence)->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subHours(3),
            'completed_at' => now()->subHours(2),
            'feedback' => 'Bel appartement.',
            'rating' => 4,
            'metadata' => [
                'feedback_agent' => ['user_id' => 1, 'rating' => 2.0, 'comment' => self::AVIS_DE_L_AGENCE, 'submitted_at' => now()->toIso8601String()],
                'feedback_customer' => ['user_id' => 2, 'rating' => 4.0, 'comment' => 'Bel appartement.', 'submitted_at' => now()->toIso8601String()],
                'reminder_24h_sent_at' => now()->subDay()->toIso8601String(),
            ],
        ]);
    }

    private function assertMetadataAbsente(User $lecteur, PropertyVisit $visite, string $pourquoi): void
    {
        Sanctum::actingAs($lecteur);

        $detail = $this->getJson("/api/property-visits/{$visite->id}")->assertOk();
        $this->assertArrayNotHasKey('metadata', $detail->json('data'), $pourquoi.' (détail)');
        $this->assertStringNotContainsString(self::AVIS_DE_L_AGENCE, $detail->getContent(), $pourquoi.' (détail)');

        $liste = $this->getJson('/api/property-visits')->assertOk();
        $ligne = collect($liste->json('data'))->firstWhere('id', $visite->id);
        $this->assertNotNull($ligne, $pourquoi.' : la visite reste pourtant dans sa liste');
        $this->assertArrayNotHasKey('metadata', $ligne, $pourquoi.' (liste)');
        $this->assertStringNotContainsString(self::AVIS_DE_L_AGENCE, $liste->getContent(), $pourquoi.' (liste)');
    }

    public function test_le_visiteur_ne_recoit_pas_la_metadata_mais_garde_son_propre_avis(): void
    {
        $this->assertMetadataAbsente($this->visiteur, $this->visite, 'le visiteur');

        $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk()
            ->assertJsonPath('data.feedback', 'Bel appartement.')
            ->assertJsonPath('data.rating', 4);
    }

    public function test_le_client_de_la_fiche_qui_n_est_pas_le_visiteur_ne_recoit_pas_la_metadata(): void
    {
        // Le cas de la base de démo (visites 303, 350, 90) : `visitor_id` nul, la fiche liée au compte.
        $client = $this->client();
        $visite = $this->visiteTerminee($this->bien, ['customer_id' => $this->ficheClient($this->agence, $client)->id]);

        $this->assertMetadataAbsente($client, $visite, 'le client de la fiche');
    }

    public function test_le_bailleur_du_bien_hors_personnel_ne_recoit_pas_la_metadata(): void
    {
        $this->assertMetadataAbsente($this->bailleur, $this->visite, 'le bailleur');
    }

    public function test_un_compte_a_double_casquette_personnel_ailleurs_et_bailleur_ici_ne_la_recoit_pas(): void
    {
        $double = $this->personnel($this->agence());
        OwnerProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $this->agence->id]);
        $double = $double->fresh();
        $visite = $this->visiteTerminee($this->bienDe($this->agence, $double));

        // Son profil ACTIF est celui d'agent de l'autre agence.
        $this->withHeader('X-Profile-Id', 'agent:'.AgentProfile::query()->where('user_id', $double->id)->value('id'));
        $this->assertMetadataAbsente($double, $visite, 'le personnel d’une autre agence, bailleur ici');
    }

    public function test_le_personnel_de_l_agence_lit_la_metadata_en_detail_et_en_liste(): void
    {
        Sanctum::actingAs($this->personnel($this->agence));

        $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk()
            ->assertJsonPath('data.metadata.feedback_agent.comment', self::AVIS_DE_L_AGENCE)
            ->assertJsonPath('data.metadata.feedback_customer.rating', 4);
        $this->getJson('/api/property-visits')->assertOk()
            ->assertJsonPath('data.0.metadata.feedback_agent.comment', self::AVIS_DE_L_AGENCE);
    }

    public function test_le_proprietaire_d_un_bien_sans_agence_lit_la_metadata(): void
    {
        // Sur un bien sans agence, c'est lui qui gère la visite et y dépose l'avis « agent ».
        $proprietaire = User::factory()->create(['phone' => '+221770000001']);
        $visite = $this->visiteTerminee($this->bienDe(null, $proprietaire), ['agent_id' => null]);

        Sanctum::actingAs($proprietaire);
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.metadata.feedback_agent.comment', self::AVIS_DE_L_AGENCE);
    }

    public function test_la_reponse_a_l_avis_du_visiteur_ne_lui_rend_pas_l_avis_de_l_agence(): void
    {
        Sanctum::actingAs($this->visiteur);

        $reponse = $this->postJson("/api/property-visits/{$this->visite->id}/feedback", [
            'role' => 'customer',
            'rating' => 5,
            'comment' => 'Finalement très bien.',
        ])->assertOk();

        $this->assertArrayNotHasKey('metadata', $reponse->json('data'));
        $this->assertStringNotContainsString(self::AVIS_DE_L_AGENCE, $reponse->getContent());
        $this->assertSame('Finalement très bien.', $reponse->json('data.feedback'));
    }
}
