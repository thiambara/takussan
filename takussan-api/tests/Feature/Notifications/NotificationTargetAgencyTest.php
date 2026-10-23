<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Accounting\BankStatementImported;
use App\Events\Permissions\RoleDelegationActivated;
use App\Listeners\Accounting\NotifyStatementImported;
use App\Listeners\Permissions\NotifyDelegationActivated;
use App\Models\AppNotification;
use App\Models\BankStatement;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1761 (P161.04) — la cible d'un avis de la section d'agence porte l'agence pour laquelle il
 * est émis : la cloche bascule sur le profil de cette agence avant d'ouvrir une page qui lit
 * l'agence du profil actif. Sans cette clé, un admin de deux agences lisait les finances, le
 * journal ou le KYC de l'agence active, et non de celle de l'avis.
 */
class NotificationTargetAgencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_cible_rend_l_agence_et_la_relit(): void
    {
        $cible = NotificationTarget::of('finances')->forAgency(7);

        $this->assertSame(['kind' => 'finances', 'id' => null, 'path' => '/app/agency/finances', 'agency_id' => 7], $cible->toArray());
        $this->assertSame(7, NotificationTarget::fromArray($cible->toArray())?->agencyId);
        // Une cible sans agence garde sa forme d'avant : ni clé de plus, ni `null`.
        $this->assertSame(['kind' => 'lease', 'id' => 3, 'path' => '/app/leases/3'], NotificationTarget::of('lease', 3)->toArray());
    }

    public function test_le_fil_rend_l_agence_de_la_cible(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        app(NotificationService::class)->send($user, NotificationCode::BankStatementImported, ['bank' => 'CBAO', 'lines' => 3], NotificationTarget::of('finances')->forAgency(42));
        Sanctum::actingAs($user);

        $item = $this->getJson('/api/notifications')->assertOk()->json('data.0');

        $this->assertSame(42, $item['target']['agency_id']);
    }

    public function test_l_import_d_un_releve_porte_l_agence_du_releve(): void
    {
        Notification::fake();
        $releve = BankStatement::factory()->create();

        app(NotifyStatementImported::class)->handle(new BankStatementImported($releve));

        $ligne = AppNotification::query()->where('user_id', $releve->uploaded_by)->sole();
        $this->assertSame((int) $releve->agency_id, NotificationTarget::forRow($ligne)?->agencyId);
    }

    public function test_les_avis_de_delegation_portent_l_agence_de_la_delegation(): void
    {
        Notification::fake();
        $delegation = RoleDelegation::factory()->create(['role' => 'agency_admin']);

        app(NotifyDelegationActivated::class)->handle(new RoleDelegationActivated($delegation));

        foreach ([$delegation->user_id, $delegation->delegator_id] as $userId) {
            $ligne = AppNotification::query()->where('user_id', $userId)->sole();
            $this->assertSame((int) $delegation->agency_id, NotificationTarget::forRow($ligne)?->agencyId);
        }
    }
}
