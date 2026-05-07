<?php

namespace Tests\Feature\Api\Admin;

use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

class AlertRuleTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_unknown_event_is_rejected_and_agency_admin_forbidden(): void
    {
        $this->actingAsRole('agency_admin');
        $this->postJson('/api/admin/alert-rules', [])->assertForbidden();

        $this->actingAsRole('super_admin');
        $this->postJson('/api/admin/alert-rules', [
            'event' => 'unknown_event',
            'channels' => ['slack'],
            'recipients' => ['webhooks' => ['https://hooks.example.test/x']],
            'is_active' => true,
        ])->assertUnprocessable();
    }

    public function test_sensitive_activity_dispatches_async_alert_without_target_email(): void
    {
        Queue::fake();
        $actor = $this->actingAsRole('super_admin');
        AlertRule::create([
            'event' => 'super_admin_impersonation_started',
            'channels_json' => ['slack'],
            'recipients_json' => ['webhooks' => ['https://hooks.example.test/x']],
            'is_active' => true,
        ]);

        activity('User')
            ->causedBy($actor)
            ->withProperties(['target_email' => 'target@example.test'])
            ->event('super_admin_impersonation_started')
            ->log('impersonation');

        Queue::assertPushed(SendAdminAlert::class, function (SendAdminAlert $job) {
            $payload = json_encode($job->alert);

            return str_contains($payload, 'super_admin_impersonation_started')
                && ! str_contains($payload, 'target@example.test');
        });
    }

    public function test_test_endpoint_prefixes_message_and_failure_count_can_increment(): void
    {
        Queue::fake();
        $this->actingAsRole('super_admin');
        $created = $this->postJson('/api/admin/alert-rules', [
            'event' => 'super_admin_setting_updated',
            'channels' => ['email'],
            'recipients' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ])->assertCreated();
        $rule = AlertRule::findOrFail($created->json('data.id'));

        $this->postJson("/api/admin/alert-rules/{$rule->id}/test")->assertOk();

        Queue::assertPushed(SendAdminAlert::class, fn (SendAdminAlert $job) => str_starts_with($job->alert['message'], '[TEST]'));

        (new SendAdminAlert($rule->id, ['message' => 'x']))->failed();
        $this->assertSame(1, $rule->refresh()->failure_count);
        $this->assertTrue(Activity::query()->where('event', 'super_admin_alert_rule_created')->exists());
    }
}
