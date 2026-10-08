<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Payout;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC17) — le bénéficiaire apprend que l'argent est parti (net, référence) ou qu'il n'est
 * pas parti (motif). L'avis est un CODE rendu dans la langue du destinataire (ADR-0032) : une phrase
 * écrite en dur se lirait identique en français et en anglais, et ce test la refuse.
 */
class PayoutBeneficiaryNotificationsTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** @return array{0: Payout, 1: User} */
    private function payout(): array
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        Sanctum::actingAs($this->agencyAgent($agency));
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 10), 200_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->json('data.id');

        return [Payout::findOrFail($id), $landlord];
    }

    /** @return list<string> */
    private function mailText(object $notification, object $notifiable, string $locale): array
    {
        App::setLocale($locale);
        /** @var MailMessage $mail */
        $mail = $notification->toMail($notifiable);
        App::setLocale('fr');

        return [$mail->subject, ...$mail->introLines, $mail->greeting, $mail->salutation];
    }

    private function assertEveryLineIsTranslated(object $notification, object $notifiable, string $code): void
    {
        $fr = $this->mailText($notification, $notifiable, 'fr');
        $en = $this->mailText($notification, $notifiable, 'en');

        foreach ($fr as $i => $line) {
            $this->assertNotSame($en[$i], $line, "ligne non traduite (littéral ?) : {$line}");
            $this->assertStringNotContainsString('notifications.', $line, "clé absente : {$line}");
        }
        foreach (['fr', 'en', 'wo'] as $locale) {
            $this->assertTrue(Lang::has("notifications.codes.{$code}.title", $locale), "{$code} sans titre en {$locale}");
        }
    }

    public function test_ac17_mark_processed_tells_the_beneficiary_the_net_and_the_reference(): void
    {
        Notification::fake();
        [$payout, $landlord] = $this->payout();

        $this->postJson("/api/payouts/{$payout->id}/mark-processed", [
            'payment_method' => 'check', 'transaction_id' => 'CHQ-778899',
        ])->assertOk();

        Notification::assertSentTo($landlord, CodedNotification::class, function (CodedNotification $n) use ($landlord): bool {
            $this->assertSame(NotificationCode::PayoutProcessed, $n->code);
            $text = implode("\n", $this->mailText($n, $landlord, 'fr'));
            $this->assertMatchesRegularExpression('/180\s000/u', $text);
            $this->assertStringContainsString('CHQ-778899', $text);
            $this->assertEveryLineIsTranslated($n, $landlord, 'payout.processed');

            return true;
        });
    }

    public function test_ac17_mark_failed_tells_the_beneficiary_the_reason(): void
    {
        Notification::fake();
        [$payout, $landlord] = $this->payout();

        $this->postJson("/api/payouts/{$payout->id}/mark-failed", ['failed_reason' => 'Numéro Wave fermé'])->assertOk();

        Notification::assertSentTo($landlord, CodedNotification::class, function (CodedNotification $n) use ($landlord): bool {
            $this->assertSame(NotificationCode::PayoutFailed, $n->code);
            $this->assertStringContainsString('Numéro Wave fermé', implode("\n", $this->mailText($n, $landlord, 'fr')));
            $this->assertEveryLineIsTranslated($n, $landlord, 'payout.failed');

            return true;
        });
    }
}
