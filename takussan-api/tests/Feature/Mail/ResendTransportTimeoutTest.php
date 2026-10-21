<?php

namespace Tests\Feature\Mail;

use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Mail\Transport\ResendTransport;
use Illuminate\Support\Facades\Mail;
use Resend\Client as ResendClient;
use Resend\Transporters\HttpTransporter;
use Tests\TestCase;

/**
 * P65.04 (TCK-1074) — le transport `resend` borne ses appels.
 *
 * Le transport de Laravel construit son client par `Resend::client()`, qui fait
 * `new GuzzleClient()` sans option : ni délai total ni délai de connexion. L'invitation part dans la
 * requête, et sa relance sous le verrou de l'invitation (TCK-367) : un Resend muet les tenait
 * jusqu'à la borne de PHP. Le test lit les options du client Guzzle que le gestionnaire de
 * courriel construit pour le mailer `resend`, la configuration de production.
 */
class ResendTransportTimeoutTest extends TestCase
{
    public function test_le_client_guzzle_du_transport_resend_porte_ses_delais(): void
    {
        config(['services.resend.key' => 're_factice']);

        $transport = Mail::mailer('resend')->getSymfonyTransport();
        $this->assertInstanceOf(ResendTransport::class, $transport);

        $guzzle = $this->guzzleDe($transport);

        $this->assertSame(5, $guzzle->getConfig('connect_timeout'));
        $this->assertSame(10, $guzzle->getConfig('timeout'));
    }

    private function guzzleDe(ResendTransport $transport): GuzzleClient
    {
        $resend = (new \ReflectionProperty($transport, 'resend'))->getValue($transport);
        $this->assertInstanceOf(ResendClient::class, $resend);

        $transporter = (new \ReflectionProperty($resend, 'transporter'))->getValue($resend);
        $this->assertInstanceOf(HttpTransporter::class, $transporter);

        $guzzle = (new \ReflectionProperty($transporter, 'client'))->getValue($transporter);
        $this->assertInstanceOf(GuzzleClient::class, $guzzle);

        return $guzzle;
    }
}
