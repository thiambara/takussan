<?php

namespace Tests\Feature\Media;

use App\Http\Resources\PropertyResource;
use App\Jobs\Media\ApplyWatermarkJob;
use App\Models\Address;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkService;
use App\Services\Property\PropertyDuplicationService;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-539 — ce que la surface publique laisse voir d'une photo de bien (défauts D2, D3, D4
 * du vérificateur adverse).
 *
 * - D2 : l'ORIGINAL, non filigrané, vivait dans le seau public à une clé déduite de `full`.
 * - D3 : l'API émettait l'URL d'une conversion produite mais pas encore filigranée.
 * - D4 : une photo dupliquée emportait la trace `watermarked_conversions` de sa source, et
 *        les conversions du clone n'étaient jamais filigranées.
 *
 * Deux disques DISTANTS simulés (`RemoteDiskFake`), nommés comme en production.
 */
class PropertyPhotoExposureTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $public;

    private FilesystemAdapter $private;

    protected function setUp(): void
    {
        parent::setUp();

        $this->public = RemoteDiskFake::install('r2-media');
        $this->private = RemoteDiskFake::install('r2-private');
    }

    private function agence(bool $filigrane): Agency
    {
        return Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => $filigrane],
        ]);
    }

    private function bien(?Agency $agency = null): Property
    {
        return Property::factory()->published()->create(['agency_id' => $agency?->id]);
    }

    private function photo(Property $property): Media
    {
        return $property->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->usingFileName('villa.jpg')
            ->toMediaCollection('photos')
            ->refresh();
    }

    private function detail(Property $property): array
    {
        return $this->getJson('/api/public/properties/'.$property->slug)->assertOk()->json('data');
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'super_admin');

        return $user;
    }

    /** Joue les `ApplyWatermarkJob` retenus par `Queue::fake([ApplyWatermarkJob::class])`. */
    private function filigraner(?string $seulement = null): void
    {
        Queue::pushed(ApplyWatermarkJob::class)
            ->filter(fn (ApplyWatermarkJob $job) => $seulement === null || $job->conversionName === $seulement)
            ->each(fn (ApplyWatermarkJob $job) => $job->handle(new WatermarkService));
    }

    // ── D2 — l'original n'est plus dans le seau public ─────────────────────────────────────

    public function test_the_original_is_on_the_private_disk_and_only_conversions_on_the_public_one(): void
    {
        $media = $this->photo($this->bien());

        $this->assertSame('r2-private', $media->disk);
        $this->assertSame('r2-media', $media->conversions_disk);

        $this->assertTrue($this->private->exists($media->getPathRelativeToRoot()));
        $this->assertFalse($this->public->exists($media->getPathRelativeToRoot()), 'L\'original ne doit pas être dans le seau public.');

        $publics = $this->public->allFiles();
        $this->assertNotEmpty($publics);
        foreach ($publics as $fichier) {
            $this->assertStringContainsString('/conversions/', $fichier, "Seul un fichier de conversion a sa place dans le seau public : {$fichier}");
        }
    }

    /**
     * La preuve du vérificateur, rejouée : la clé de l'original se déduit de l'URL de `full`
     * en retirant `conversions/` et `-full`. Elle ne mène plus à rien sur le seau public.
     */
    public function test_the_original_key_derived_from_full_does_not_exist_on_the_public_disk(): void
    {
        $property = $this->bien();
        $media = $this->photo($property);

        $full = $this->detail($property)['photos'][0]['full'];
        $cle = ltrim(strtok((string) parse_url($full, PHP_URL_PATH), '?'), '/');
        $cle = preg_replace('#^storage/#', '', $cle);
        $deduite = str_replace(['conversions/', '-full'], '', $cle);

        $this->assertSame($media->getPathRelativeToRoot(), $deduite, 'Précondition : la dérivation retrouve bien la clé de l\'original.');
        $this->assertFalse($this->public->exists($deduite));
    }

    /** Les conversions se produisent depuis l'original PRIVÉ, sur disque distant. */
    public function test_conversions_are_generated_from_the_private_original(): void
    {
        $media = $this->photo($this->bien());

        $taille = getimagesizefromstring($this->public->get($media->getPathRelativeToRoot('full')));

        $this->assertSame([1600, 1200], array_slice($taille, 0, 2));
    }

    public function test_view_raw_receives_a_signed_url_that_leads_to_the_private_original(): void
    {
        $property = $this->bien();
        $media = $this->photo($property);

        Sanctum::actingAs($this->superAdmin());
        $original = $this->detail($property)['photos'][0]['original'];

        $this->assertStringContainsString("/api/media/{$media->id}/file", $original);

        $cible = (string) $this->get($original)->assertRedirect()->headers->get('Location');
        $this->assertStringStartsWith(RemoteDiskFake::PRESIGNED_HOST.'/r2-private/'.$media->getPathRelativeToRoot(), $cible);
    }

    public function test_an_anonymous_raw_request_never_receives_the_original(): void
    {
        $property = $this->bien();
        $media = $this->photo($property);

        $photo = $this->getJson('/api/public/properties/'.$property->slug.'?raw=1')->assertOk()->json('data.photos.0');

        $this->assertSame($media->getUrl('full'), $photo['original']);
        $this->assertStringNotContainsString('/file', $photo['original']);
    }

    // ── D3 — pas d'URL publique avant le filigrane ─────────────────────────────────────────

    public function test_no_public_url_is_emitted_before_the_watermark(): void
    {
        Queue::fake([ApplyWatermarkJob::class]);

        $property = $this->bien($this->agence(true));
        Address::create([
            'addressable_type' => Property::class, 'addressable_id' => $property->id,
            'city' => 'Dakar', 'country' => 'SN', 'latitude' => 14.7, 'longitude' => -17.5,
        ]);
        $media = $this->photo($property);

        $this->assertTrue($media->hasGeneratedConversion('full'), 'Précondition : les conversions sont produites.');
        $this->assertSame([], $media->getCustomProperty('watermarked_conversions', []), 'Précondition : aucune n\'est filigranée.');

        $detail = $this->detail($property);
        $this->assertSame([], $detail['photos'], 'Aucune conversion nue ne doit sortir.');
        $this->assertNull($detail['main_photo_url']);
        $carte = $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0')->assertOk()->assertJsonCount(1, 'features');
        $this->assertNull($carte->json('features.0.properties.thumbnail'));

        Sanctum::actingAs(User::factory()->create());
        $fil = $this->getJson("/api/public/properties/{$property->slug}/conversation")->assertOk();
        $this->assertSame($property->id, $fil->json('data.property.id'));
        $this->assertNull($fil->json('data.property.main_photo_url'));

        // La miniature filigranée : le repli la sert pour les trois tailles.
        $this->filigraner('thumbnail');
        $media->refresh(); // le filigrane change `?v=` (ADR-0029 §6)
        $photo = $this->detail($property)['photos'][0];
        $this->assertSame($media->getUrl('thumbnail'), $photo['full']);
        $this->assertSame($media->getUrl('thumbnail'), $photo['preview']);

        // Tout filigrané : chaque clé rend sa conversion.
        $this->filigraner();
        $media->refresh();
        $photo = $this->detail($property)['photos'][0];
        $this->assertSame($media->getUrl('full'), $photo['full']);
        $this->assertSame($media->getUrl('preview'), $photo['preview']);
    }

    public function test_generated_conversions_are_served_when_no_watermark_is_required(): void
    {
        Queue::fake([ApplyWatermarkJob::class]);

        $property = $this->bien($this->agence(false));
        $media = $this->photo($property);

        Queue::assertNothingPushed();
        $this->assertSame($media->getUrl('full'), $this->detail($property)['photos'][0]['full']);
    }

    /**
     * La console (`GET /api/properties/{id}/media`) est ouverte à tout compte sur un bien
     * public publié (`PropertyPolicy::viewMedia`). Sans `viewRaw` : ni original, ni conversion
     * nue. Avec `viewRaw` : l'original signé, et la miniature même avant son filigrane.
     */
    public function test_console_follows_view_raw(): void
    {
        Queue::fake([ApplyWatermarkJob::class]);

        $property = $this->bien($this->agence(true));
        $media = $this->photo($property);

        Sanctum::actingAs(User::factory()->create());
        $quelconque = $this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data.0');
        $this->assertNull($quelconque['thumbnail']);
        $this->assertNull($quelconque['full']);
        $this->assertNull($quelconque['original'], 'Un compte quelconque ne reçoit jamais l\'original (TCK-106).');

        Sanctum::actingAs($this->superAdmin());
        $brut = $this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data.0');
        $this->assertSame($media->getUrl('full'), $brut['full']);
        $this->assertStringContainsString("/api/media/{$media->id}/file", $brut['original']);

        $this->filigraner();
        $media->refresh();
        Sanctum::actingAs(User::factory()->create());
        $quelconque = $this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data.0');
        $this->assertSame($media->getUrl('full'), $quelconque['full']);
        $this->assertSame($media->getUrl('full'), $quelconque['original']);
    }

    /**
     * Mesure du N+1 : des biens d'agence dont les photos sont filigranées ne lisent PAS leur
     * agence pour décider de `main_photo_url` — la trace suffit, et la règle n'est évaluée
     * qu'à défaut (`Closure`).
     */
    public function test_listing_watermarked_photos_does_not_read_the_agency(): void
    {
        $agency = $this->agence(true);
        foreach (range(1, 3) as $_) {
            $this->photo($this->bien($agency));
        }

        $biens = Property::query()->with('media')->get();
        $this->assertCount(3, $biens);

        DB::enableQueryLog();
        $lignes = PropertyResource::collection($biens)->resolve(Request::create('/'));
        $lectures = collect(DB::getQueryLog())->filter(fn (array $q) => str_contains($q['query'], '"agencies"'))->count();
        DB::disableQueryLog();

        $this->assertNotNull($lignes[0]['main_photo_url']);
        $this->assertSame(0, $lectures, "Lectures de l'agence pour 3 biens filigranés : {$lectures}.");
    }

    // ── D4 — la duplication ne recopie pas la trace ────────────────────────────────────────

    /**
     * En OCTETS, à la manière du vérificateur : même original, même agence, donc même
     * filigrane — le `full` du clone doit être identique octet pour octet à celui de la source.
     * Avec la trace recopiée, il restait nu, donc différent.
     */
    public function test_a_duplicated_photo_is_watermarked_on_the_clone(): void
    {
        $agency = $this->agence(true);
        $source = $this->bien($agency);
        $sourceMedia = $this->photo($source);
        $this->assertContains('full', $sourceMedia->getCustomProperty('watermarked_conversions', []), 'Précondition : la source est filigranée.');

        $clone = app(PropertyDuplicationService::class)->duplicate($source, User::factory()->create(), ['copy_media' => true]);
        $cloneMedia = $clone->getFirstMedia('photos');

        $this->assertNotNull($cloneMedia);
        $this->assertNotSame($sourceMedia->id, $cloneMedia->id);
        $this->assertSame('r2-private', $cloneMedia->disk);
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $cloneMedia->getCustomProperty('watermarked_conversions', []));

        foreach (Property::watermarkedConversions() as $conversion) {
            $this->assertSame(
                $this->public->get($sourceMedia->getPathRelativeToRoot($conversion)),
                $this->public->get($cloneMedia->getPathRelativeToRoot($conversion)),
                "`{$conversion}` du clone doit être filigranée exactement comme celle de la source.",
            );
        }
    }
}
