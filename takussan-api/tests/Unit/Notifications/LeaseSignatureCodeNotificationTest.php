<?php

namespace Tests\Unit\Notifications;

use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use Tests\TestCase;

/**
 * TCK-898 (P12.08) — `LeaseSignatureCodeNotification::toMail()` est le seul endroit où le code qui
 * vaut signature d'un bail part par e-mail (TCK-596, ADR-0042 §2). Les tests qui citent la
 * notification la figent par `Notification::fake()` sans jamais la rendre : un mail parti sans le
 * code restait vert. Celui-ci rend le mail.
 */
class LeaseSignatureCodeNotificationTest extends TestCase
{
    public function test_le_mail_rendu_porte_le_code_la_reference_et_la_validite(): void
    {
        $notification = new LeaseSignatureCodeNotification(
            code: '482913',
            reference: 'BAIL-2026-0042',
            expiresInMinutes: 37,
            channel: LeaseSignatureCodeNotification::CHANNEL_MAIL,
        );
        $user = User::factory()->make();

        $this->assertSame(['mail'], $notification->via($user));

        $mail = $notification->toMail($user);
        $html = (string) $mail->render();

        $this->assertStringContainsString('BAIL-2026-0042', $mail->subject);
        $this->assertStringContainsString('482913', $html);
        $this->assertStringContainsString('BAIL-2026-0042', $html);
        $this->assertStringContainsString(e(__('notifications.lease_signature_code.expires', ['minutes' => 37])), $html);
        $this->assertStringNotContainsString('notifications.lease_signature_code', $mail->subject.$html);
    }
}
