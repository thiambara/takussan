<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Listeners\Media\ApplyWatermarkOnConversionListener;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Spatie\MediaLibrary\Conversions\Conversion;
use Spatie\MediaLibrary\Conversions\Events\ConversionHasBeenCompletedEvent;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

class ApplyWatermarkJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Queue::fake();
    }

    private function createAgencyWithProperty(array $settings = []): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $admin->id,
            'settings' => array_merge(['watermark_enabled' => true], $settings),
        ]);
        $admin->update(['agency_id' => $agency->id]);

        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $admin->id,
        ]);

        return [$admin, $agency, $property];
    }

    private function fakeConversionEvent(Media $media, string $conversionName): ConversionHasBeenCompletedEvent
    {
        $conversion = Mockery::mock(Conversion::class);
        $conversion->shouldReceive('getName')->andReturn($conversionName);

        return new ConversionHasBeenCompletedEvent($media, $conversion);
    }

    public function test_listener_dispatches_job_when_property_photo_uploaded(): void
    {
        [, , $property] = $this->createAgencyWithProperty();

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        $event = $this->fakeConversionEvent($media, 'thumbnail');

        $listener = new ApplyWatermarkOnConversionListener;
        $listener->handle($event);

        Queue::assertPushed(ApplyWatermarkJob::class, fn ($job) => $job->mediaId === $media->id
            && $job->conversionName === 'thumbnail');
    }

    public function test_listener_does_not_dispatch_when_watermark_disabled(): void
    {
        [, , $property] = $this->createAgencyWithProperty(['watermark_enabled' => false]);

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        Queue::fake();

        $event = $this->fakeConversionEvent($media, 'thumbnail');

        $listener = new ApplyWatermarkOnConversionListener;
        $listener->handle($event);

        Queue::assertNothingPushed();
    }

    public function test_listener_does_not_dispatch_for_avatar_or_lease_collection(): void
    {
        $user = User::factory()->create();

        $avatarMedia = $user->addMedia(UploadedFile::fake()->image('avatar.jpg'))
            ->usingFileName('avatar.jpg')
            ->toMediaCollection('avatar');

        Queue::fake();

        $event = $this->fakeConversionEvent($avatarMedia, 'thumbnail');

        $listener = new ApplyWatermarkOnConversionListener;
        $listener->handle($event);

        Queue::assertNothingPushed();
    }

    public function test_job_writes_watermarked_file_in_place(): void
    {
        [, $agency, $property] = $this->createAgencyWithProperty();

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg', 800, 600))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        $media->refresh();
        $originalUrl = $media->getUrl();

        $conversionPath = storage_path('app/public/'.$media->id.'/conversions/photo-thumbnail.jpg');
        $dir = dirname($conversionPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $img = imagecreatetruecolor(300, 300);
        imagefill($img, 0, 0, imagecolorallocate($img, 100, 150, 200));
        imagejpeg($img, $conversionPath, 90);
        imagedestroy($img);

        $hashBefore = md5_file($conversionPath);

        $serviceMock = Mockery::mock(WatermarkService::class);
        $serviceMock->shouldReceive('apply')
            ->once()
            ->withArgs(fn ($path, $ctx) => str_ends_with($path, '.jpg'))
            ->andReturnUsing(function ($path) {
                $img = imagecreatefromjpeg($path);
                $color = imagecolorallocate($img, 255, 255, 255);
                imagestring($img, 3, 5, 5, 'WM', $color);
                imagejpeg($img, $path, 90);
                imagedestroy($img);
            });

        $this->app->instance(WatermarkService::class, $serviceMock);

        $job = new ApplyWatermarkJob($media->id, 'thumbnail');
        $job->handle($serviceMock);

        $media->refresh();
        $watermarked = $media->getCustomProperty('watermarked_conversions', []);
        $this->assertContains('thumbnail', $watermarked);

        $this->assertEquals($originalUrl, $media->getUrl(), 'Original URL must be unchanged');
    }

    public function test_job_marks_custom_property_watermarked_conversions(): void
    {
        [, $agency, $property] = $this->createAgencyWithProperty();

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        $conversionPath = storage_path('app/public/'.$media->id.'/conversions/photo-thumbnail.jpg');
        $dir = dirname($conversionPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $img = imagecreatetruecolor(300, 300);
        imagejpeg($img, $conversionPath);
        imagedestroy($img);

        $serviceMock = Mockery::mock(WatermarkService::class);
        $serviceMock->shouldReceive('apply')->once();
        $this->app->instance(WatermarkService::class, $serviceMock);

        $job = new ApplyWatermarkJob($media->id, 'thumbnail');
        $job->handle($serviceMock);

        $media->refresh();
        $this->assertContains('thumbnail', $media->getCustomProperty('watermarked_conversions', []));

        $job2 = new ApplyWatermarkJob($media->id, 'thumbnail');
        $serviceMock->shouldNotReceive('apply');
        $job2->handle($serviceMock);
    }
}
