<?php

namespace App\Services\Admin;

use App\Domain\Alerts\AlertableEvents;
use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use App\Models\User;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Support\Facades\Log;
use Spatie\Activitylog\Models\Activity;
use Throwable;

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
            'message' => __('notifications.admin_alert.test_message', ['event' => $rule->event]),
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
                $job = new SendAdminAlert($rule->id, [
                    'title' => $event,
                    'message' => __('notifications.admin_alert.activity_message', [
                        'event' => $event,
                        'actor' => (string) $activity->causer_id,
                        'subject' => (string) $activity->subject_id,
                    ]).$this->failingSuffix($activity),
                    'audit_url' => '/super-admin/audit?filter[event]='.$event,
                    'event' => $event,
                    'actor_id' => $activity->causer_id,
                    'subject_id' => $activity->subject_id,
                ]);

                if (! self::isOperational($event)) {
                    dispatch($job);

                    return;
                }

                $this->deliverNow($job, $rule, $event);
            });
    }

    /**
     * TCK-679 (P14.01) — une alerte d'exploitation est écrite par `alerts:evaluate`, dans le
     * scheduler. Mise en file, elle attendrait le worker dont elle annonce peut-être la panne
     * (`ops_queue_stalled` sur `default`) : elle part donc ici, dans le processus qui l'évalue.
     */
    public static function isOperational(string $event): bool
    {
        return str_starts_with($event, 'ops_');
    }

    /**
     * Synchrone, un canal en échec lèverait dans l'écouteur de création du journal : la commande
     * tomberait, sans évaluer les transitions suivantes ni livrer les autres règles. L'échec est
     * compté sur la règle par `SendAdminAlert::failed()` (la file `sync` l'appelle) et journalisé
     * sous sa forme sûre (ADR-0044) ; il n'est pas retenté.
     */
    private function deliverNow(SendAdminAlert $job, AlertRule $rule, string $event): void
    {
        try {
            dispatch_sync($job);
        } catch (Throwable $e) {
            Log::error('[AlertRuleService] Operational alert delivery failed', [
                'alert_rule_id' => $rule->id,
                'event' => $event,
            ] + SafeExceptionContext::of($e));
        }
    }

    /**
     * TCK-769 (P14.05) — le message nomme les sondes en échec (`properties.failing`, écrit par
     * `alerts:evaluate`) : sans cela, il fallait ouvrir le journal d'audit pour savoir laquelle.
     */
    private function failingSuffix(Activity $activity): string
    {
        $failing = $activity->properties['failing'] ?? null;
        if (! is_array($failing) || $failing === []) {
            return '';
        }

        $probes = collect($failing)
            ->map(fn ($status, $probe): string => $probe.' ('.(is_scalar($status) ? $status : '?').')')
            ->implode(', ');

        return __('notifications.admin_alert.failing_suffix', ['probes' => $probes]);
    }

    private function payload(AlertRule $rule): array
    {
        return [
            'id' => $rule->id,
            'event' => $rule->event,
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
