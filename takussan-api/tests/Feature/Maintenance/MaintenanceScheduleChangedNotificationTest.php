<?php

namespace Tests\Feature\Maintenance;

use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2012 (P184.01) — un passage fixé ou déplacé par le `PATCH` est annoncé à toutes les parties,
 * sauf à l'auteur, par un seul code : `maintenance.schedule_changed`.
 *
 * Avant : `scheduled_at` s'écrivait par `fill()->save()`, et seul un changement d'assigné émettait
 * un événement. Le bloc d'assignation renvoie toujours le même prestataire avec l'heure : changer
 * la seule heure n'annonçait rien, ni au locataire ni au prestataire.
 */
class MaintenanceScheduleChangedNotificationTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const CODE = 'maintenance.schedule_changed';

    public function test_le_bailleur_qui_fixe_puis_deplace_l_heure_previent_le_locataire_et_le_prestataire(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'accepted_at' => now(),
            'scheduled_at' => null,
        ]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $provider->id,
            'scheduled_at' => now()->addDays(3)->setTime(9, 0)->toIso8601String(),
        ])->assertOk();
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $provider->id,
            'scheduled_at' => now()->addDays(5)->setTime(14, 0)->toIso8601String(),
        ])->assertOk();

        $this->assertSame(2, $this->avis($tenant));
        $this->assertSame(2, $this->avis($provider));
        $this->assertSame(0, $this->avis($landlord));

        $dernier = AppNotification::query()->where('user_id', $tenant->id)->where('code', self::CODE)->latest('id')->first();
        $this->assertSame($mr->refresh()->scheduled_at->toIso8601String(), $dernier->params['scheduled_at']);
    }

    public function test_le_prestataire_qui_fixe_l_heure_previent_le_locataire_et_le_bailleur(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'accepted_at' => now(),
            'scheduled_at' => null,
        ]);

        Sanctum::actingAs($provider);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'scheduled_at' => now()->addDays(7)->setTime(10, 0)->toIso8601String(),
        ])->assertOk();

        $this->assertSame(1, $this->avis($tenant));
        $this->assertSame(1, $this->avis($landlord));
        $this->assertSame(0, $this->avis($provider));
    }

    /** Témoin : la même heure renvoyée, ou un autre champ seul, n'annonce rien. */
    public function test_sans_changement_d_heure_aucun_avis(): void
    {
        $heure = now()->addDays(3)->setTime(9, 0)->startOfMinute();
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'accepted_at' => now(),
            'scheduled_at' => $heure,
        ]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $provider->id,
            'scheduled_at' => $heure->toIso8601String(),
        ])->assertOk();
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['priority' => 'urgent'])->assertOk();

        $this->assertSame(0, AppNotification::query()->where('code', self::CODE)->count());
    }

    /** Une heure retirée n'est pas un passage prévu : rien n'est annoncé. */
    public function test_une_heure_retiree_n_annonce_rien(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, [
            'accepted_at' => now(),
            'scheduled_at' => now()->addDays(3),
        ]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => null])->assertOk();

        $this->assertSame(0, AppNotification::query()->where('code', self::CODE)->count());
    }

    /** La décision : le SMS porte l'heure, dans les trois langues. */
    public function test_le_sms_porte_l_heure(): void
    {
        foreach (['fr', 'en', 'wo'] as $locale) {
            $sms = trans('notifications.codes.maintenance.schedule_changed.sms', [], $locale);
            $this->assertIsString($sms);
            $this->assertStringContainsString(':scheduled_at', $sms, $locale);
            $this->assertStringContainsString(':request', $sms, $locale);
        }
    }

    private function avis(User $user): int
    {
        return AppNotification::query()->where('user_id', $user->id)->where('code', self::CODE)->count();
    }
}
