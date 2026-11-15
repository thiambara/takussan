<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\AgencyStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2522 (contre-vérification du 2026-11-09) — un avis publié sur une fiche dit D'OÙ il parle :
 * `context_kind` (`lease`, `booking`, `visit`, `maintenance_request`), le TYPE de la preuve
 * d'éligibilité que `reviews.context_type` porte déjà (ADR-0043 §3, `ReviewEligibility::contextKind`).
 *
 * Le type SEUL : jamais l'identifiant du bail, de la réservation ou de la visite, ni rien qui
 * désigne la personne ou son contrat. Chaque test qui l'affirme crée la preuve AVEC une référence
 * reconnaissable, pour qu'une fuite se voie dans la réponse.
 */
class ReviewContextKindTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private Agency $agence;

    protected function setUp(): void
    {
        parent::setUp();
        $agence = $this->agence = Agency::factory()->create(['status' => AgencyStatus::Active, 'slug' => 'dakar-immo']);
        $this->agent = User::factory()->create(['username' => 'awa-diop', 'status' => 'active']);
        AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $agence->id]);
    }

    private function avis(?string $contextType, ?int $contextId, string $quand, bool $surLAgence = false): Review
    {
        $auteur = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Sarr']);

        return Review::factory()->create([
            'reviewable_type' => $surLAgence ? Agency::class : User::class,
            'reviewable_id' => $surLAgence ? $this->agence->id : $this->agent->id,
            'author_id' => $auteur->id,
            'rating' => 5,
            'title' => 'Très bien',
            'content' => 'Suivi sérieux.',
            'is_approved' => true,
            'context_type' => $contextType,
            'context_id' => $contextId,
            'created_at' => $quand,
        ]);
    }

    /** @return array<string, array{0: class-string, 1: string}> */
    public static function contextes(): array
    {
        return [
            'bail' => [Lease::class, 'lease'],
            'séjour' => [Booking::class, 'booking'],
            'visite' => [PropertyVisit::class, 'visit'],
            'intervention' => [MaintenanceRequest::class, 'maintenance_request'],
        ];
    }

    #[DataProvider('contextes')]
    public function test_la_fiche_d_agent_sert_le_type_de_contexte_de_l_avis(string $classe, string $attendu): void
    {
        $this->avis($classe, 987654, '2026-11-01 10:00:00');

        $avis = $this->getJson('/api/public/agents/awa-diop')->assertOk()->json('data.reviews.recent.0');

        $this->assertSame($attendu, $avis['context_kind']);
    }

    public function test_sans_contexte_la_cle_vaut_null(): void
    {
        $this->avis(null, null, '2026-11-01 10:00:00');

        $avis = $this->getJson('/api/public/agents/awa-diop')->assertOk()->json('data.reviews.recent.0');

        $this->assertArrayHasKey('context_kind', $avis);
        $this->assertNull($avis['context_kind']);
    }

    public function test_un_type_de_contexte_inconnu_ne_casse_rien_et_ne_sort_pas(): void
    {
        $this->avis('App\\Models\\Inconnu', 1, '2026-11-01 10:00:00');

        $avis = $this->getJson('/api/public/agents/awa-diop')->assertOk()->json('data.reviews.recent.0');

        $this->assertNull($avis['context_kind']);
    }

    public function test_ni_identifiant_ni_classe_du_contexte_ne_sortent(): void
    {
        $this->avis(Lease::class, 987654, '2026-11-01 10:00:00');

        $reponse = $this->getJson('/api/public/agents/awa-diop')->assertOk();
        $avis = $reponse->json('data.reviews.recent.0');

        $this->assertArrayNotHasKey('context_id', $avis);
        $this->assertArrayNotHasKey('context_type', $avis);
        $this->assertArrayNotHasKey('context', $avis);
        $brut = $reponse->getContent();
        $this->assertStringNotContainsString('987654', $brut);
        $this->assertStringNotContainsString('Lease', $brut);
    }

    /**
     * La ressource sert ce que porte la colonne, quelle que soit la fiche. ⚠ L'avis d'agence est ici
     * posé par la factory AVEC un bail en contexte : l'application ne le produit pas encore —
     * `storeForAgency` n'écrit pas `context_*` (TCK-2577). Ce test garde la lecture, pas l'écriture ;
     * l'écriture par la route est prouvée pour l'agent dans `ReviewContextKindParLaRouteTest`.
     */
    public function test_la_fiche_d_agence_sert_aussi_le_type_de_contexte(): void
    {
        $this->avis(Lease::class, 987654, '2026-11-01 10:00:00', surLAgence: true);
        $this->avis(null, null, '2026-10-01 10:00:00', surLAgence: true);

        $reponse = $this->getJson('/api/public/agencies/dakar-immo')->assertOk();

        $this->assertSame(['lease', null], array_column($reponse->json('data.reviews.recent'), 'context_kind'));
        $this->assertStringNotContainsString('987654', $reponse->getContent());
    }
}
