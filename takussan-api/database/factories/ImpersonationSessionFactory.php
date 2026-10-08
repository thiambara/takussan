<?php

namespace Database\Factories;

use App\Models\ImpersonationSession;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ImpersonationSession> */
class ImpersonationSessionFactory extends Factory
{
    protected $model = ImpersonationSession::class;

    public function definition(): array
    {
        return [
            'impersonator_id' => User::factory(),
            'target_user_id' => User::factory(),
            'personal_access_token_id' => null,
            'reason' => 'Ticket de support : l\'utilisateur ne voit pas son bail.',
            'started_at' => now(),
            'expires_at' => now()->addMinutes(ImpersonationSession::TTL_MINUTES),
            'ended_at' => null,
            'end_reason' => null,
        ];
    }
}
