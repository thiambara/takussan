<?php

namespace Database\Seeders\System;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\User;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * TCK-252 / TCK-267 / TCK-268 / TCK-269 — démo data pour les demandes
 * d'upgrade d'agences `individual` vers `standard`.
 *
 * Pour chaque agence `individual` :
 *  - 1 demande `pending` récente (toujours présente — c'est la valeur de
 *    démonstration la plus utile pour la console super-admin),
 *  - 30% : 1 demande `rejected` historique avec motif,
 *  - 10% : 1 demande `approved` historique. ⚠ on bypass le service métier
 *    pour éviter le flip `Agency.kind = standard` qui changerait l'état
 *    de l'agence — la factory `->approved()` insère directement le statut.
 *
 * Idempotent : on cherche d'abord une `pending` existante avant d'en
 * créer une nouvelle (un seul `pending` autorisé par agence — index unique
 * PARTIEL, `agency_upgrade_requests_one_pending_per_agency`).
 *
 * ⚠ Cette parenthèse disait « index unique partiel sur Postgres, fallback
 * applicatif sur SQLite » jusqu'au 2026-08-22. Il n'y a plus qu'un moteur
 * (ADR-0020) et le fallback a été SUPPRIMÉ avec SQLite : il ne reste que
 * l'index. Nommer un garde-fou disparu est pire que ne rien dire.
 */
class AgencyUpgradeRequestSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $individualAgencies = $this->ctx->agencies->filter(
            fn (Agency $a) => $a->kind === AgencyKind::Individual,
        );

        if ($individualAgencies->isEmpty()) {
            $this->command?->getOutput()?->writeln('  > AgencyUpgradeRequestSeeder : aucune agence individual, skip.');

            return;
        }

        $superAdmin = $this->resolveSuperAdmin();
        $created = 0;

        foreach ($individualAgencies as $agency) {
            $created += $this->seedPendingFor($agency);
            $created += $this->seedHistoricalFor($agency, $superAdmin);
        }

        $this->command?->getOutput()?->writeln("  > AgencyUpgradeRequestSeeder : {$created} demandes créées sur {$individualAgencies->count()} agences individual.");
    }

    private function seedPendingFor(Agency $agency): int
    {
        $existingPending = AgencyUpgradeRequest::query()
            ->where('agency_id', $agency->id)
            ->where('status', AgencyUpgradeRequestStatus::Pending->value)
            ->exists();

        if ($existingPending) {
            return 0;
        }

        $submitter = $this->resolveSubmitter($agency);

        if ($submitter === null) {
            return 0;
        }

        $submittedAt = Timeline::seedEnd()->subDays(random_int(1, 4));

        AgencyUpgradeRequest::query()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $submitter->id,
            'rc' => 'RC-DKR-'.strtoupper(Str::random(6)),
            'ninea' => $this->ctx->faker()->numerify('##########'),
            'rib_pro' => 'SN'.$this->ctx->faker()->numerify('### ##### ########### ##'),
            'address_fiscale' => $this->ctx->faker()->address(),
            'company_legal_name' => $agency->name.' SARL',
            'planned_agents_count' => random_int(1, 8),
            'status' => AgencyUpgradeRequestStatus::Pending->value,
            'submitted_at' => $submittedAt,
            'created_at' => $submittedAt,
            'updated_at' => $submittedAt,
        ]);

        return 1;
    }

    private function seedHistoricalFor(Agency $agency, ?User $reviewer): int
    {
        $created = 0;

        if (random_int(1, 100) <= 30) {
            $rejectedAt = Timeline::seedEnd()->subDays(30);
            // Use the factory's `rejected()` state so we go through the same
            // shape the runtime relies on (status + reviewed_at + comment),
            // and pin the reviewer to our seeded super_admin instead of
            // letting the factory spin up a new User.
            AgencyUpgradeRequest::factory()
                ->rejected()
                ->state([
                    'agency_id' => $agency->id,
                    'submitted_by' => $this->resolveSubmitter($agency)?->id,
                    'reviewed_by' => $reviewer?->id,
                    'reviewed_at' => $rejectedAt,
                    'review_comment' => 'Documents incomplets — merci de joindre le scan original.',
                    'company_legal_name' => $agency->name.' SARL',
                    'submitted_at' => $rejectedAt->subDays(2),
                    'created_at' => $rejectedAt->subDays(2),
                    'updated_at' => $rejectedAt,
                ])
                ->create();
            $created++;
        }

        if (random_int(1, 100) <= 10) {
            $approvedAt = Timeline::seedEnd()->subDays(60);
            // ⚠ On passe par la factory directement pour court-circuiter le
            // listener de flip — il n'y a pas d'étape `pending → approved`,
            // donc l'agence reste `individual`.
            AgencyUpgradeRequest::factory()
                ->approved()
                ->state([
                    'agency_id' => $agency->id,
                    'submitted_by' => $this->resolveSubmitter($agency)?->id,
                    'reviewed_by' => $reviewer?->id,
                    'reviewed_at' => $approvedAt,
                    'company_legal_name' => $agency->name.' SARL',
                    'submitted_at' => $approvedAt->subDays(3),
                    'created_at' => $approvedAt->subDays(3),
                    'updated_at' => $approvedAt,
                ])
                ->create();
            $created++;
        }

        return $created;
    }

    private function resolveSubmitter(Agency $agency): ?User
    {
        if ($agency->primary_admin_id !== null) {
            $admin = $this->ctx->usersByAgency[$agency->id] ?? null;
            $found = $admin?->get($agency->primary_admin_id);
            if ($found !== null) {
                return $found;
            }
        }

        // Fallback : premier admin bucketé pour cette agence.
        $admins = $this->ctx->usersByAgencyAndPersona[$agency->id]['admin'] ?? null;

        return $admins?->first();
    }

    private function resolveSuperAdmin(): ?User
    {
        return $this->ctx->systemUsers->first();
    }
}
