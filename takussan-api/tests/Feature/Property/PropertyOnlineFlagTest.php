<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Profiles\PlatformProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2637, AC2 (ADR-0097 § 1) — « en ligne » n'a qu'un prédicat : `is_online` d'une ligne et
 * `filter[public]=1` désignent EXACTEMENT les mêmes biens, et ce sont ceux qu'attend l'oracle
 * écrit ici à la main. L'oracle est ce qui fait rougir le test si l'on retire une condition du
 * prédicat partagé ; la parité, ce qui le fait rougir si l'un des deux s'en écarte.
 */
class PropertyOnlineFlagTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $root;

    /** @var array<string, Property> */
    private array $biens = [];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');

        $this->root = User::factory()->withTwoFactor()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $this->root->id]);

        $active = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $suspended = Agency::factory()->create(['status' => AgencyStatus::Suspended]);
        $owner = User::factory()->create();

        $bien = fn (string $title, array $attributes = [], ?Agency $agency = null) => $this->biens[$title] = Property::factory()->create($attributes + [
            'title' => $title,
            'user_id' => $owner->id,
            'agency_id' => ($agency ?? $active)->id,
            'status' => 'available',
            'visibility' => 'public',
            'published_at' => '2026-10-01 10:00:00',
            'is_test' => false,
        ]);

        $bien('En ligne');
        $bien('Statut validé', ['status' => 'published']);
        $bien('Sans agence', ['agency_id' => null]);
        $bien('Privé', ['visibility' => 'private']);
        $bien('Jamais publié', ['published_at' => null]);
        $bien('Loué', ['status' => 'rented']);
        $bien('Agence suspendue', [], $suspended);
        $bien('Bien de test', ['is_test' => true]);
        $bien('Brouillon', ['status' => 'draft']);
    }

    private const EN_LIGNE = ['En ligne', 'Statut validé', 'Sans agence'];

    public function test_ac2_is_online_et_filter_public_designent_les_memes_biens_que_l_oracle(): void
    {
        $this->actingAsApi($this->root);

        $rows = $this->getJson('/api/properties?per_page=100&include=online&fields[properties]=id,title')->assertOk()->json('data');
        $this->assertCount(count($this->biens), $rows);
        $online = array_column(array_filter($rows, fn (array $r) => $r['is_online'] === true), 'title');
        $offline = array_column(array_filter($rows, fn (array $r) => $r['is_online'] === false), 'title');
        $this->assertCount(count($this->biens), [...$online, ...$offline], 'chaque ligne porte un booléen');

        $filtered = array_column($this->getJson('/api/properties?per_page=100&filter[public]=1&fields[properties]=id,title')->assertOk()->json('data'), 'title');

        $this->assertEqualsCanonicalizing(self::EN_LIGNE, $online, 'is_online contre l\'oracle');
        $this->assertEqualsCanonicalizing(self::EN_LIGNE, $filtered, 'filter[public] contre l\'oracle');
    }

    public function test_la_fiche_et_l_instance_lisent_le_meme_predicat(): void
    {
        $this->actingAsApi($this->root);

        foreach ($this->biens as $title => $property) {
            $expected = in_array($title, self::EN_LIGNE, true);
            $this->assertSame($expected, $property->isOnline(), "isOnline() — {$title}");
            $this->assertSame($expected, $this->getJson("/api/properties/{$property->id}?include=online")->assertOk()->json('data.is_online'), "fiche — {$title}");
        }
    }

    /**
     * `is_online` se demande par `include=online`, jamais par `fields[]` (un champ calculé derrière les
     * sparse fieldsets est la voie écartée d'ADR-0021) : servi sur l'inclusion, avec ou sans
     * `fields[]`, absent sans elle — liste comme fiche.
     */
    public function test_is_online_suit_include_online(): void
    {
        $this->actingAsApi($this->root);
        $id = $this->biens['En ligne']->id;

        $this->assertArrayNotHasKey('is_online', $this->getJson('/api/properties?per_page=1')->assertOk()->json('data.0'));
        $this->assertArrayNotHasKey('is_online', $this->getJson('/api/properties?per_page=1&fields[properties]=id,title')->assertOk()->json('data.0'));
        $this->assertArrayNotHasKey('is_online', $this->getJson("/api/properties/{$id}")->assertOk()->json('data'));

        $this->assertIsBool($this->getJson('/api/properties?per_page=1&include=online')->assertOk()->json('data.0.is_online'));
        $this->assertSame(['id', 'title', 'is_online'], array_values(array_intersect(['id', 'title', 'is_online'], array_keys(
            $this->getJson('/api/properties?per_page=1&include=online&fields[properties]=id,title')->assertOk()->json('data.0'),
        ))));
        $this->assertTrue($this->getJson("/api/properties/{$id}?include=online")->assertOk()->json('data.is_online'));

        $this->getJson('/api/properties?per_page=1&fields[properties]=id,title,is_online')->assertStatus(400);
    }
}
