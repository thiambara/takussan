<?php

namespace Tests\Feature\Media;

use App\Http\Resources\MediaResource;
use App\Models\Agency;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkTrace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-545, mission 5 — `MediaResource` face à un média dont l'original est PRIVÉ et les
 * conversions PUBLIQUES (`Property.photos` depuis TCK-539, D2). Juger sur le seul `disk` le
 * rangeait parmi les privés : conversions à `null`. Les collections entièrement privées ne
 * bougent pas.
 */
class MediaResourceSplitDisksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');
        RemoteDiskFake::install('r2-media');
    }

    public function test_a_property_photo_serves_its_public_conversions_and_hides_its_original(): void
    {
        $media = $this->photo(watermark: false);
        Sanctum::actingAs(User::factory()->create());

        $data = $this->render($media);

        foreach (['thumbnail', 'preview', 'full'] as $conversion) {
            $this->assertSame($media->getUrl($conversion), $data['conversions'][$conversion]);
            Storage::disk('r2-media')->assertExists($media->getPathRelativeToRoot($conversion));
        }
        // Sans `viewRaw`, `url` est la plus grande conversion servable, jamais l'original.
        $this->assertSame($data['conversions']['full'], $data['url']);
        $this->assertStringNotContainsString('signature=', $data['url']);
    }

    public function test_the_signed_original_of_a_property_photo_is_reserved_to_view_raw(): void
    {
        $media = $this->photo(watermark: false);
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        $url = $this->render($media)['url'];

        $this->assertStringContainsString("/api/media/{$media->id}/file?", $url);
        $this->assertStringContainsString('signature=', $url);
    }

    /** La règle de filigrane est celle de `PublicPhotoUrl` : produite mais pas filigranée = tue. */
    public function test_a_conversion_awaiting_its_watermark_is_not_served(): void
    {
        $media = $this->photo(watermark: true);
        $media->setCustomProperty('watermarked_conversions', ['thumbnail'])->saveQuietly();
        Sanctum::actingAs(User::factory()->create());

        $data = $this->render($media->refresh());

        $this->assertSame($media->getUrl('thumbnail'), $data['conversions']['thumbnail']);
        $this->assertSame($media->getUrl('thumbnail'), $data['conversions']['full']);
        $this->assertSame($media->getUrl('thumbnail'), $data['url']);
    }

    /** Témoin : une collection entièrement privée garde l'URL signée, sans conversion. */
    public function test_a_kyc_document_keeps_its_signed_url(): void
    {
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => Agency::factory()->create()->id,
            'status' => KycDossierStatus::Pending,
        ]);
        $media = $dossier->addMedia(UploadedFile::fake()->image('cni.jpg', 900, 600))
            ->toMediaCollection('documents');
        Sanctum::actingAs(User::factory()->create());

        $data = $this->render($media);

        $this->assertSame(['r2-private', 'r2-private'], [$media->disk, $media->conversions_disk]);
        $this->assertStringContainsString("/api/media/{$media->id}/file?", $data['url']);
        $this->assertStringContainsString('signature=', $data['url']);
        $this->assertSame(['thumbnail' => null, 'preview' => null, 'full' => null], $data['conversions']);
    }

    /**
     * N+1 — une liste de médias de plusieurs biens, dans la fenêtre où la trace de filigrane ne
     * suffit pas (photos qui attendent le worker) : la règle de filigrane et le bien
     * propriétaire se lisent par lot. Les requêtes sur `properties` / `agencies` ne dépendent
     * pas du nombre de biens.
     *
     * Ne sont PAS comptées les requêtes de `viewRaw` sur les profils de l'utilisateur : une par
     * média, indépendante des biens, et hors de `MediaResource` (résolution des profils de `User`).
     */
    public function test_a_media_list_reads_owners_and_watermark_rule_in_a_bounded_number_of_queries(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->awaitingWorker(2);
        $twoProperties = $this->ownerQueriesToRenderAllMedia();

        $this->awaitingWorker(4);
        $sixProperties = $this->ownerQueriesToRenderAllMedia();

        $this->assertCount(2, $sixProperties, implode("\n", $sixProperties));
        $this->assertSame(count($twoProperties), count($sixProperties));
    }

    private function awaitingWorker(int $properties): void
    {
        foreach (range(1, $properties) as $_) {
            // Ni filigranée ni exemptée : la trace ne couvre rien, la règle doit être lue.
            $this->photo(watermark: false)
                ->forgetCustomProperty(WatermarkTrace::KEY)
                ->forgetCustomProperty(WatermarkTrace::EXEMPT_KEY)
                ->saveQuietly();
        }
    }

    /** @return list<string> les requêtes qui lisent les biens ou leurs agences */
    private function ownerQueriesToRenderAllMedia(): array
    {
        $media = Media::query()->where('collection_name', 'photos')->get();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $rendered = MediaResource::collection($media)->resolve(request());
        $queries = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        // Garde-fou : la règle a bien été consultée (trace vide), et elle a servi les conversions.
        $this->assertCount($media->count(), array_filter(array_column($rendered, 'conversions'), fn (array $c) => $c['full'] !== null));

        return array_values(array_filter($queries, fn (string $q) => str_contains($q, '"properties"') || str_contains($q, '"agencies"')));
    }

    private function photo(bool $watermark): Media
    {
        $agency = Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => $watermark],
        ]);
        $media = Property::factory()->published()->create(['agency_id' => $agency->id])
            ->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->toMediaCollection('photos')
            ->refresh();

        $this->assertSame(['r2-private', 'r2-media'], [$media->disk, $media->conversions_disk]);

        return $media;
    }

    /** @return array<string,mixed> */
    private function render(Media $media): array
    {
        return (new MediaResource($media))->toArray(request());
    }
}
