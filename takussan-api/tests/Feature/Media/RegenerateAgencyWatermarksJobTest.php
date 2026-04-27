<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RegenerateAgencyWatermarksJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Queue::fake();
    }

    private function createAgencyWithPropertyAndMedia(array $settings = []): array
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

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        return [$admin, $agency, $property, $media];
    }

    public function test_disabling_watermark_then_running_job_strips_existing_watermarks(): void
    {
        [, $agency, , $media] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        $media->setCustomProperty('watermarked_conversions', ['thumbnail', 'preview']);
        $media->save();

        $agency->update(['settings' => ['watermark_enabled' => false]]);

        $job = new RegenerateAgencyWatermarksJob($agency->id);
        $job->handle();

        $media->refresh();
        $this->assertEquals([], $media->getCustomProperty('watermarked_conversions', []));

        Queue::assertNotPushed(ApplyWatermarkJob::class);
    }

    public function test_changing_logo_then_running_job_uses_new_logo(): void
    {
        [, $agency] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        $job = new RegenerateAgencyWatermarksJob($agency->id);
        $job->handle();

        Queue::assertPushed(ApplyWatermarkJob::class);
    }

    public function test_other_agency_photos_untouched(): void
    {
        [, $agencyA, , $mediaA] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);
        [, $agencyB, , $mediaB] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        $mediaA->setCustomProperty('watermarked_conversions', ['thumbnail']);
        $mediaA->save();

        $job = new RegenerateAgencyWatermarksJob($agencyB->id);
        $job->handle();

        $mediaA->refresh();
        $this->assertEquals(['thumbnail'], $mediaA->getCustomProperty('watermarked_conversions', []),
            'Media from agency A must not be touched when regenerating agency B');
    }
}
