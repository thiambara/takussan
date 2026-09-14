<?php

namespace Tests\Feature\Mail;

use Illuminate\Mail\MailManager;
use Illuminate\Mail\Transport\ResendTransport;
use Tests\TestCase;

/**
 * Les environnements déployés déclarent `MAIL_MAILER=resend` (docs/infra/prod-drivers.json) : son
 * transport doit se construire. Sans `resend/resend-php`, chaque notification par courriel mourait
 * dans le worker sur « Class "Resend" not found » — relevé sur la préproduction le 2026-09-14, où
 * 35 envois avaient échoué ainsi.
 *
 * Un `MailManager` neuf, et non la façade : un `Mail::fake()` ne peut pas masquer le défaut.
 * Aucun appel réseau : le client Resend ne parle qu'à l'envoi.
 */
class ResendMailerTest extends TestCase
{
    public function test_the_resend_mailer_builds_its_transport(): void
    {
        config(['services.resend.key' => 're_test_sans_appel']);

        $transport = (new MailManager($this->app))->mailer('resend')->getSymfonyTransport();

        $this->assertInstanceOf(ResendTransport::class, $transport);
        $this->assertSame('resend', (string) $transport);
    }
}
