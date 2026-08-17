<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Announcement;
use App\Models\AnnouncementDismissal;
use App\Models\Enums\AnnouncementSeverity;
use App\Models\User;
use App\Services\Announcements\AnnouncementResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class AnnouncementTest extends TestCase
{
    use RefreshDatabase;

    public function test_role_segment_isolation(): void
    {
        $this->actingAsRole('super_admin');
        $announcement = $this->announcement(['segment' => ['roles' => ['agency_admin']]]);

        $this->actingAsRole('customer');
        $this->getJson('/api/announcements/active')
            ->assertOk()
            ->assertJsonMissing(['id' => $announcement->id]);

        $this->actingAsRole('agency_admin');
        $this->getJson('/api/announcements/active')
            ->assertOk()
            ->assertJsonPath('data.0.id', $announcement->id);
    }

    public function test_rollout_bucket_is_stable(): void
    {
        $user = $this->actingAsRole('customer');
        $announcement = $this->announcement(['segment' => ['rollout_percentage' => 50]]);
        $resolver = app(AnnouncementResolver::class);

        $this->assertSame(
            $resolver->matches($announcement, $user),
            $resolver->matches($announcement, $user),
        );
    }

    public function test_critical_announcement_is_not_dismissed_while_active(): void
    {
        $this->actingAsRole('customer');
        $announcement = $this->announcement(['severity' => AnnouncementSeverity::Critical]);

        $this->postJson("/api/announcements/{$announcement->id}/dismiss")
            ->assertOk()
            ->assertJsonPath('data.dismissed', false);

        $this->assertDatabaseMissing('announcement_dismissals', [
            'announcement_id' => $announcement->id,
        ]);

        $this->getJson('/api/announcements/active')
            ->assertOk()
            ->assertJsonPath('data.0.id', $announcement->id);
    }

    public function test_dismiss_is_idempotent(): void
    {
        $this->actingAsRole('customer');
        $announcement = $this->announcement();

        $this->postJson("/api/announcements/{$announcement->id}/dismiss")->assertOk();
        $this->postJson("/api/announcements/{$announcement->id}/dismiss")->assertOk();

        $this->assertSame(1, AnnouncementDismissal::query()->where('announcement_id', $announcement->id)->count());
    }

    public function test_agency_admin_cannot_write_and_super_admin_mutation_is_audited(): void
    {
        $payload = $this->payload();

        $this->actingAsRole('agency_admin');
        $this->postJson('/api/admin/announcements', $payload)->assertForbidden();

        $this->actingAsRole('super_admin');
        $this->postJson('/api/admin/announcements', $payload)
            ->assertCreated()
            ->assertJsonPath('data.title.fr', 'Maintenance programmée');

        $this->assertTrue(Activity::query()->where('event', 'super_admin_announcement_created')->exists());
    }

    public function test_agency_segment_matches_active_profile_agency(): void
    {
        $agency = Agency::factory()->create();
        $user = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $announcement = $this->announcement(['segment' => ['agency_ids' => [$agency->id]]]);

        $this->actingAs($user);

        $this->getJson('/api/announcements/active')
            ->assertOk()
            ->assertJsonPath('data.0.id', $announcement->id);
    }

    /**
     * @param  array<string,mixed>  $attributes
     */
    private function announcement(array $attributes = []): Announcement
    {
        return Announcement::query()->create(array_merge($this->payload(), $attributes));
    }

    /**
     * @return array<string,mixed>
     */
    private function payload(): array
    {
        return [
            'title' => [
                'fr' => 'Maintenance programmée',
                'en' => 'Scheduled maintenance',
                'wo' => 'Jagle bu ñu tëral',
            ],
            'body' => [
                'fr' => 'Une intervention est prévue ce soir.',
                'en' => 'Maintenance is planned tonight.',
                'wo' => 'Am na liggéey bu ñu tëral tey guddi.',
            ],
            'severity' => AnnouncementSeverity::Warning,
            'segment' => [],
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addDay(),
            'is_active' => true,
            'created_by' => User::factory()->create()->id,
        ];
    }
}
