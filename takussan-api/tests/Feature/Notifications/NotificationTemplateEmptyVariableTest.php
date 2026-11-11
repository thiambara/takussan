<?php

namespace Tests\Feature\Notifications;

use App\Models\NotificationTemplate;
use App\Services\Admin\NotificationTemplateService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2718 — un gabarit éditable actif (TCK-748) commence par « Bonjour {{ user.first_name }}, » :
 * un compte sans prénom (TCK-2605) recevait « Bonjour , votre réservation… ». Une variable rendue
 * vide emporte l'espace qui la précède quand une ponctuation la suit ; une variable non vide et le
 * texte autour d'elle sont rendus tels quels.
 */
class NotificationTemplateEmptyVariableTest extends TestCase
{
    use RefreshDatabase;

    /** @param  array<string, mixed>  $data */
    private function corps(string $body, array $data): string
    {
        NotificationTemplate::query()->updateOrCreate(
            ['event' => 'booking_confirmed', 'channel' => 'email', 'locale' => 'fr'],
            ['subject' => 'Réservation confirmée', 'body' => $body, 'is_active' => true],
        );

        return app(NotificationTemplateService::class)
            ->renderActive('booking_confirmed', 'email', 'fr', $data, ['subject' => '', 'body' => 'repli'])['body'];
    }

    /** AC4 */
    public function test_un_prenom_vide_rend_bonjour_virgule(): void
    {
        $gabarit = 'Bonjour {{ user.first_name }}, votre réservation {{ booking.code }} est confirmée.';

        $this->assertSame('Bonjour, votre réservation BK-1 est confirmée.', $this->corps($gabarit, ['user' => ['first_name' => ''], 'booking' => ['code' => 'BK-1']]));
        $this->assertSame('Bonjour, votre réservation BK-1 est confirmée.', $this->corps($gabarit, ['user' => [], 'booking' => ['code' => 'BK-1']]));
    }

    /** AC4 — non-régression : un prénom présent. */
    public function test_un_prenom_present_rend_bonjour_awa(): void
    {
        $this->assertSame(
            'Bonjour Awa, votre réservation BK-1 est confirmée.',
            $this->corps('Bonjour {{ user.first_name }}, votre réservation {{ booking.code }} est confirmée.', ['user' => ['first_name' => 'Awa'], 'booking' => ['code' => 'BK-1']]),
        );
    }

    /** Le repli ne touche que l'espace devant une variable vide suivie d'une ponctuation. */
    public function test_le_repli_ne_touche_ni_le_texte_ni_une_variable_suivie_d_un_mot(): void
    {
        foreach (['.', '!', '?', ':'] as $ponctuation) {
            $this->assertSame("Merci{$ponctuation} À bientôt", $this->corps("Merci {{ user.first_name }}{$ponctuation} À bientôt", ['user' => ['first_name' => '']]));
        }
        // Suivie d'un mot, la variable vide laisse le texte tel quel (le gabarit dit ce qu'il dit).
        $this->assertSame('Votre bien  est publié.', $this->corps('Votre bien {{ property.title }} est publié.', ['property' => ['title' => '']]));
        // Une valeur non vide garde son espace, même suivie d'une ponctuation.
        $this->assertSame('Votre bien Villa, publié.', $this->corps('Votre bien {{ property.title }}, publié.', ['property' => ['title' => 'Villa']]));
        // Une valeur « 0 » n'est pas vide.
        $this->assertSame('Montant 0.', $this->corps('Montant {{ payment.amount }}.', ['payment' => ['amount' => 0]]));
    }
}
