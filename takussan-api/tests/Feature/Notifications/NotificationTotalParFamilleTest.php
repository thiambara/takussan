<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\AppNotification;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2847 — `meta.counts` porte aussi le TOTAL, lues comprises, et par famille (la puce « Toutes 42 »
 * de la maquette `app-notifications` = somme des familles), à côté des non-lues, inchangées.
 */
class NotificationTotalParFamilleTest extends TestCase
{
    use RefreshDatabase;

    public function test_42_notifications_dont_3_non_lues(): void
    {
        $user = User::factory()->create();
        for ($i = 1; $i <= 40; $i++) {
            $user->notify(new BoostEndedNotification($i, "Bien {$i}"));
        }
        foreach ([1, 2] as $visite) {
            app(NotificationService::class)->send($user, NotificationCode::VisitRequested, [
                'property' => 'Studio meublé, Mermoz',
                'scheduled_at' => now()->addDay()->toIso8601String(),
                'timezone' => 'Africa/Dakar',
                'contact' => 'Awa Ndiaye',
            ], NotificationTarget::of('visit', $visite));
        }
        // 39 lues : il reste 2 « Mise en avant terminée » et 1 « Visite demandée » non lues.
        $lues = AppNotification::query()->where('user_id', $user->id)->where('code', 'boost.ended')->orderBy('id')->limit(38)->pluck('id')
            ->merge(AppNotification::query()->where('user_id', $user->id)->where('code', 'visit.requested')->orderBy('id')->limit(1)->pluck('id'));
        AppNotification::query()->whereIn('id', $lues)->update(['read_at' => now(), 'is_read' => true]);
        Sanctum::actingAs($user);

        $meta = $this->getJson('/api/notifications?filter[unread]=1')->assertOk()->json('meta');

        $this->assertSame(3, $meta['unread']);
        $this->assertSame(42, $meta['counts']['total']);
        $total = $meta['counts']['total_par_famille'];
        ksort($total);
        $this->assertSame(['bien' => 40, 'visite' => 2], $total);
        $nonLues = $meta['counts']['par_famille'];
        ksort($nonLues);
        $this->assertSame(['bien' => 2, 'visite' => 1], $nonLues);
        $this->assertSame(1, $meta['counts']['a_traiter_non_lues']);
    }

    public function test_sans_notification_les_totaux_sont_zero_et_un_objet_vide(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/notifications')->assertOk();

        $response->assertJsonPath('meta.counts.total', 0);
        $this->assertStringContainsString('"total_par_famille":{}', $response->getContent());
    }

    /** Une famille entièrement lue reste dans le total, et sort des non-lues. */
    public function test_une_famille_toute_lue_reste_au_total_et_sort_des_non_lues(): void
    {
        $user = User::factory()->create();
        $user->notify(new BoostEndedNotification(1, 'Bien 1'));
        AppNotification::query()->where('user_id', $user->id)->update(['read_at' => now(), 'is_read' => true]);
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications')->assertOk();

        $this->assertStringContainsString('"par_famille":{}', $response->getContent());
        $response->assertJsonPath('meta.counts.total_par_famille.bien', 1)
            ->assertJsonPath('meta.unread', 0);
    }
}
