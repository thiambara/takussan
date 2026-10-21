<?php

namespace Tests\Feature\Api\Admin;

use App\Domain\Notifications\NotificationCode;
use App\Models\NotificationTemplate;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1124 (P98.03) — l'éditeur ne sert que les couples événement × canal qu'un envoi lit.
 * Avant, il servait `email`, `sms` et `push` pour chaque événement : aucun envoi ne lit un
 * gabarit `push` (D-65), ni le SMS de `maintenance_created`, code qui n'est pas mobile.
 */
class NotificationTemplateChannelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_liste_ne_sert_que_les_couples_lus_par_un_envoi(): void
    {
        $this->actingAsRole('super_admin');

        $couples = collect($this->getJson('/api/admin/notification-templates')->assertOk()->json('data'))
            ->map(fn (array $item) => $item['event'].'/'.$item['channel'])
            ->all();

        $this->assertSame([
            'booking_confirmed/email',
            'booking_confirmed/sms',
            'payment_received/email',
            'payment_received/sms',
            'maintenance_created/email',
        ], $couples);
    }

    public function test_un_couple_qu_aucun_envoi_ne_lit_est_refuse(): void
    {
        $this->actingAsRole('super_admin');
        $avant = NotificationTemplate::query()->count();

        foreach (['maintenance_created/sms', 'booking_confirmed/push', 'payment_received/push', 'maintenance_created/push'] as $couple) {
            $this->getJson("/api/admin/notification-templates/{$couple}")
                ->assertUnprocessable()
                ->assertJsonPath('errors.channel.0', 'notification_channel_not_editable');

            $this->patchJson("/api/admin/notification-templates/{$couple}", [
                'templates' => ['fr' => ['subject' => 'x', 'body' => 'x']],
            ])->assertUnprocessable()
                ->assertJsonPath('errors.channel.0', 'notification_channel_not_editable');
        }

        $this->assertSame($avant, NotificationTemplate::query()->count());
    }

    public function test_chaque_couple_servi_est_lu_par_le_rendu_de_son_canal(): void
    {
        $this->actingAsRole('super_admin');
        $renderer = app(NotificationRenderer::class);

        $items = $this->getJson('/api/admin/notification-templates')->assertOk()->json('data');
        $this->assertNotEmpty($items);

        foreach ($items as $item) {
            $event = $item['event'];
            $channel = $item['channel'];
            $marker = "Gabarit actif {$event} {$channel}";
            NotificationTemplate::query()->create([
                'event' => $event,
                'channel' => $channel,
                'locale' => 'fr',
                'subject' => $marker,
                'body' => $marker,
                'is_active' => true,
            ]);

            $codes = array_filter(
                NotificationCode::cases(),
                fn (NotificationCode $code) => $code->templateEvent() === $event && ($channel !== 'sms' || $code->mobile()),
            );
            $this->assertNotEmpty($codes, "{$event}/{$channel} : aucun envoi ne le lit");

            foreach ($codes as $code) {
                $surface = match ($channel) {
                    'email' => 'mail_body',
                    'sms' => 'sms',
                    default => 'body',
                };
                $this->assertSame($marker, $renderer->render($code, [], 'fr', null, $surface, 'Awa'), "{$event}/{$channel}");
            }
        }
    }
}
