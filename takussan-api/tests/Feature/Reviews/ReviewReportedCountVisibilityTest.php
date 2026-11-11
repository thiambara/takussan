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

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->moderateur = User::factory()->create();
        $this->materializeRoleProfile($this->moderateur, 'agency_admin', $this->agency);
        $this->auteur = User::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
    }

    /** Un avis de l'auteur, approuvé, signalé `$signalements` fois (ré-approuvé s'il l'a été). */
    private function avis(int $signalements, string $creeLe, ReviewStatus $statut = ReviewStatus::Approved): Review
    {
        return Review::factory()->create([
            'reviewable_type' => Property::class, 'reviewable_id' => $this->property->id,
            'author_id' => $this->auteur->id,
            'status' => $statut, 'is_approved' => $statut === ReviewStatus::Approved,
            'rating' => 4, 'title' => 'Bien', 'content' => 'Appartement calme.',
            'reported_count' => $signalements,
            'created_at' => Carbon::parse($creeLe),
        ]);
    }

    /** @return list<int> */
    private function idsDeLaFile(User $lecteur, string $requete = ''): array
    {
        $this->actingAsApi($lecteur);

        return array_column($this->getJson("/api/reviews?per_page=50{$requete}")->assertOk()->json('data'), 'id');
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

    /**
     * Reprise (vérification adverse, majeur) — dans l'ordre NATUREL de création (B, l'ancien signalé,
     * créé avant A), un tri dont toutes les clés sont ignorées pour l'auteur retombe sur la date : sans
     * ordre posé, la page sortait dans l'ordre physique de la table, B puis A.
     */
    public function test_un_tri_ignore_retombe_sur_la_date_dans_l_ordre_naturel(): void
    {
        $b = $this->avis(2, '2026-11-01 10:00:00');
        $a = $this->avis(0, '2026-11-05 10:00:00');

        foreach (['', '&sort=-reported_count', '&sort=risk', '&sort=-risk', '&sort=-reported_count,-risk'] as $requete) {
            $this->assertSame([$a->id, $b->id], $this->idsDeLAuteur($requete), "tri « {$requete} »");
        }
    }

    /** La retombée est la DATE, pas l'identifiant : l'avis créé en premier peut être le plus récent. */
    public function test_la_retombee_est_la_date_et_non_l_identifiant(): void
    {
        $recent = $this->avis(0, '2026-11-09 10:00:00');
        $ancien = $this->avis(2, '2026-11-01 10:00:00');

        $this->assertSame([$recent->id, $ancien->id], $this->idsDeLAuteur('&sort=-reported_count'));
    }

    /** Mineur (préexistant) — les ex aequo se départagent par identifiant, le plus récent d'abord. */
    public function test_les_ex_aequo_se_departagent_par_identifiant(): void
    {
        $p = $this->avis(1, '2026-11-01 10:00:00', ReviewStatus::Pending);
        $q = $this->avis(1, '2026-11-01 10:00:00', ReviewStatus::Pending);

        $this->assertSame([$q->id, $p->id], $this->idsDeLAuteur('&sort=pending_first'));
        $this->assertSame([$q->id, $p->id], $this->idsDeLaFile($this->moderateur, '&sort=-reported_count'));
    }

    /**
     * Reprise (décision de la session) — la file d'agence liste aussi l'avis SUR l'agence, qu'elle ne
     * modère pas (la ressource lui retire compte et risque) : le filtre, le tri et les comptes par
     * signalement ou par risque n'en tiennent pas compte. La liste, elle, est inchangée. Le
     * super-admin, qui modère tout, le compte.
     */
    public function test_filtre_tri_et_comptes_ne_portent_que_sur_les_avis_moderes(): void
    {
        $signale = $this->avis(1, '2026-11-01 10:00:00');
        $calme = $this->avis(0, '2026-11-02 10:00:00');
        // Créé en DERNIER : à risque égal, le départage par identifiant le mettrait en tête.
        $surLAgence = Review::factory()->create([
            'reviewable_type' => Agency::class, 'reviewable_id' => $this->agency->id, 'agency_id' => $this->agency->id,
            'author_id' => User::factory()->create()->id,
            'status' => ReviewStatus::Approved, 'is_approved' => true,
            'rating' => 5, 'title' => 'Agence', 'content' => 'Équipe sérieuse.', 'reported_count' => 2,
        ]);

        $this->assertEqualsCanonicalizing([$surLAgence->id, $signale->id, $calme->id], $this->idsDeLaFile($this->moderateur), 'la liste est inchangée');
        $this->assertSame([$signale->id], $this->idsDeLaFile($this->moderateur, '&filter[reported]=1'));
        $this->assertSame($signale->id, $this->idsDeLaFile($this->moderateur, '&sort=-reported_count')[0]);
        $this->assertSame($signale->id, $this->idsDeLaFile($this->moderateur, '&sort=risk')[0]);
        $this->assertSame([$signale->id], $this->idsDeLaFile($this->moderateur, '&filter[risk]=high'));
        $this->assertSame([$calme->id], $this->idsDeLaFile($this->moderateur, '&filter[risk]=low'));
        $this->actingAsApi($this->moderateur);
        $this->assertSame(['high' => 1, 'low' => 1], $this->getJson('/api/reviews')->assertOk()->json('meta.risk_counts'));

        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');
        $this->assertSame($surLAgence->id, $this->idsDeLaFile($superAdmin, '&sort=-reported_count')[0]);
        $this->actingAsApi($superAdmin);
        $this->assertSame(['high' => 2, 'low' => 1], $this->getJson('/api/reviews')->assertOk()->json('meta.risk_counts'));
    }

    /**
     * Contre-vérification de la reprise (m1) — la borne vaut aussi du côté « sans risque » : un avis
     * CALME sur l'agence (aucun signalement), que la ressource prive de `risk`, n'entre ni dans
     * `risk_counts.low` ni dans `filter[risk]=low` ; le super-admin le compte. L'avis sur l'agence
     * du test précédent, signalé deux fois, tombait toujours du côté « à risque ».
     */
    public function test_un_avis_calme_sur_l_agence_n_est_pas_compte_sans_risque(): void
    {
        $calme = $this->avis(0, '2026-11-01 10:00:00');
        $surLAgence = Review::factory()->create([
            'reviewable_type' => Agency::class, 'reviewable_id' => $this->agency->id, 'agency_id' => $this->agency->id,
            'author_id' => User::factory()->create()->id,
            'status' => ReviewStatus::Approved, 'is_approved' => true,
            'rating' => 4, 'title' => 'Agence', 'content' => 'Équipe sérieuse.', 'reported_count' => 0,
        ]);

        $this->actingAsApi($this->moderateur);
        $file = $this->getJson('/api/reviews?per_page=50')->assertOk();
        $this->assertEqualsCanonicalizing([$calme->id, $surLAgence->id], array_column($file->json('data'), 'id'), 'la liste est inchangée');
        $this->assertSame(['high' => 0, 'low' => 1], $file->json('meta.risk_counts'));
        $ligne = collect($file->json('data'))->firstWhere('id', $surLAgence->id);
        $this->assertArrayNotHasKey('risk', $ligne);
        $this->assertArrayNotHasKey('reported_count', $ligne);
        $this->assertSame([$calme->id], $this->idsDeLaFile($this->moderateur, '&filter[risk]=low'));

        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');
        $this->assertEqualsCanonicalizing([$calme->id, $surLAgence->id], $this->idsDeLaFile($superAdmin, '&filter[risk]=low'));
        $this->actingAsApi($superAdmin);
        $this->assertSame(['high' => 0, 'low' => 2], $this->getJson('/api/reviews')->assertOk()->json('meta.risk_counts'));
    }
}
