<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-597 (verif-597 passe 2, n2) — les drapeaux `can_reply` / `can_moderate` de `ReviewResource`
 * ne coûtent pas de requête par avis.
 *
 * Mesuré par le vérificateur, 50 avis : 412 requêtes sur `GET /api/reviews/received` (12 sans les
 * drapeaux), 471 sur `GET /api/reviews` (71). Chaque ligne relisait les profils de l'acteur, son
 * agence et le genre de celle-ci.
 *
 * Le contrôle est RELATIF, comme `WatermarkListQueryCountTest` : la même page pour 5 avis et pour
 * 25 doit coûter le même nombre de requêtes, à 2 près. Un seuil absolu mesurerait le reste de
 * l'endpoint, pas ce défaut.
 */
class ReviewFlagsQueryCountTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    /** @var array<string, User> */
    private array $viewers = [];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        foreach (['agent', 'agency_admin'] as $role) {
            $this->viewers[$role] = User::factory()->create();
            $this->materializeRoleProfile($this->viewers[$role], $role, $this->agency);
        }
    }

    /** Un bien PAR avis, publié par l'agent : le pire cas pour un N+1 sur la cible. */
    private function reviews(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $property = Property::factory()->published()->create([
                'agency_id' => $this->agency->id,
                'user_id' => $this->viewers['agent']->id,
            ]);
            $status = $i % 2 === 0 ? ReviewStatus::Approved : ReviewStatus::Pending;
            Review::factory()->create([
                'reviewable_type' => Property::class,
                'reviewable_id' => $property->id,
                'agency_id' => $this->agency->id,
                'status' => $status,
                'is_approved' => $status === ReviewStatus::Approved,
            ]);
        }
    }

    private function queriesFor(string $viewer, string $uri, int $expectedRows): int
    {
        $this->actingAsApi($this->viewers[$viewer]);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $rows = $this->getJson($uri)->assertOk()->json('data');
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertCount($expectedRows, $rows);
        $this->assertNotNull($rows[0]['can_reply'] ?? null, 'Précondition : le drapeau est émis.');

        return $count;
    }

    /**
     * `[acteur, URI, lignes rendues sur 5 avis, sur 25]` — l'agent ne voit dans sa boîte que les
     * avis publiés (3 sur 5, 13 sur 25).
     *
     * @return array<string, array{string, string, int, int}>
     */
    public static function endpoints(): array
    {
        return [
            'file d\'agence, admin' => ['agency_admin', '/api/reviews?per_page=100', 5, 25],
            'boîte des avis reçus, admin' => ['agency_admin', '/api/reviews/received?per_page=50', 5, 25],
            'boîte des avis reçus, agent' => ['agent', '/api/reviews/received?per_page=50', 3, 13],
        ];
    }

    #[DataProvider('endpoints')]
    public function test_the_flags_cost_the_same_for_5_and_for_25_reviews(string $viewer, string $uri, int $rowsAt5, int $rowsAt25): void
    {
        $this->reviews(5);
        $at5 = $this->queriesFor($viewer, $uri, $rowsAt5);

        $this->reviews(20);
        $at25 = $this->queriesFor($viewer, $uri, $rowsAt25);

        $this->assertLessThanOrEqual($at5 + 2, $at25, "5 avis : {$at5} requêtes ; 25 avis : {$at25}.");
    }

    /**
     * La mémoire vit le temps d'UNE requête : un agent suspendu entre deux appels perd la réponse
     * au second. Le scope est `scoped`, et rien ne remet une instance `scoped` à zéro entre deux
     * requêtes HTTP d'un test : une mémoire rangée sous l'instance garderait le premier verdict.
     */
    public function test_the_memory_does_not_outlive_the_request(): void
    {
        $this->reviews(1);
        $agent = $this->viewers['agent'];
        $this->actingAsApi($agent);

        $this->getJson('/api/reviews/received')->assertOk()->assertJsonPath('data.0.can_reply', true);

        AgentProfile::query()->where('user_id', $agent->id)
            ->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->getJson('/api/reviews/received')->assertOk()->assertJsonPath('data.0.can_reply', false);
    }
}
