<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\PurgeCdnCacheJob;
use App\Models\User;
use App\Services\Media\Cdn\CdnProviderContract;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

class PurgeCdnCacheJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Queue::fake();

        config([
            'cdn.enabled' => true,
            'cdn.base_url' => 'https://cdn.example.com',
            'cdn.signing_key' => 'test-secret',
        ]);
    }

    private function createUserWithMedia(): Media
    {
        $user = User::factory()->create();

        return $user->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');
    }

    public function test_delete_dispatches_purge_job(): void
    {
        $media = $this->createUserWithMedia();

        $media->delete();

        Queue::assertPushed(PurgeCdnCacheJob::class);
    }

    public function test_clear_collection_dispatches_purge_job(): void
    {
        $media = $this->createUserWithMedia();
        $owner = $media->model;

        $owner->clearMediaCollection('photos');

        Queue::assertPushed(PurgeCdnCacheJob::class);
    }

    public function test_metadata_only_update_does_not_dispatch_purge(): void
    {
        $media = $this->createUserWithMedia();
        Queue::fake();

        $media->custom_properties = ['caption' => 'updated'];
        $media->save();

        Queue::assertNothingPushed();
    }

    public function test_purge_skipped_when_cdn_disabled(): void
    {
        config(['cdn.enabled' => false]);

        $media = $this->createUserWithMedia();
        Queue::fake();

        $media->delete();

        Queue::assertNothingPushed();
    }

    public function test_job_calls_provider_purge_with_snapshot_urls(): void
    {
        $urls = [
            'https://cdn.example.com/media/1/photo.jpg',
            'https://cdn.example.com/media/1/conversions/photo-thumbnail.jpg',
        ];

        $cdn = $this->mock(CdnProviderContract::class);
        $cdn->shouldReceive('purge')
            ->once()
            ->with($urls)
            ->andReturn(true);

        $job = new PurgeCdnCacheJob($urls);
        $job->handle($cdn);
    }
}
