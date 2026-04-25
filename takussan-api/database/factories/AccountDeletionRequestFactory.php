<?php

namespace Database\Factories;

use App\Models\AccountDeletionRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AccountDeletionRequest>
 */
class AccountDeletionRequestFactory extends Factory
{
    protected $model = AccountDeletionRequest::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'requested_at' => now(),
            'scheduled_for' => now()->addDays((int) config('auth.account_deletion.grace_days', 30)),
            'reason' => null,
            'reason_code' => 'privacy',
            'executed_at' => null,
            'reminder_sent_at' => null,
        ];
    }

    public function due(): static
    {
        return $this->state(fn () => [
            'requested_at' => now()->subDays(31),
            'scheduled_for' => now()->subMinutes(5),
        ]);
    }

    public function executed(): static
    {
        return $this->state(fn () => [
            'executed_at' => now(),
        ]);
    }
}
