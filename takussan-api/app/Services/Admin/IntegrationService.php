<?php

namespace App\Services\Admin;

use App\Domain\Integrations\Providers\IntegrationProviderRegistry;
use App\Events\IntegrationConfigChanged;
use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class IntegrationService
{
    public function __construct(private readonly IntegrationProviderRegistry $providers) {}

    /**
     * @return array<int,array<string,mixed>>
     */
    public function all(): array
    {
        return Integration::query()
            ->orderBy('provider')
            ->get()
            ->map(fn (Integration $integration) => $this->payload($integration))
            ->all();
    }

    /**
     * @return array<string,mixed>
     */
    public function show(Integration $integration): array
    {
        return $this->payload($integration) + ['credentials' => $this->maskedCredentials($integration)];
    }

    /**
     * @return array<string,mixed>
     */
    public function schema(Integration $integration): array
    {
        $provider = $this->providers->get($integration->provider);

        return [
            'provider' => $provider->key(),
            'label' => $provider->label(),
            'category' => $provider->category(),
            'fields' => $provider->schema(),
        ];
    }

    /**
     * @param  array<string,mixed>  $payload
     */
    public function update(Integration $integration, array $payload, User $actor): array
    {
        $provider = $this->providers->get($integration->provider);
        $credentials = array_key_exists('credentials', $payload)
            ? array_replace($integration->credentials ?? [], $payload['credentials'])
            : ($integration->credentials ?? []);
        $errors = $provider->validate($credentials);
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $changedFields = $this->changedCredentialFields($integration->credentials ?? [], $credentials);
        $oldActive = $integration->is_active;
        $oldMetadataKeys = array_keys($integration->metadata ?? []);

        DB::transaction(function () use ($integration, $payload, $credentials, $actor, $changedFields, $oldActive, $oldMetadataKeys, $provider): void {
            $integration->fill([
                'credentials' => $credentials,
                'is_active' => $payload['is_active'] ?? $integration->is_active,
                'metadata' => array_key_exists('metadata', $payload) ? ($payload['metadata'] ?? []) : $integration->metadata,
            ])->save();

            $diff = [
                'credential_fields_changed' => $changedFields,
                'is_active_changed' => $oldActive !== $integration->is_active,
                'metadata_keys_before' => $oldMetadataKeys,
                'metadata_keys_after' => array_keys($integration->metadata ?? []),
            ];

            activity('Admin')
                ->causedBy($actor)
                ->performedOn($integration)
                ->withProperties($diff)
                ->event('super_admin_integration_updated')
                ->log('Intégration tierce modifiée');

            if ($provider->category() === 'payments' && ($changedFields !== [] || $oldActive !== $integration->is_active)) {
                IntegrationConfigChanged::dispatch($integration->refresh(), $changedFields);
            }
        });

        return $this->show($integration->refresh());
    }

    /**
     * @return array{success:bool,latency_ms:int,error:?string}
     */
    public function test(Integration $integration, User $actor): array
    {
        $started = microtime(true);
        $result = $this->providers->get($integration->provider)->test($integration);
        $latency = max(1, (int) round((microtime(true) - $started) * 1000));
        $status = $result['success'] ? 'healthy' : 'failed';
        $integration->forceFill([
            'last_health_check_at' => now(),
            'health_status' => $status,
        ])->save();

        activity('Admin')
            ->causedBy($actor)
            ->performedOn($integration)
            ->withProperties(['provider' => $integration->provider, 'success' => $result['success'], 'latency_ms' => $latency])
            ->event('super_admin_integration_tested')
            ->log('Test intégration tierce');

        return ['success' => $result['success'], 'latency_ms' => $latency, 'error' => $result['error'] ?? null];
    }

    public function webhooks(Integration $integration): LengthAwarePaginator
    {
        $this->pruneWebhookLogs();

        return IntegrationWebhookLog::query()
            ->where('integration_id', $integration->id)
            ->latest()
            ->paginate(20);
    }

    /**
     * @param  array<string,mixed>  $payload
     */
    public function recordWebhook(string $provider, array $payload, string $status = 'processed', ?string $eventType = null): void
    {
        $this->pruneWebhookLogs();
        $integration = Integration::query()
            ->where('provider', $provider)
            ->whereNull('agency_id')
            ->first();

        IntegrationWebhookLog::create([
            'integration_id' => $integration?->id,
            'provider' => $provider,
            'direction' => 'incoming',
            'status' => $status,
            'event_type' => $eventType,
            'payload' => [
                'truncated' => Str::of(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}')->limit(4000)->toString(),
            ],
            'processed_at' => now(),
        ]);
    }

    public function pruneWebhookLogs(): void
    {
        IntegrationWebhookLog::query()
            ->where('created_at', '<', now()->subDays(30))
            ->delete();
    }

    /**
     * @return array<string,mixed>
     */
    private function payload(Integration $integration): array
    {
        $provider = $this->providers->get($integration->provider);

        return [
            'id' => $integration->id,
            'provider' => $integration->provider,
            'label' => $provider->label(),
            'category' => $provider->category(),
            'critical' => $provider->critical(),
            'agency_id' => $integration->agency_id,
            'is_active' => $integration->is_active,
            'status' => $integration->is_active ? $integration->health_status : 'disabled',
            'last_used_at' => $integration->last_used_at?->toISOString(),
            'last_health_check_at' => $integration->last_health_check_at?->toISOString(),
            'metadata' => $integration->metadata ?? [],
            'masked_credentials' => $this->maskedCredentials($integration),
        ];
    }

    /**
     * @return array<string,string>
     */
    private function maskedCredentials(Integration $integration): array
    {
        return collect($integration->credentials ?? [])
            ->mapWithKeys(fn (mixed $value, string $key) => [$key => '••••'.Str::of((string) $value)->substr(-4)->toString()])
            ->all();
    }

    /**
     * @param  array<string,mixed>  $before
     * @param  array<string,mixed>  $after
     * @return array<int,string>
     */
    private function changedCredentialFields(array $before, array $after): array
    {
        return collect(array_unique([...array_keys($before), ...array_keys($after)]))
            ->filter(fn (string $key) => ($before[$key] ?? null) !== ($after[$key] ?? null))
            ->values()
            ->all();
    }
}
