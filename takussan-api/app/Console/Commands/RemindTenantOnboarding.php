<?php

namespace App\Console\Commands;

use App\Models\TenantOnboardingChecklist;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\TenantInventoryReminderNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-266 — Cron horaire qui envoie un rappel J+7 EDL.
 *
 * Sélectionne les checklists encore ouvertes (`completed_at IS NULL`)
 * dont l'EDL d'entrée n'est toujours pas signé
 * (`inventory_completed_at IS NULL`) et créées il y a plus de 7 jours.
 *
 * Idempotence : la liste `reminders_sent` (JSON) est consultée puis
 * augmentée d'une entry `{type: 'inventory_d7', sent_at: ISO}` au moment
 * de l'envoi. Un second pass du cron sur la même checklist détecte
 * l'entrée et passe son tour. Pas besoin d'un index dédié car le filtre
 * `created_at` borne déjà la query aux baux signés depuis ≥ 7 j.
 */
class RemindTenantOnboarding extends Command
{
    protected $signature = 'tenant-onboarding:remind';

    protected $description = 'Send J+7 reminder when the move-in inventory is still unsigned (idempotent).';

    public function handle(): int
    {
        $cutoff = now()->subDays(7);
        $sent = 0;

        TenantOnboardingChecklist::query()
            ->whereNull('completed_at')
            ->whereNull('inventory_completed_at')
            ->where('created_at', '<', $cutoff)
            ->with(['lease.agency.primaryAdmin', 'lease.tenant.user'])
            ->chunkById(100, function ($checklists) use (&$sent): void {
                foreach ($checklists as $checklist) {
                    if ($this->alreadyReminded($checklist)) {
                        continue;
                    }

                    $lease = $checklist->lease;
                    if ($lease === null) {
                        continue;
                    }

                    $tenantUser = $lease->tenant?->user;
                    if ($tenantUser !== null) {
                        Notification::send($tenantUser, new TenantInventoryReminderNotification($lease));
                    }

                    // Pendant agent : primary admin de l'agence si pas
                    // d'agent assigné explicite (pas de colonne dédiée à
                    // ce jour ; on choisit le primary admin comme proxy
                    // raisonnable et non bloquant).
                    $agentUser = $lease->agency?->primaryAdmin;
                    if ($agentUser !== null && $tenantUser?->id !== $agentUser->id) {
                        Notification::send(
                            $agentUser,
                            new AgentTenantInventoryReminderNotification($lease),
                        );
                    }

                    // Append + persist le marqueur d'idempotence.
                    $reminders = $checklist->reminders_sent ?? [];
                    $reminders[] = [
                        'type' => TenantOnboardingChecklist::REMINDER_INVENTORY_D7,
                        'sent_at' => now()->toIso8601String(),
                    ];
                    $checklist->forceFill(['reminders_sent' => $reminders])->save();

                    $sent++;
                }
            });

        $this->info("Sent {$sent} tenant onboarding reminder(s).");

        return self::SUCCESS;
    }

    private function alreadyReminded(TenantOnboardingChecklist $checklist): bool
    {
        foreach ($checklist->reminders_sent ?? [] as $entry) {
            $type = is_array($entry) ? ($entry['type'] ?? null) : null;
            if ($type === TenantOnboardingChecklist::REMINDER_INVENTORY_D7) {
                return true;
            }
        }

        return false;
    }
}
