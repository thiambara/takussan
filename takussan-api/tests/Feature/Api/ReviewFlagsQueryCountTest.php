<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\ServiceProviderProfile;
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
 * 25 doit coûter le même nombre de requêtes, à 3 près. Un seuil absolu mesurerait le reste de
 * l'endpoint, pas ce défaut.
 *
 * verif-597 passe 3, n3 — les cibles sont MÊLÉES (bien, agent, agence, prestataire) : un avis de
 * prestataire lisait `users` pour son titre, ligne à ligne, et des avis sur des biens seuls ne le
 * voyaient pas (20 → 100 avis : 26 → 43 requêtes sur la file d'agence).
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
        $this->viewers['super_admin'] = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($this->viewers['super_admin'], 'super_admin');
    }

    /**
     * Quatre avis par tour, un par cible : un bien PAR avis publié par l'agent, l'agent lui-même,
     * l'agence, et un prestataire PAR avis — le pire cas pour un N+1 sur la cible et son compte.
     */
    private function reviews(int $rounds): void
    {
        for ($i = 0; $i < $rounds; $i++) {
            $status = $i % 2 === 0 ? ReviewStatus::Approved : ReviewStatus::Pending;
            $property = Property::factory()->published()->create([
                'agency_id' => $this->agency->id,
                'user_id' => $this->viewers['agent']->id,
            ]);
            $targets = [
                Property::class => $property->id,
                User::class => $this->viewers['agent']->id,
                Agency::class => $this->agency->id,
                ServiceProviderProfile::class => ServiceProviderProfile::factory()->create()->id,
            ];
            foreach ($targets as $type => $id) {
                Review::factory()->create([
                    'reviewable_type' => $type,
                    'reviewable_id' => $id,
                    'agency_id' => $this->agency->id,
                    'status' => $status,
                    'is_approved' => $status === ReviewStatus::Approved,
                ]);
            }
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
     * `[acteur, URI, lignes rendues sur 5 tours (20 avis), sur 25 tours (100 avis)]` — la boîte est
     * paginée à 50 ; l'agent n'y voit que les avis publiés qui le visent, bien ou agent (6, puis 26).
     *
     * @return array<string, array{string, string, int, int}>
     */
    public static function endpoints(): array
    {
        return [
            'file d\'agence, admin' => ['agency_admin', '/api/reviews?per_page=100', 20, 100],
            'file plateforme, super-admin' => ['super_admin', '/api/reviews?per_page=100', 20, 100],
            'boîte des avis reçus, admin' => ['agency_admin', '/api/reviews/received?per_page=50', 20, 50],
            'boîte des avis reçus, agent' => ['agent', '/api/reviews/received?per_page=50', 6, 26],
        ];
    }

    #[DataProvider('endpoints')]
    public function test_the_flags_cost_the_same_for_20_and_for_100_reviews(string $viewer, string $uri, int $rowsAt20, int $rowsAt100): void
    {
        $this->reviews(5);
        $at20 = $this->queriesFor($viewer, $uri, $rowsAt20);

        $this->reviews(20);
        $at100 = $this->queriesFor($viewer, $uri, $rowsAt100);

        $this->assertLessThanOrEqual($at20 + 3, $at100, "20 avis : {$at20} requêtes ; 100 avis : {$at100}.");
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
