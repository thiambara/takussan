<?php

namespace App\Services\Admin;

use App\Models\MaintenanceWindow;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

class MaintenanceService
{
    private const CACHE_KEY = 'maintenance.status';

    /**
     * @return array<string,mixed>
     */
    public function status(): array
    {
        return Cache::remember(self::CACHE_KEY, now()->addSeconds(60), fn () => $this->computeStatus());
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return array<string,mixed>
     */
    public function schedule(array $payload, User $actor): array
    {
        MaintenanceWindow::query()
            ->whereNull('cancelled_at')
            ->where('ends_at', '>', now())
            ->update(['cancelled_at' => now(), 'cancelled_by_id' => $actor->id]);

        $window = MaintenanceWindow::create([
            'starts_at' => $payload['starts_at'],
            'ends_at' => $payload['ends_at'],
            'mode' => $payload['mode'],
            'severity' => $payload['severity'],
            'messages' => $payload['messages'],
            'banner_lead_minutes' => $payload['banner_lead_minutes'] ?? 30,
            'created_by_id' => $actor->id,
        ]);

        Cache::forget(self::CACHE_KEY);

        activity('Admin')
            ->causedBy($actor)
            ->performedOn($window)
            ->withProperties(['window_id' => $window->id, 'mode' => $window->mode, 'starts_at' => $window->starts_at?->toISOString(), 'ends_at' => $window->ends_at?->toISOString()])
            ->event('super_admin_maintenance_scheduled')
            ->log('Fenêtre de maintenance programmée');

        return $this->status();
    }

    /**
     * @return array<string,mixed>
     */
    public function cancel(User $actor): array
    {
        $window = $this->activeOrScheduledWindow();
        if ($window) {
            $window->forceFill(['cancelled_at' => now(), 'cancelled_by_id' => $actor->id])->save();

            activity('Admin')
                ->causedBy($actor)
                ->performedOn($window)
                ->withProperties(['window_id' => $window->id])
                ->event('super_admin_maintenance_cancelled')
                ->log('Fenêtre de maintenance annulée');
        }

        Cache::forget(self::CACHE_KEY);

        return $this->status();
    }

    public function shouldBlock(string $method, string $path): bool
    {
        if ($path === 'api/maintenance/status' || str_starts_with($path, 'api/admin')) {
            return false;
        }

        $window = $this->activeWindow();
        if (! $window) {
            return false;
        }

        if ($window->mode === 'down') {
            return true;
        }

        return $window->mode === 'read_only' && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true);
    }

    /**
     * @return array<string,mixed>
     */
    private function computeStatus(): array
    {
        $window = $this->activeOrScheduledWindow();
        if (! $window) {
            return ['active' => false, 'show_banner' => false, 'window' => null, 'generated_at' => now()->toISOString()];
        }

        $now = now();
        $active = $window->starts_at <= $now && $window->ends_at > $now;
        $showBanner = $active || ($window->starts_at->copy()->subMinutes($window->banner_lead_minutes) <= $now && $window->ends_at > $now);

        return [
            'active' => $active,
            'show_banner' => $showBanner,
            'window' => $this->payload($window),
            'generated_at' => $now->toISOString(),
        ];
    }

    private function activeWindow(): ?MaintenanceWindow
    {
        $now = now();

        return MaintenanceWindow::query()
            ->whereNull('cancelled_at')
            ->where('starts_at', '<=', $now)
            ->where('ends_at', '>', $now)
            ->latest('starts_at')
            ->first();
    }

    private function activeOrScheduledWindow(): ?MaintenanceWindow
    {
        return MaintenanceWindow::query()
            ->whereNull('cancelled_at')
            ->where('ends_at', '>', now())
            ->latest('starts_at')
            ->first();
    }

    /**
     * @return array<string,mixed>
     */
    private function payload(MaintenanceWindow $window): array
    {
        return [
            'id' => $window->id,
            'starts_at' => $window->starts_at?->toISOString(),
            'ends_at' => $window->ends_at?->toISOString(),
            'mode' => $window->mode,
            'severity' => $window->severity,
            'messages' => $window->messages,
            'banner_lead_minutes' => $window->banner_lead_minutes,
        ];
    }
}
