<?php

namespace Tests\Feature\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-2706 AC5 — la relance qui fusionne loyer et charges du même jour les NOMME (« loyer et
 * charges ») et détaille les deux montants et leur total, au locataire et au bailleur, dans le corps
 * et dans le SMS, en `fr`, `en` et `wo` (`wo` = le texte français, wolof en pause). Une relance de
 * loyer seul garde son texte d'aujourd'hui, octet pour octet : les attendus sont écrits en toutes
 * lettres, pas relus dans les fichiers de langue.
 */
class MergedReminderWordingTest extends TestCase
{
    use RefreshDatabase;

    private Lease $lease;

    private User $locataire;

    private User $bailleur;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Un bail d'agence, locataire avec compte, dont le loyer (et les charges) étaient dus le 5 novembre. */
    private function relance(bool $avecCharges): void
    {
        $agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->locataire = User::factory()->create(['preferred_language' => 'fr']);
        $this->bailleur = User::factory()->create(['preferred_language' => 'fr']);
        $tenant = Customer::factory()->create(['user_id' => $this->locataire->id, 'first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => Property::factory()->create(['agency_id' => $agency->id, 'title' => 'Villa Ngor'])->id,
            'tenant_id' => $tenant->id,
            'landlord_id' => $this->bailleur->id,
            'status' => LeaseStatus::Active,
            'currency' => Currency::XOF,
        ]);
        $montants = [LeasePaymentType::Rent->value => 500_000] + ($avecCharges ? [LeasePaymentType::Charges->value => 150_000] : []);
        foreach ($montants as $type => $montant) {
            LeasePayment::factory()->create([
                'lease_id' => $this->lease->id,
                'payer_id' => $tenant->id,
                'payment_type' => $type,
                'amount' => $montant,
                'currency' => Currency::XOF,
                'status' => PaymentStatus::Pending,
                'due_date' => '2026-11-05',
                'late_fee_amount' => null,
            ]);
        }

        Carbon::setTestNow('2026-11-06 08:00:00');
        app()->call([new SendLeasePaymentReminders, 'handle']);
    }

    /** @return array<string, mixed> les paramètres de l'avis reçu */
    private function params(User $destinataire, NotificationCode $code): array
    {
        $avis = Notification::sent($destinataire, CodedNotification::class, fn (CodedNotification $n) => $n->code === $code);
        $this->assertCount(1, $avis, $code->value);

        return $avis->first()->params;
    }

    private function rendu(NotificationCode $code, array $params, string $langue, string $surface): string
    {
        return app(NotificationRenderer::class)->render($code, $params, $langue, null, $surface);
    }

    private function fcfa(float $montant, string $langue): string
    {
        return app(CurrencyFormatter::class)->format($montant, Currency::XOF, $langue);
    }

    public function test_ac5_loyer_et_charges_sont_nommes_et_detailles_partout(): void
    {
        $this->relance(avecCharges: true);
        $mots = ['fr' => ['loyer', 'charges'], 'en' => ['rent', 'charges'], 'wo' => ['loyer', 'charges']];

        foreach ([[$this->locataire, NotificationCode::LeasePaymentOverdue], [$this->bailleur, NotificationCode::LeasePaymentOverdueLandlord]] as [$qui, $code]) {
            $params = $this->params($qui, $code);
            foreach (['fr', 'en', 'wo'] as $langue) {
                foreach (['title', 'body', 'sms'] as $surface) {
                    $texte = $this->rendu($code, $params, $langue, $surface);
                    $ou = "{$code->value} [{$langue}] {$surface} : {$texte}";
                    foreach ($mots[$langue] as $mot) {
                        $this->assertStringContainsStringIgnoringCase($mot, $texte, $ou);
                    }
                    if ($surface === 'title') {
                        continue;
                    }
                    foreach ([500000, 150000, 650000] as $montant) {
                        $this->assertStringContainsString($this->fcfa($montant, $langue), $texte, $ou);
                    }
                    // Le bien reste nommé, SMS compris : à plusieurs biens, sans lui on ne sait pas lequel.
                    $this->assertStringContainsString('Villa Ngor', $texte, $ou);
                }
            }
        }

        // `wo` = le texte français, mot pour mot (seuls les montants et la date suivent la langue).
        $params = $this->params($this->locataire, NotificationCode::LeasePaymentOverdue);
        $this->assertSame(
            'Votre loyer et vos charges pour Villa Ngor, dus le nowaambar 05, 2026, sont en retard de 1 jour : loyer '
            .$this->fcfa(500000, 'wo').', charges '.$this->fcfa(150000, 'wo').', total '.$this->fcfa(650000, 'wo').'.',
            $this->rendu(NotificationCode::LeasePaymentOverdue, $params, 'wo', 'body'),
        );
        $this->assertSame(
            'Takussan : loyer '.$this->fcfa(500000, 'fr').' + charges '.$this->fcfa(150000, 'fr').' = '.$this->fcfa(650000, 'fr').', en retard de 1 jour (Villa Ngor).',
            $this->rendu(NotificationCode::LeasePaymentOverdue, $params, 'fr', 'sms'),
        );
    }

    /** La cloche du locataire (la ligne rendue par l'API à l'envoi) dit « loyer et charges ». */
    public function test_ac5_la_ligne_du_compte_dit_loyer_et_charges(): void
    {
        $this->relance(avecCharges: true);

        $ligne = $this->locataire->fresh()->appNotifications()->where('code', NotificationCode::LeasePaymentOverdue->value)->sole();
        $this->assertSame('Loyer et charges en retard', $ligne->title);
        $this->assertStringContainsString('Votre loyer et vos charges pour Villa Ngor', (string) $ligne->body);
    }

    /** Un loyer seul : le texte d'aujourd'hui, octet pour octet, dans les trois langues. */
    public function test_ac5_un_loyer_seul_garde_son_texte(): void
    {
        $this->relance(avecCharges: false);
        $loc = $this->params($this->locataire, NotificationCode::LeasePaymentOverdue);
        $bai = $this->params($this->bailleur, NotificationCode::LeasePaymentOverdueLandlord);
        $this->assertArrayNotHasKey('rent', $loc);
        $this->assertArrayNotHasKey('charges', $loc);
        [$fr, $en, $wo] = [$this->fcfa(500000, 'fr'), $this->fcfa(500000, 'en'), $this->fcfa(500000, 'wo')];

        $attendus = [
            [NotificationCode::LeasePaymentOverdue, $loc, 'fr', 'title', 'Loyer en retard'],
            [NotificationCode::LeasePaymentOverdue, $loc, 'fr', 'body', "Votre loyer de {$fr} pour Villa Ngor, dû le 5 novembre 2026, est en retard de 1 jour."],
            [NotificationCode::LeasePaymentOverdue, $loc, 'fr', 'sms', "Takussan : loyer de {$fr} en retard de 1 jour (Villa Ngor)."],
            [NotificationCode::LeasePaymentOverdue, $loc, 'en', 'body', "Your rent of {$en} for Villa Ngor, due on November 5, 2026, is 1 day overdue."],
            [NotificationCode::LeasePaymentOverdue, $loc, 'en', 'sms', "Takussan: rent of {$en} is 1 day overdue (Villa Ngor)."],
            [NotificationCode::LeasePaymentOverdue, $loc, 'wo', 'body', "Sa pey kër bu {$wo} ngir Villa Ngor, bu waroon a fey ci nowaambar 05, 2026, yàgg na 1 fan."],
            [NotificationCode::LeasePaymentOverdue, $loc, 'wo', 'sms', "Takussan : pey kër bu {$wo} yàgg na 1 fan (Villa Ngor)."],
            [NotificationCode::LeasePaymentOverdueLandlord, $bai, 'fr', 'title', 'Loyer impayé : Villa Ngor'],
            [NotificationCode::LeasePaymentOverdueLandlord, $bai, 'fr', 'body', "Le loyer de {$fr} de Awa Diop pour Villa Ngor est en retard de 1 jour."],
            [NotificationCode::LeasePaymentOverdueLandlord, $bai, 'fr', 'sms', "Takussan : loyer de {$fr} de Awa Diop (Villa Ngor) en retard de 1 jour."],
            [NotificationCode::LeasePaymentOverdueLandlord, $bai, 'en', 'body', "The rent of {$en} from Awa Diop for Villa Ngor is 1 day overdue."],
            [NotificationCode::LeasePaymentOverdueLandlord, $bai, 'wo', 'body', "Pey kër bu {$wo} bu Awa Diop ngir Villa Ngor yàgg na 1 fan."],
        ];
        foreach ($attendus as [$code, $params, $langue, $surface, $texte]) {
            $this->assertSame($texte, $this->rendu($code, $params, $langue, $surface), "{$code->value} [{$langue}] {$surface}");
        }
    }

    /** Le rappel J-3 aussi, et le texte de charges seules (le loyer déjà payé) dit « charges », jamais « loyer ». */
    public function test_le_rappel_j_moins_3_et_les_charges_seules(): void
    {
        $code = NotificationCode::LeasePaymentDueSoon;
        $argent = fn (int $n) => NotificationRenderer::money($n, 'XOF');
        $base = ['amount' => $argent(650000), 'due_date' => '2026-11-05', 'property' => 'Villa Ngor'];

        $fusion = $this->rendu($code, $base + ['rent' => $argent(500000), 'charges' => $argent(150000)], 'fr', 'body');
        $this->assertSame('Votre loyer et vos charges pour Villa Ngor sont dus le 5 novembre 2026 : loyer '
            .$this->fcfa(500000, 'fr').', charges '.$this->fcfa(150000, 'fr').', total '.$this->fcfa(650000, 'fr').'.', $fusion);

        $seules = ['amount' => $argent(150000), 'charges' => $argent(150000)] + $base;
        foreach (['fr', 'en', 'wo'] as $langue) {
            foreach (['title', 'body', 'sms'] as $surface) {
                $texte = $this->rendu($code, $seules, $langue, $surface);
                $this->assertStringContainsStringIgnoringCase('charges', $texte, "[{$langue}] {$surface}");
                $this->assertStringNotContainsStringIgnoringCase($langue === 'en' ? 'rent' : 'loyer', $texte, "[{$langue}] {$surface}");
            }
        }
    }
}
