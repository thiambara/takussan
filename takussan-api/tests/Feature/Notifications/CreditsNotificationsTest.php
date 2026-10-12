<?php

namespace Tests\Feature\Notifications;

use App\Models\AppNotification;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Boost\BoostRefundedNotification;
use App\Notifications\Credits\CreditsExpiringNotification;
use App\Notifications\Credits\CreditsGrantedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F (AC13, AC15) — quatre notifications de cloche, dans la langue du destinataire. */
class CreditsNotificationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_chaque_notification_ecrit_une_ligne_de_cloche(): void
    {
        $user = User::factory()->create();

        $user->notify(new CreditsGrantedNotification(500, '2027-04-10', 'Agence Teranga'));
        $user->notify(new CreditsExpiringNotification(120, '2026-10-19', 'Agence Teranga'));
        $user->notify(new BoostEndedNotification(7, 'Villa à Ngor'));
        $user->notify(new BoostRefundedNotification(7, 'Villa à Ngor', 23));

        $lignes = AppNotification::query()->where('user_id', $user->id)->orderBy('id')->get();
        $this->assertCount(4, $lignes);
        $this->assertStringContainsString('500', $lignes[0]->body);
        $this->assertStringContainsString('Agence Teranga', $lignes[0]->body);
        $this->assertStringContainsString('120', $lignes[1]->body);
        $this->assertStringContainsString('Villa à Ngor', $lignes[2]->body);
        $this->assertStringContainsString('23', $lignes[3]->body);
    }

    /** ADR-0061 §4 — la notification dit ce qui est rendu, et ce qui ne l'est pas parce qu'expiré. */
    public function test_le_remboursement_partiel_nomme_les_credits_perdus_par_expiration(): void
    {
        $user = User::factory()->create();

        $user->notify(new BoostRefundedNotification(7, 'Villa à Ngor', 27, 31));
        $user->notify(new BoostRefundedNotification(7, 'Villa à Ngor', 27));

        $lignes = AppNotification::query()->where('user_id', $user->id)->orderBy('id')->get();
        $this->assertStringContainsString('27', $lignes[0]->body);
        $this->assertStringContainsString('31', $lignes[0]->body);
        $this->assertStringContainsString('expiré', $lignes[0]->body);
        $this->assertStringNotContainsString('expiré', $lignes[1]->body);
        // assertEquals : jsonb ne garde pas l'ordre des clés.
        $this->assertEquals(['property_id' => 7, 'credits' => 27, 'expired' => 31], $lignes[0]->data);
    }

    public function test_le_texte_suit_la_langue_du_destinataire(): void
    {
        // `User::preferredLocale()` lit `preferred_language` (app/Models/User.php:568-571).
        $user = User::factory()->create(['preferred_language' => 'en']);

        $user->notify(new BoostEndedNotification(7, 'Villa'));

        $this->assertSame('Promotion ended', AppNotification::query()->where('user_id', $user->id)->value('title'));
    }
}
