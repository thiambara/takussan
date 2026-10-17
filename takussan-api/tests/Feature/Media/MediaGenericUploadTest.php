<?php

namespace Tests\Feature\Media;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-764 (P10.08) — `POST /api/media/upload`, l'envoi « générique » attaché au compte appelant,
 * est retiré. Il n'avait aucun appelant : tout compte y déposait 30 fichiers par minute dans ses
 * propres `photos` ou `documents`, que rien ne lit ni ne nettoie. Ses cas de validation vivent
 * dans `MediaUploadTest` (`POST /api/media`), et ses deux cas de disque dans
 * `MediaDiskPrivatePhotosTest`. Cette classe garde le retrait.
 */
class MediaGenericUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
    }

    public function test_the_generic_upload_route_is_gone(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->assertFalse(Route::has('media.upload'));

        // 405 et non 404 : `DELETE media/{media}` couvre le même chemin.
        $status = $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('hero.jpg', 400, 400),
            'collection' => 'photos',
        ])->status();
        $this->assertContains($status, [404, 405]);

        $this->assertDatabaseCount('media', 0);
    }
}
