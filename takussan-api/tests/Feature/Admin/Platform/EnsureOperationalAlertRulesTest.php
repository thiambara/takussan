<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Alerts\AlertableEvents;
use App\Models\AlertRule;
use App\Models\User;
use App\Services\Admin\AlertRuleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-768 (P14.03) — sans règle `alert_rules`, une alerte `ops_*` ne part nulle part. La commande,
 * jouée par `docker/release.sh`, crée la règle de chaque événement d'exploitation qui n'en a pas,
 * destinée aux super-admins.
 */
class EnsureOperationalAlertRulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_cree_les_regles_ops_destinees_aux_super_admins(): void
    {
        $a = $this->superAdmin('a@example.test');
        $b = $this->superAdmin('b@example.test');
        User::factory()->create(['email' => 'pas-admin@example.test']);

        $this->artisan('alerts:ensure-ops-rules')->assertSuccessful();

        $evenements = AlertRule::query()->orderBy('event')->pluck('event')->all();
        // TCK-772 a ajouté `ops_critical_job_failed` au catalogue : il reçoit sa règle comme les autres.
        $this->assertSame(['ops_critical_job_failed', 'ops_failed_jobs_spike', 'ops_health_degraded', 'ops_queue_stalled'], $evenements);

        foreach (AlertRule::all() as $regle) {
            $this->assertTrue($regle->is_active);
            $this->assertSame(['email'], $regle->channels_json);
            $emails = $regle->recipients_json['emails'];
            sort($emails);
            $this->assertSame([$a->email, $b->email], $emails);
        }
    }

    /** Une règle existante, même coupée ou retouchée par le porteur, n'est ni doublée ni réécrite. */
    public function test_idempotente_et_ne_touche_pas_une_regle_existante(): void
    {
        $this->superAdmin('a@example.test');
        AlertRule::create(['event' => 'ops_queue_stalled', 'channels_json' => ['slack'], 'recipients_json' => ['webhooks' => ['https://hooks.slack.com/x']], 'is_active' => false]);

        $this->artisan('alerts:ensure-ops-rules')->assertSuccessful();
        $this->artisan('alerts:ensure-ops-rules')->assertSuccessful();

        $this->assertSame(4, AlertRule::count());
        $existante = AlertRule::query()->where('event', 'ops_queue_stalled')->sole();
        $this->assertFalse($existante->is_active);
        $this->assertSame(['slack'], $existante->channels_json);
    }

    /** Premier déploiement, avant tout super-admin : rien de créé, la suivante rattrapera. */
    public function test_sans_super_admin_ne_cree_rien_et_reussit(): void
    {
        $this->artisan('alerts:ensure-ops-rules')->assertSuccessful();

        $this->assertSame(0, AlertRule::count());
    }

    public function test_couvre_chaque_evenement_d_exploitation_du_catalogue(): void
    {
        $this->superAdmin('a@example.test');
        $this->artisan('alerts:ensure-ops-rules')->assertSuccessful();

        $ops = array_values(array_filter(AlertableEvents::keys(), AlertRuleService::isOperational(...)));
        sort($ops);
        $this->assertSame($ops, AlertRule::query()->orderBy('event')->pluck('event')->all());
    }

    private function superAdmin(string $email): User
    {
        $user = User::factory()->create(['email' => $email]);
        $this->materializeRoleProfile($user, 'super_admin');

        return $user;
    }
}
