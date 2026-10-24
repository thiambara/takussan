<?php

namespace Tests\Feature\Invitation;

use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationAcceptedNotification;
use App\Notifications\InvitationExpiredNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1723 (P155.03) — une invitation partie par numéro seul (`email` nul, TCK-589) nomme son invité
 * par le numéro dans l'avis d'expiration et l'avis d'acceptation qu'en reçoit l'invitant. Les deux
 * avis lisaient `email` sans repli : « Votre invitation à  a expiré ».
 */
class InviteSansCourrielNommeDansLesAvisTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_deux_avis_nomment_l_invite_par_son_numero(): void
    {
        $invitant = User::factory()->create();
        $invitation = Invitation::factory()->create(['email' => null, 'phone' => '+221771234567']);

        foreach ([new InvitationExpiredNotification($invitation), new InvitationAcceptedNotification($invitation)] as $avis) {
            $courriel = $avis->toMail($invitant);

            $this->assertStringContainsString('+221771234567', (string) $courriel->subject, $avis::class);
            $this->assertStringContainsString('+221771234567', implode(' ', $courriel->introLines), $avis::class);
        }
    }

    /** Témoin : une invitation par e-mail garde l'adresse, même quand un numéro est aussi saisi. */
    public function test_l_adresse_reste_le_nom_de_l_invite_quand_elle_existe(): void
    {
        $invitant = User::factory()->create();
        $invitation = Invitation::factory()->create(['email' => 'awa@example.test', 'phone' => '+221771234567']);

        foreach ([new InvitationExpiredNotification($invitation), new InvitationAcceptedNotification($invitation)] as $avis) {
            $courriel = $avis->toMail($invitant);

            $this->assertStringContainsString('awa@example.test', (string) $courriel->subject, $avis::class);
            $this->assertStringNotContainsString('+221771234567', (string) $courriel->subject, $avis::class);
        }
    }
}
