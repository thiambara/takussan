<?php

namespace Tests\Feature\Radar;

use App\Models\Property;
use App\Services\Radar\RadarCopyPathGenerator;
use App\Services\Radar\RadarPurger;
use Carbon\Carbon;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2406 (AC1) — les copies que « Publier pour lui » écrit sous un média jamais commité (requête coupée par
 * `max_execution_time` : ni le `catch` ni `discardFiles` ne passent) : l'original sur le disque PRIVÉ, la vignette
 * synchrone sur le PUBLIC. Elles se rangent sous un préfixe à elles ({@see RadarCopyPathGenerator}), que la purge balaie
 * sur les deux disques, et rien d'autre.
 */
class RadarPublicationCopiesTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-30 10:00:00');
        $this->installerLaPublication();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function prive(): Filesystem
    {
        return Storage::disk((string) config('media-library.disk_name'));
    }

    private function public(): Filesystem
    {
        return Storage::disk((string) config('media-library.public_disk_name'));
    }

    /** @return list<int> les biens créés */
    private function publier(array $ids): array
    {
        return $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => $ids])
            ->assertCreated()
            ->json('data.properties.*.id');
    }

    /** Vieillit tous les fichiers des deux disques de `$minutes` minutes avant l'instant simulé. */
    private function vieillir(int $minutes): void
    {
        foreach ([$this->prive(), $this->public()] as $disque) {
            foreach ($disque->allFiles() as $fichier) {
                touch($disque->path($fichier), now()->subMinutes($minutes)->getTimestamp());
            }
        }
    }

    /** @return list<string> les fichiers sous le préfixe des copies, sur les deux disques */
    private function copies(): array
    {
        return [...$this->prive()->allFiles(RadarCopyPathGenerator::root()), ...$this->public()->allFiles(RadarCopyPathGenerator::root())];
    }

    public function test_les_copies_de_la_publication_se_rangent_sous_leur_prefixe_original_et_vignette(): void
    {
        $annonce = $this->annonceConsentie(photos: 2);

        [$id] = $this->publier([$annonce->id]);

        $photos = Property::query()->findOrFail($id)->getMedia('photos');
        $this->assertCount(2, $photos);
        foreach ($photos as $photo) {
            $base = RadarCopyPathGenerator::root().'/'.$photo->id.'/';
            $this->assertStringStartsWith($base, $photo->getPathRelativeToRoot());
            $this->assertTrue($this->prive()->exists($photo->getPathRelativeToRoot()), 'l\'original, disque privé');
            $this->assertStringStartsWith($base.'conversions/', $photo->getPathRelativeToRoot('thumbnail'));
            $this->assertTrue($this->public()->exists($photo->getPathRelativeToRoot('thumbnail')), 'la vignette synchrone, disque public');
        }
        // La réserve, elle, reste au chemin de toujours : seul ce que la publication écrit change de place.
        $this->assertStringStartsNotWith(RadarCopyPathGenerator::root(), $annonce->getFirstMedia('radar_photos')->getPathRelativeToRoot());
    }

    public function test_ac1_une_publication_coupee_laisse_des_copies_que_la_purge_efface_apres_une_heure(): void
    {
        $annonce = $this->annonceConsentie(photos: 2);

        // La requête coupée : la publication a écrit ses fichiers, puis sa transaction est défaite sans que rien ne les nettoie.
        // Une transaction englobante défaite APRÈS le retour reproduit l'état : des fichiers, aucune ligne.
        DB::beginTransaction();
        [$id] = $this->publier([$annonce->id]);
        $ids = Property::query()->findOrFail($id)->getMedia('photos')->pluck('id')->all();
        DB::rollBack();
        $this->assertSame(0, Media::query()->whereIn('id', $ids)->count());
        $orphelins = $this->copies();
        $this->assertNotEmpty($this->prive()->allFiles(RadarCopyPathGenerator::root()));
        $this->assertNotEmpty($this->public()->allFiles(RadarCopyPathGenerator::root()));

        // Moins d'une heure : une transaction vivante peut encore y écrire sa ligne.
        $this->vieillir(30);
        $this->assertSame(0, app(RadarPurger::class)->run()['orphan_copies']);
        $this->assertSame($orphelins, $this->copies());

        $this->vieillir(61);
        $comptes = app(RadarPurger::class)->run();

        // Deux médias, chacun un dossier sur chaque disque.
        $this->assertSame(4, $comptes['orphan_copies']);
        $this->assertSame([], $this->copies());
        // La réserve de l'annonce n'est pas une copie : elle reste.
        $this->assertCount(2, $annonce->fresh()->getMedia('radar_photos'));
        foreach ($annonce->fresh()->getMedia('radar_photos') as $photo) {
            $this->assertTrue(Storage::disk($photo->disk)->exists($photo->getPathRelativeToRoot()));
        }
    }

    public function test_le_balayage_garde_les_copies_d_un_bien_publie_et_ne_regarde_que_sous_le_prefixe(): void
    {
        $annonce = $this->annonceConsentie(photos: 1);
        [$id] = $this->publier([$annonce->id]);
        // Un dossier numérique sans ligne à la RACINE du disque public : il n'est pas une copie du Radar, le balayage n'y regarde pas.
        $this->public()->put('987654/conversions/photo-thumbnail.jpg', self::jpeg(33));
        $this->vieillir(60 * 24 * 365 * 2);
        $avant = ['prive' => $this->prive()->allFiles(), 'public' => $this->public()->allFiles()];

        $this->assertSame(0, app(RadarPurger::class)->run()['orphan_copies']);

        $this->assertSame($avant['public'], $this->public()->allFiles());
        $this->assertSame($avant['prive'], $this->prive()->allFiles());
        $this->assertCount(1, Property::query()->findOrFail($id)->getMedia('photos'));
    }

    public function test_le_passage_d_un_seul_annonceur_ne_balaie_pas_les_copies(): void
    {
        $this->public()->put(RadarCopyPathGenerator::root().'/987654/conversions/photo-thumbnail.jpg', self::jpeg(33));
        $this->vieillir(600);

        $this->assertSame(0, app(RadarPurger::class)->run($this->annonceur->id)['orphan_copies']);
        $this->assertTrue($this->public()->exists(RadarCopyPathGenerator::root().'/987654/conversions/photo-thumbnail.jpg'));
    }

    public function test_supprimer_la_photo_publiee_efface_ses_fichiers_sous_le_prefixe(): void
    {
        $annonce = $this->annonceConsentie(photos: 1);
        [$id] = $this->publier([$annonce->id]);
        $photo = Property::query()->findOrFail($id)->getFirstMedia('photos');
        $this->assertNotEmpty($this->copies());

        $photo->delete();

        $this->assertSame([], $this->copies());
    }
}
