<?php

namespace Tests\Feature\Reviews;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2722 (décision du porteur du 2026-11-11, option a) — le nombre de signalements d'un avis ne
 * se lit que par qui le modère (`viewReports` sur l'avis, la règle de `risk`, TCK-2672). L'auteur
 * et le public ne lisent ni le compte, ni la trace d'un signalement après ré-approbation : la clé
 * est absente, et sous `filter[author_id]=me`, `filter[reported]` et le tri par signalements sont
 * sans effet.
 */
class ReviewReportedCountVisibilityTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $moderateur;

    private User $auteur;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $agency = Agency::factory()->create();
        $this->moderateur = User::factory()->create();
        $this->materializeRoleProfile($this->moderateur, 'agency_admin', $agency);
        $this->auteur = User::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $agency->id]);
    }

    /** Un avis de l'auteur, approuvé, signalé `$signalements` fois (ré-approuvé s'il l'a été). */
    private function avis(int $signalements, string $creeLe): Review
    {
        return Review::factory()->create([
            'reviewable_type' => Property::class, 'reviewable_id' => $this->property->id,
            'author_id' => $this->auteur->id,
            'status' => ReviewStatus::Approved, 'is_approved' => true,
            'rating' => 4, 'title' => 'Bien', 'content' => 'Appartement calme.',
            'reported_count' => $signalements,
            'created_at' => Carbon::parse($creeLe),
        ]);
    }

    /** @return list<int> */
    private function idsDeLAuteur(string $requete = ''): array
    {
        $this->actingAsApi($this->auteur);

        return array_column($this->getJson("/api/reviews?filter[author_id]=me{$requete}")->assertOk()->json('data'), 'id');
    }

    /** AC1 */
    public function test_ni_l_auteur_ni_le_public_ne_lisent_le_compte_le_moderateur_si(): void
    {
        $b = $this->avis(2, '2026-11-01 10:00:00');

        $this->actingAsApi($this->auteur);
        $ligne = collect($this->getJson('/api/reviews?filter[author_id]=me')->assertOk()->json('data'))->firstWhere('id', $b->id);
        $this->assertNotNull($ligne);
        $this->assertArrayNotHasKey('reported_count', $ligne);

        $this->app['auth']->forgetGuards();
        $publique = collect($this->getJson("/api/public/properties/{$this->property->slug}/reviews")->assertOk()->json('data'))->firstWhere('id', $b->id);
        $this->assertNotNull($publique, 'la fiche publique garde l\'avis');
        $this->assertArrayNotHasKey('reported_count', $publique);

        $this->actingAsApi($this->moderateur);
        $file = collect($this->getJson('/api/reviews')->assertOk()->json('data'))->firstWhere('id', $b->id);
        $this->assertSame(2, $file['reported_count']);
    }

    /** AC2 — `filter[reported]` est sans effet pour l'auteur. */
    public function test_le_filtre_des_signales_est_sans_effet_pour_l_auteur(): void
    {
        $a = $this->avis(0, '2026-11-05 10:00:00');
        $b = $this->avis(2, '2026-11-01 10:00:00');

        $this->assertEqualsCanonicalizing([$a->id, $b->id], $this->idsDeLAuteur('&filter[reported]=1'));
        $this->assertEqualsCanonicalizing($this->idsDeLAuteur(), $this->idsDeLAuteur('&filter[reported]=1'));
    }

    /** AC3 — l'ordre de l'auteur est par date, et le tri par signalements n'y change rien. */
    public function test_l_ordre_de_l_auteur_ne_trahit_pas_les_signalements(): void
    {
        $a = $this->avis(0, '2026-11-05 10:00:00');
        $b = $this->avis(2, '2026-11-01 10:00:00');

        $this->assertSame([$a->id, $b->id], $this->idsDeLAuteur());
        $this->assertSame([$a->id, $b->id], $this->idsDeLAuteur('&sort=-reported_count'));
        $this->assertSame([$a->id, $b->id], $this->idsDeLAuteur('&sort=-reported_count,-created_at'));
    }

    /** AC4 — la file de modération garde son filtre et son tri. */
    public function test_la_file_de_moderation_est_inchangee(): void
    {
        $a = $this->avis(0, '2026-11-05 10:00:00');
        $b = $this->avis(2, '2026-11-01 10:00:00');
        $this->actingAsApi($this->moderateur);

        $this->assertSame([$b->id], array_column($this->getJson('/api/reviews?filter[reported]=1')->assertOk()->json('data'), 'id'));
        $this->assertSame([$b->id, $a->id], array_column($this->getJson('/api/reviews?sort=-reported_count')->assertOk()->json('data'), 'id'));
        $this->assertSame([$b->id, $a->id], array_column($this->getJson('/api/reviews')->assertOk()->json('data'), 'id'));
    }
}
