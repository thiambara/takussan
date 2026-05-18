<?php

namespace Database\Factories;

use App\Models\Lease;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TenantOnboardingChecklist>
 */
class TenantOnboardingChecklistFactory extends Factory
{
    protected $model = TenantOnboardingChecklist::class;

    public function definition(): array
    {
        return [
            'lease_id' => Lease::factory(),
            'user_id' => User::factory(),
            'welcome_seen_at' => null,
            'inventory_completed_at' => null,
            'first_payment_at' => null,
            'documents_acknowledged_at' => null,
            'reminders_sent' => [],
            'completed_at' => null,
        ];
    }

    public function completed(): self
    {
        return $this->state(fn () => [
            'inventory_completed_at' => now(),
            'first_payment_at' => now(),
            'completed_at' => now(),
        ]);
    }
}
