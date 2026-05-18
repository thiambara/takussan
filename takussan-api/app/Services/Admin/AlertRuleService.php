<?php

namespace App\Services\Admin;

use App\Domain\Alerts\AlertableEvents;
use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use App\Models\User;
use Spatie\Activitylog\Models\Activity;

class AlertRuleService
{
    public function all(): array
    {
        return AlertRule::query()->latest()->get()->map(fn (AlertRule $rule) => $this->payload($rule))->all();
    }

    public function create(array $payload, User $actor): array
    {
        $rule = AlertRule::create([
            'event' => $payload['event'],
            'channels_json' => $payload['channels'],
            'recipients_json' => $payload['recipients'],
            'is_active' => $payload['is_active'] ?? true,
            'updated_by_id' => $actor->id,
        ]);
        $this->audit($actor, $rule, 'created');

        return $this->payload($rule);
    }

    public function update(AlertRule $rule, array $payload, User $actor): array
    {
        $rule->fill([
            'event' => $payload['event'] ?? $rule->event,
            'channels_json' => $payload['channels'] ?? $rule->channels_json,
            'recipients_json' => $payload['recipients'] ?? $rule->recipients_json,
            'is_active' => $payload['is_active'] ?? $rule->is_active,
            'updated_by_id' => $actor->id,
        ])->save();
        $this->audit($actor, $rule, 'updated');

        return $this->payload($rule->refresh());
    }

    public function delete(AlertRule $rule, User $actor): void
    {
        $this->audit($actor, $rule, 'deleted');
        $rule->delete();
    }

    public function test(AlertRule $rule): void
    {
        SendAdminAlert::dispatch($rule->id, [
            'title' => '[TEST] '.$rule->event,
            'message' => '[TEST] '.$rule->event.' déclenché par test synthétique.',
            'audit_url' => '/super-admin/audit?filter[event]='.$rule->event,
            'event' => $rule->event,
            'actor_id' => null,
            'subject_id' => null,
        ], true);
    }

    public function dispatchForActivity(Activity $activity): void
    {
        $event = (string) $activity->event;
        if (! AlertableEvents::has($event)) {
            return;
        }

        AlertRule::query()
            ->where('event', $event)
            ->where('is_active', true)
            ->get()
            ->each(function (AlertRule $rule) use ($activity, $event): void {
                SendAdminAlert::dispatch($rule->id, [
                    'title' => $event,
                    'message' => "{$event} actor_id={$activity->causer_id} subject_id={$activity->subject_id}",
                    'audit_url' => '/super-admin/audit?filter[event]='.$event,
                    'event' => $event,
                    'actor_id' => $activity->causer_id,
                    'subject_id' => $activity->subject_id,
                ]);
            });
    }

    private function payload(AlertRule $rule): array
    {
        return [
            'id' => $rule->id,
            'event' => $rule->event,
            'label' => AlertableEvents::all()[$rule->event] ?? $rule->event,
            'channels' => $rule->channels_json ?? [],
            'recipients' => $rule->recipients_json ?? [],
            'is_active' => $rule->is_active,
            'last_triggered_at' => $rule->last_triggered_at?->toISOString(),
            'failure_count' => $rule->failure_count,
        ];
    }

    private function audit(User $actor, AlertRule $rule, string $action): void
    {
        activity('Admin')
            ->causedBy($actor)
            ->performedOn($rule)
            ->withProperties(['event' => $rule->event, 'action' => $action])
            ->event('super_admin_alert_rule_'.$action)
            ->log('Règle alerte sensible modifiée');
    }
}
