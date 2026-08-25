<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Listeners\Media\ApplyWatermarkOnConversionListener;
use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Spatie\MediaLibrary\Conversions\Conversion;
use Spatie\MediaLibrary\Conversions\Events\ConversionHasBeenCompletedEvent;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

/**
 * TCK-356 — la plus grande image servie au public.
 *
 * ⚠ **Chaque test qui mesure une dimension fabrique sa propre source, et c'est
 * délibéré.** Le parc local n'est fait que de vignettes de seed : 250 originaux
 * échantillonnés le 2026-08-24 donnaient 128×128 (131 fois), 800×600 (104), 1×1 (11),
 * 512×512 (4). Un critère écrit sur ces données-là serait vert **sans** le correctif —
 * une source de 128 px ne peut produire aucune conversion de 1600 px, et une source de
 * 800 px rendrait un `full` de 800 px que l'ancien `preview` rendait déjà.
 */
class PropertyMediaConversionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /** Une source de 2400 × 1800 — au-dessus de `full`, donc la conversion RÉDUIT. */
    private function grandeSource(): UploadedFile
    {
        return UploadedFile::fake()->image('villa.jpg', 2400, 1800);
    }

    private function bienAvecPhoto(?Agency $agency = null, ?UploadedFile $fichier = null): array
    {
        $user = User::factory()->create();

        $property = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency?->id,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
        ]);

        $media = $property->addMedia($fichier ?? $this->grandeSource())
            ->usingFileName('villa.jpg')
            ->toMediaCollection('photos');

        return [$user, $property, $media];
    }

    private function agenceFiligranee(bool $enabled = true): Agency
    {
        $admin = User::factory()->create();

        return Agency::factory()->create([
            'primary_admin_id' => $admin->id,
            'settings' => ['watermark_enabled' => $enabled],
        ]);
    }

    /**
     * AC1 — la conversion `full` existe et fait 1600 px de large.
     */
    public function test_full_conversion_is_generated_at_1600_px_wide(): void
    {
        [, , $media] = $this->bienAvecPhoto();

        $this->assertTrue($media->hasGeneratedConversion('full'), 'La conversion `full` doit être produite à l\'upload.');

        $taille = getimagesize($media->getPath('full'));

        $this->assertNotFalse($taille);
        $this->assertSame(1600, $taille[0], 'TCK-356 : `full` doit faire 1600 px de large.');
        // Largeur seule : le ratio de la source (4:3) est conservé, pas recadré.
        $this->assertSame(1200, $taille[1], '`full` ne doit pas recadrer — hauteur libre.');
    }

    /**
     * AC1 (versant ablation) — la source du parc local ne peut PAS démontrer le correctif.
     *
     * Ce test n'existe pas pour garder une propriété du produit mais pour garder la
     * VALIDITÉ des autres : il échoue le jour où quelqu'un ré-écrit AC1 sur une photo
     * seedée en croyant simplifier.
     */
    public function test_a_800_px_source_cannot_demonstrate_the_fix(): void
    {
        [, , $media] = $this->bienAvecPhoto(null, UploadedFile::fake()->image('seed.jpg', 800, 600));

        $taille = getimagesize($media->getPath('full'));

        $this->assertNotFalse($taille);
        $this->assertSame(800, $taille[0], 'Une source de 800 px rend un `full` de 800 px : le critère AC1 exige une fixture plus grande.');
    }

    /**
     * AC2 (versant liste) — la liste unique couvre EXACTEMENT les conversions déclarées.
     *
     * C'est le garde-fou de la contrainte 1 du ticket : `originalUrlFor()` sert la plus
     * grande conversion à tout appelant sans `viewRaw`, donc une conversion absente de la
     * liste part au public sans filigrane. L'assertion porte sur la liste, jamais sur
     * trois noms écrits en dur ici — sinon ajouter une quatrième conversion resterait vert.
     */
    public function test_every_registered_conversion_is_covered_by_the_watermark_list(): void
    {
        $property = Property::factory()->make();
        $property->registerAllMediaConversions();

        $declarees = array_map(fn ($c) => $c->getName(), $property->mediaConversions);

        $this->assertEqualsCanonicalizing(
            $declarees,
            Property::watermarkedConversions(),
            'Toute conversion de `Property` doit figurer dans watermarkedConversions(), et réciproquement : '
            .'une conversion non listée part au public sans filigrane, une entrée listée sans conversion est morte.'
        );
    }

    /**
     * AC2 — le listener met `full` en file de filigranage.
     *
     * ⚠ Le listener est `ShouldQueue` : sous `Queue::fake()` il est lui-même mis en
     * file et ne tourne jamais. On l'invoque donc directement, comme le fait déjà
     * `ApplyWatermarkJobTest` — sinon le test serait vert par accident, faute
     * d'exécuter le code qu'il prétend éprouver.
     */
    public function test_listener_queues_the_full_conversion_for_watermarking(): void
    {
        $agency = $this->agenceFiligranee();
        [, , $media] = $this->bienAvecPhoto($agency);

        Queue::fake();

        $conversion = Mockery::mock(Conversion::class);
        $conversion->shouldReceive('getName')->andReturn('full');

        (new ApplyWatermarkOnConversionListener)->handle(
            new ConversionHasBeenCompletedEvent($media, $conversion)
        );

        Queue::assertPushed(
            ApplyWatermarkJob::class,
            fn (ApplyWatermarkJob $job) => $job->mediaId === $media->id && $job->conversionName === 'full'
        );
    }

    /**
     * AC2 (versant effet, de bout en bout) — un simple upload suffit à filigraner `full`.
     *
     * Rien n'est simulé ici : `QUEUE_CONNECTION=sync` en test, donc le listener puis
     * `ApplyWatermarkJob` tournent pendant `addMedia()`. C'est la propriété qui compte
     * pour la contrainte 1 du ticket — la plus grande image servie au public porte le
     * filigrane — et elle vaut plus qu'un espion sur le service, qui serait vert même
     * si le listener ne voyait jamais `full`.
     *
     * ⚠ Corollaire mesuré : rejouer `ApplyWatermarkJob` à la main après un upload ne
     * fait RIEN — `watermarked_conversions` porte déjà la conversion et le job sort
     * aussitôt. C'est aussi pourquoi la commande de régénération purge cette trace
     * AVANT de réécrire les fichiers.
     */
    public function test_uploading_a_photo_watermarks_the_full_conversion(): void
    {
        $agency = $this->agenceFiligranee();
        [, , $media] = $this->bienAvecPhoto($agency);

        $this->assertContains(
            'full',
            $media->fresh()->getCustomProperty('watermarked_conversions', []),
            'La plus grande conversion servie au public doit être filigranée (TCK-106, TCK-356).'
        );
    }

    /**
     * AC2 (revers) — sans filigrane activé, aucune conversion n'est marquée.
     *
     * Sans ce revers, le test ci-dessus resterait vert si le filigrane était appliqué
     * inconditionnellement, ce qui n'est pas la règle.
     */
    public function test_no_conversion_is_watermarked_when_the_agency_disabled_it(): void
    {
        $agency = $this->agenceFiligranee(false);
        [, , $media] = $this->bienAvecPhoto($agency);

        $this->assertSame([], $media->fresh()->getCustomProperty('watermarked_conversions', []));
    }

    /**
     * AC3 — sans `viewRaw`, `original` pointe sur `full` et jamais sur le fichier source.
     */
    public function test_public_detail_exposes_full_and_never_the_source_file(): void
    {
        [, $property, $media] = $this->bienAvecPhoto();

        $reponse = $this->getJson('/api/public/properties/'.$property->slug)->assertOk();

        $photo = $reponse->json('data.photos.0');

        $this->assertSame($media->getUrl('full'), $photo['full']);
        $this->assertSame($media->getUrl('full'), $photo['original']);
        $this->assertNotSame($media->getUrl(), $photo['original'], 'Le fichier source ne doit jamais être servi au public (TCK-106).');
        $this->assertSame($media->getUrl('preview'), $photo['preview']);
    }

    /**
     * AC3 (revers) — avec `viewRaw`, `original` reste le fichier source.
     *
     * TCK-356 déplace la valeur de REPLI, jamais la CONDITION.
     */
    public function test_authorized_caller_still_receives_the_source_file(): void
    {
        $agency = $this->agenceFiligranee(false);
        [, $property, $media] = $this->bienAvecPhoto($agency);

        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        $reponse = $this->actingAs($superAdmin)
            ->getJson('/api/public/properties/'.$property->slug)
            ->assertOk();

        $this->assertSame($media->getUrl(), $reponse->json('data.photos.0.original'));
    }

    /**
     * Le repli tient tant que le parc n'est pas régénéré : un média d'avant TCK-356
     * n'a pas de `full`, et `getUrl('full')` ne le vérifie pas — il rendrait un 404.
     */
    public function test_media_without_a_full_conversion_falls_back_to_preview(): void
    {
        [, $property, $media] = $this->bienAvecPhoto();

        $conversions = $media->generated_conversions;
        unset($conversions['full']);
        $media->generated_conversions = $conversions;
        $media->save();

        $reponse = $this->getJson('/api/public/properties/'.$property->slug)->assertOk();

        $this->assertSame($media->fresh()->getUrl('preview'), $reponse->json('data.photos.0.original'));
    }

    /**
     * AC5 — après la commande de régénération, plus aucun média `photos` sans `full`.
     */
    public function test_regeneration_command_leaves_no_photo_without_a_full_conversion(): void
    {
        [, , $media] = $this->bienAvecPhoto();

        $conversions = $media->generated_conversions;
        unset($conversions['full']);
        $media->generated_conversions = $conversions;
        $media->save();

        $this->assertSame(1, $this->mediaSansFull(), 'Précondition : le média doit partir sans `full`.');

        $this->artisan('media:regenerate-property-conversions', ['--missing-only' => true])
            ->assertSuccessful();

        $this->assertSame(0, $this->mediaSansFull());
    }

    /**
     * La régénération purge `watermarked_conversions` AVANT de réécrire les fichiers.
     *
     * Sans cette purge, `ApplyWatermarkJob` sortirait sans rien faire sur un fichier que
     * `media-library:regenerate` vient de réécrire depuis la source — donc nu.
     */
    public function test_regeneration_resets_the_watermark_trace_before_rewriting(): void
    {
        Queue::fake();

        $agency = $this->agenceFiligranee();
        [, , $media] = $this->bienAvecPhoto($agency);

        $media->setCustomProperty('watermarked_conversions', ['thumbnail', 'preview', 'full']);
        $media->save();

        $this->artisan('media:regenerate-property-conversions')->assertSuccessful();

        $this->assertSame([], $media->fresh()->getCustomProperty('watermarked_conversions', []));

        foreach (Property::watermarkedConversions() as $conversion) {
            Queue::assertPushed(
                ApplyWatermarkJob::class,
                fn (ApplyWatermarkJob $job) => $job->mediaId === $media->id && $job->conversionName === $conversion
            );
        }
    }

    private function mediaSansFull(): int
    {
        return Media::query()
            ->where('model_type', Property::class)
            ->where('collection_name', 'photos')
            ->get()
            ->reject(fn (Media $m) => $m->hasGeneratedConversion('full'))
            ->count();
    }
}
