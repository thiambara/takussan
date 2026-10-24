<?php

namespace Tests\Feature\Media;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\PdfImageEmbedder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

/**
 * TCK-1425 (P143.03) — chaque photo d'état des lieux, et le logo de l'agence, étaient relus
 * entiers et réduits par GD à CHAQUE téléchargement du PDF (≈ 0,45 s par photo de 4 000 × 3 000,
 * 60 s dépassées vers 130 photos) : ni `Inventory` ni `Agency` ne déclaraient de conversion, et
 * `PdfImageEmbedder` retombait sur l'original. Une conversion `preview` en file, réduite comme
 * aujourd'hui, est prise avant l'original.
 */
class PdfImageConversionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_downloading_the_pdf_reduces_no_original_once_conversions_are_produced(): void
    {
        $agency = Agency::factory()->create();
        $agency->addMedia(UploadedFile::fake()->image('logo.png', 900, 300))->toMediaCollection('logo');

        [$owner, $inventory] = $this->signedInventory($agency);
        foreach (['Salon', 'Cuisine'] as $room) {
            $inventory->addMedia(UploadedFile::fake()->image("{$room}.jpg", 1600, 1200))
                ->withCustomProperties(['room_name' => $room])
                ->toMediaCollection('room_photos');
        }

        $spy = new class extends PdfImageEmbedder
        {
            public int $originals = 0;

            protected function reducedOriginal(Media $media, int $maxWidth, string $format): string
            {
                $this->originals++;

                return parent::reducedOriginal($media, $maxWidth, $format);
            }
        };
        $this->app->instance(PdfImageEmbedder::class, $spy);

        Sanctum::actingAs($owner);
        $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk();

        $this->assertSame(0, $spy->originals, 'Aucun original ne doit être réduit au téléchargement.');
    }

    public function test_the_previews_keep_todays_reduction(): void
    {
        $agency = Agency::factory()->create();
        $logo = $agency->addMedia(UploadedFile::fake()->image('logo.png', 900, 300))->toMediaCollection('logo');

        [, $inventory] = $this->signedInventory($agency);
        $photo = $inventory->addMedia(UploadedFile::fake()->image('salon.jpg', 1600, 1200))
            ->withCustomProperties(['room_name' => 'Salon'])
            ->toMediaCollection('room_photos');
        $other = $inventory->addMedia(UploadedFile::fake()->image('autre.jpg', 1600, 1200))->toMediaCollection('photos');

        $this->assertTrue($photo->refresh()->hasGeneratedConversion('preview'));
        $this->assertSame([600, 450], $this->previewSize($photo, 'image/jpeg'));

        $this->assertTrue($logo->refresh()->hasGeneratedConversion('preview'));
        $this->assertSame([320, 107], $this->previewSize($logo, 'image/png'), 'Le logo garde sa transparence (PNG) et ses 320 px (TCK-1233).');

        $this->assertFalse($other->refresh()->hasGeneratedConversion('preview'), 'Seule `room_photos` est convertie.');
    }

    /** @return array{0: int, 1: int} */
    private function previewSize(Media $media, string $mime): array
    {
        $bytes = Storage::disk($media->conversions_disk)
            ->get($media->getPathRelativeToRoot('preview'));
        $this->assertSame($mime, (new \finfo(FILEINFO_MIME_TYPE))->buffer((string) $bytes));
        $info = getimagesizefromstring((string) $bytes);

        return [$info[0], $info[1]];
    }

    /** @return array{0: User, 1: Inventory} */
    private function signedInventory(Agency $agency): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);

        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);

        return [$owner, $inventory];
    }
}
