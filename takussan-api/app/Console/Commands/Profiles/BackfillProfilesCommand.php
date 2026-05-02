<?php

namespace App\Console\Commands\Profiles;

use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\UserType;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerAgencyCollaboration;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * TCK-140 — Project the legacy (`users.type`, `users.agency_id`) state
 * onto the new polymorphic profile tables. Idempotent via firstOrCreate.
 * Cutover (drop of `users.type`/`users.agency_id`) lands in TCK-142.
 */
class BackfillProfilesCommand extends Command
{
    protected $signature = 'profiles:backfill {--dry-run : List actions without writing} {--chunk=500 : User chunk size}';

    protected $description = 'Backfill polymorphic profiles from legacy users.type + users.agency_id';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $chunk = max(1, (int) $this->option('chunk'));

        $stats = [
            'owner' => 0,
            'agent' => 0,
            'broker' => 0,
            'broker_collab' => 0,
            'service_provider' => 0,
            'service_provider_collab' => 0,
            'admin_skipped' => 0,
            'no_type_skipped' => 0,
        ];

        User::query()
            ->orderBy('id')
            ->chunkById($chunk, function ($users) use ($dryRun, &$stats): void {
                foreach ($users as $user) {
                    $this->backfillUser($user, $dryRun, $stats);
                }
            });

        $this->table(
            ['Bucket', 'Count'],
            collect($stats)->map(fn ($v, $k) => [$k, $v])->values()->all(),
        );

        $this->info($dryRun ? 'Dry run — nothing written.' : 'Backfill done.');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, int>  $stats
     */
    private function backfillUser(User $user, bool $dryRun, array &$stats): void
    {
        $type = $user->type;

        if ($type === null) {
            $stats['no_type_skipped']++;

            return;
        }

        $agencyId = $user->agency_id;

        match ($type) {
            UserType::Individual => $this->upsertOwner($user, $agencyId, $dryRun, $stats),
            UserType::Agent => $this->upsertAgent($user, $agencyId, $dryRun, $stats),
            UserType::Broker => $this->upsertBroker($user, $agencyId, $dryRun, $stats),
            UserType::ServiceProvider => $this->upsertServiceProvider($user, $agencyId, $dryRun, $stats),
            UserType::Admin => $stats['admin_skipped']++,
        };
    }

    /**
     * @param  array<string, int>  $stats
     */
    private function upsertOwner(User $user, ?int $agencyId, bool $dryRun, array &$stats): void
    {
        if ($agencyId === null) {
            return;
        }
        if ($dryRun) {
            $stats['owner']++;

            return;
        }
        OwnerProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agencyId],
            ['status' => OwnerProfileStatus::Active->value],
        );
        $stats['owner']++;
    }

    /**
     * @param  array<string, int>  $stats
     */
    private function upsertAgent(User $user, ?int $agencyId, bool $dryRun, array &$stats): void
    {
        if ($agencyId === null) {
            return;
        }
        if ($dryRun) {
            $stats['agent']++;

            return;
        }
        AgentProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agencyId],
            ['status' => AgentProfileStatus::Active->value],
        );
        $stats['agent']++;
    }

    /**
     * @param  array<string, int>  $stats
     */
    private function upsertBroker(User $user, ?int $agencyId, bool $dryRun, array &$stats): void
    {
        if ($dryRun) {
            $stats['broker']++;
            if ($agencyId !== null) {
                $stats['broker_collab']++;
            }

            return;
        }
        $broker = BrokerProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            ['license_number' => 'BRK-LEGACY-'.$user->id.'-'.Str::random(4)],
        );
        $stats['broker']++;

        if ($agencyId !== null) {
            BrokerAgencyCollaboration::query()->firstOrCreate(
                ['broker_profile_id' => $broker->id, 'agency_id' => $agencyId],
                [
                    'status' => CollaborationStatus::Active->value,
                    'started_at' => $user->created_at?->toDateString() ?? now()->toDateString(),
                ],
            );
            $stats['broker_collab']++;
        }
    }

    /**
     * @param  array<string, int>  $stats
     */
    private function upsertServiceProvider(User $user, ?int $agencyId, bool $dryRun, array &$stats): void
    {
        if ($dryRun) {
            $stats['service_provider']++;
            if ($agencyId !== null) {
                $stats['service_provider_collab']++;
            }

            return;
        }
        $sp = ServiceProviderProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            [],
        );
        $stats['service_provider']++;

        if ($agencyId !== null) {
            ServiceProviderAgencyCollaboration::query()->firstOrCreate(
                ['service_provider_profile_id' => $sp->id, 'agency_id' => $agencyId],
                [
                    'status' => CollaborationStatus::Active->value,
                    'started_at' => $user->created_at?->toDateString() ?? now()->toDateString(),
                ],
            );
            $stats['service_provider_collab']++;
        }
    }
}
