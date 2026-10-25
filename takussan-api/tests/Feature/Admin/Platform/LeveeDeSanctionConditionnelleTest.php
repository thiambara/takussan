<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * P211.07 (TCK-2195) — réactiver un compte et réintégrer une agence n'écrivent que si la ligne est
 * encore `blocked` ou `suspended` (condition jugée en base, dans la transaction) ; journal et avis
 * seulement si elle a changé. Jugés sur le modèle lié, deux appels ensemble (double clic, deux
 * opérateurs) journalisaient et prévenaient deux fois.
 *
 * La course se rejoue sans concurrence : la ligne change en base juste après que la route l'a
 * chargée, ce que voit le second de deux appels simultanés.
 */
class LeveeDeSanctionConditionnelleTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    /** Une fois chargée par la route, la ligne passe en base à `$apres` (l'autre appel a abouti). */
    private function changerApresChargement(string $classe, int $id, array $apres): void
    {
        $fait = false;
        $classe::retrieved(function ($modele) use ($classe, $id, $apres, &$fait): void {
            if (! $fait && (int) $modele->getKey() === $id) {
                $fait = true;
                $classe::query()->whereKey($id)->update($apres);
            }
        });
    }

    public function test_la_reactivation_d_un_compte_deja_reactive_ne_journalise_ni_ne_previent(): void
    {
        $compte = User::factory()->create(['status' => UserStatus::Blocked]);
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        Notification::fake();
        $this->changerApresChargement(User::class, $compte->id, ['status' => UserStatus::Active->value]);

        $this->postJson("/api/admin/users/{$compte->id}/reactivate", ['reason' => 'Levée après enquête.'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'user.not_blocked');

        $this->assertSame(0, Activity::query()->where('event', 'super_admin_user_reactivated')->count());
        Notification::assertNothingSent();
    }

    public function test_la_reintegration_d_une_agence_deja_reintegree_ne_journalise_ni_ne_previent(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Suspended]);
        AgencyAdminProfile::query()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $agence->id]);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        Notification::fake();
        $this->changerApresChargement(Agency::class, $agence->id, ['status' => AgencyStatus::Active->value]);

        $this->postJson("/api/admin/agencies/{$agence->id}/reinstate", ['reason' => 'Enquête close.'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'agency.not_suspended');

        $this->assertSame(0, Activity::query()->where('event', 'super_admin_agency_reinstated')->count());
        Notification::assertNothingSent();
    }

    public function test_la_reactivation_et_la_reintegration_ordinaires_ecrivent_journalisent_et_previennent(): void
    {
        $compte = User::factory()->create(['status' => UserStatus::Blocked]);
        $agence = Agency::factory()->create(['status' => AgencyStatus::Suspended]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        Notification::fake();

        $this->postJson("/api/admin/users/{$compte->id}/reactivate", ['reason' => 'Levée.'])
            ->assertOk()->assertJsonPath('data.status', 'active');
        $this->postJson("/api/admin/agencies/{$agence->id}/reinstate", ['reason' => 'Close.'])
            ->assertOk()->assertJsonPath('data.status', 'active');

        $this->assertSame(UserStatus::Active, $compte->fresh()->status);
        $this->assertSame(AgencyStatus::Active, $agence->fresh()->status);
        $this->assertSame(1, Activity::query()->where('event', 'super_admin_user_reactivated')->count());
        $this->assertSame(1, Activity::query()->where('event', 'super_admin_agency_reinstated')->count());
        Notification::assertSentTo($compte, CodedNotification::class);
        Notification::assertSentTo($admin, CodedNotification::class);
    }
}
