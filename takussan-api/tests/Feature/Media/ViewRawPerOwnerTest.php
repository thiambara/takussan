<?php

namespace Tests\Feature\Media;

use App\Http\Resources\MediaResource;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-545 — `viewRaw` ne dépend que de l'utilisateur et du PROPRIÉTAIRE du média
 * (`MediaPolicy`). La branche l'évaluait pour CHAQUE média, sans condition, dans la console
 * des photos et dans `MediaResource` : ~6 requêtes de profils par média. La décision se prend
 * désormais une fois par propriétaire — et ne doit pas fuir d'un propriétaire à l'autre.
 */
class ViewRawPerOwnerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');
        RemoteDiskFake::install('r2-media');
    }

    public function test_the_media_console_query_count_does_not_depend_on_the_number_of_photos(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $property = $this->property($this->agency());

        $this->photos($property, 2);
        $two = $this->countQueries(fn () => $this->getJson("/api/properties/{$property->id}/media")->assertOk()->assertJsonCount(2, 'data'));

        $this->photos($property, 4);
        $six = $this->countQueries(fn () => $this->getJson("/api/properties/{$property->id}/media")->assertOk()->assertJsonCount(6, 'data'));

        $this->assertSame($two, $six);
    }

    public function test_a_media_resource_collection_query_count_does_not_depend_on_the_number_of_media(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $property = $this->property($this->agency());

        $this->photos($property, 2);
        $two = $this->countQueries(fn () => MediaResource::collection(Media::query()->get())->resolve(request()));

        $this->photos($property, 4);
        $six = $this->countQueries(fn () => MediaResource::collection(Media::query()->get())->resolve(request()));

        $this->assertSame($two, $six);
    }

    /**
     * La mémoïsation est PAR PROPRIÉTAIRE : dans une même collection, l'admin de l'agence A
     * reçoit l'original signé des photos de A, jamais de celles de B — quel que soit l'ordre.
     */
    public function test_the_decision_does_not_leak_between_owners_of_one_collection(): void
    {
        $admin = User::factory()->create();
        $agencyA = $this->agency($admin);
        $this->materializeRoleProfile($admin, 'agency_admin', $agencyA);

        $b = $this->property($this->agency());
        $a = $this->property($agencyA);
        $this->photos($b, 2);
        $this->photos($a, 2);
        $this->photos($b, 1);

        Sanctum::actingAs($admin);
        $this->assertSigned([$a->id => true, $b->id => false]);

        $nobody = User::factory()->create();
        Sanctum::actingAs($nobody);
        $this->assertSigned([$a->id => false, $b->id => false]);

        $root = User::factory()->create();
        $this->materializeRoleProfile($root, 'super_admin');
        Sanctum::actingAs($root);
        $this->assertSigned([$a->id => true, $b->id => true]);
    }

    /**
     * F2 (passe adverse 3) — la décision d'une collection ne fuit pas vers un AUTRE utilisateur
     * qui rend la même instance de média : ni un tiers connecté, ni un anonyme. C'est le
     * scénario d'une notification, d'un export ou d'un worker Octane qui rendrait deux fois le
     * même média.
     */
    public function test_the_decision_does_not_leak_between_users_on_the_same_media_instance(): void
    {
        $this->photos($this->property($this->agency()), 2);
        $media = Media::query()->orderBy('id')->get();

        $root = User::factory()->create();
        $this->materializeRoleProfile($root, 'super_admin');
        Sanctum::actingAs($root);
        foreach (MediaResource::collection($media)->resolve(request()) as $row) {
            $this->assertStringContainsString('signature=', (string) $row['url']);
        }

        Sanctum::actingAs(User::factory()->create());
        $this->assertStringNotContainsString('signature=', (string) (new MediaResource($media->first()))->toArray(request())['url']);

        $this->app['auth']->forgetGuards();
        $this->assertNull(auth()->user());
        $this->assertStringNotContainsString('signature=', (string) (new MediaResource($media->first()))->toArray(request())['url']);
    }

    public function test_the_console_keeps_the_signed_original_for_view_raw_only(): void
    {
        $property = $this->property($this->agency());
        $this->photos($property, 2);

        Sanctum::actingAs(User::factory()->create());
        foreach ($this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data') as $photo) {
            $this->assertStringNotContainsString('signature=', (string) $photo['original']);
        }

        $root = User::factory()->create();
        $this->materializeRoleProfile($root, 'super_admin');
        Sanctum::actingAs($root);
        foreach ($this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data') as $photo) {
            $this->assertStringContainsString('signature=', (string) $photo['original']);
        }
    }

    /** @param  array<int, bool>  $expected  property id → l'original signé est-il rendu ? */
    private function assertSigned(array $expected): void
    {
        $media = Media::query()->orderBy('id')->get();
        $rendered = MediaResource::collection($media)->resolve(request());

        $this->assertCount(5, $rendered);
        foreach ($rendered as $row) {
            $this->assertSame(
                $expected[$row['model_id']],
                str_contains((string) $row['url'], 'signature='),
                "média #{$row['id']} du bien #{$row['model_id']}",
            );
        }
    }

    private function countQueries(callable $render): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $render();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    private function agency(?User $admin = null): Agency
    {
        return Agency::factory()->create([
            'primary_admin_id' => ($admin ?? User::factory()->create())->id,
            'settings' => ['watermark_enabled' => false],
        ]);
    }

    private function property(Agency $agency): Property
    {
        return Property::factory()->published()->create(['agency_id' => $agency->id]);
    }

    private function photos(Property $property, int $count): void
    {
        foreach (range(1, $count) as $_) {
            $property->addMedia(UploadedFile::fake()->image('villa.jpg', 800, 600))->toMediaCollection('photos');
        }
    }
}
