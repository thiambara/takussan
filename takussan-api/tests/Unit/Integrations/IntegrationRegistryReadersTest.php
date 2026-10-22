<?php

namespace Tests\Unit\Integrations;

use App\Domain\Integrations\Providers\IntegrationProviderRegistry;
use App\Services\Notifications\Sms\Drivers\LAfricaMobileSmsDriver;
use App\Services\Notifications\Sms\Drivers\MtargetSmsDriver;
use App\Services\Notifications\Sms\Drivers\OrangeSmsDriver;
use App\Services\Notifications\Whatsapp\CloudApiWhatsappDriver;
use App\Services\Payments\PaymentGatewayService;
use ReflectionClass;
use Tests\TestCase;

/**
 * P98.07 (TCK-1170) — chaque fournisseur du registre des intégrations a un pilote qui lit sa ligne.
 * Avant, `mail` et `sms` étaient servis à la console, avec un « Test » qui pouvait sortir `healthy`,
 * alors qu'aucun envoi ne lisait leur ligne : le courriel lit `MAIL_*`, le SMS les clés `sms_*`.
 */
class IntegrationRegistryReadersTest extends TestCase
{
    /** Les pilotes de messagerie, chacun nommant dans son source la clé dont il lit la ligne. */
    private const MESSAGING_READERS = [
        'sms_orange' => OrangeSmsDriver::class,
        'sms_mtarget' => MtargetSmsDriver::class,
        'sms_lafricamobile' => LAfricaMobileSmsDriver::class,
        'whatsapp_cloud' => CloudApiWhatsappDriver::class,
    ];

    /**
     * Sans lecteur, et gardées pour une raison écrite. Une clé ne s'ajoute ici qu'avec la sienne.
     *
     * @var array<string, string>
     */
    private const WITHOUT_READER = [
        // `docs/features.md` (§ 2.9, TCK-602) : « Stripe n'a qu'une fiche d'identifiants au registre ».
        'stripe' => 'fiche gardée par la spec',
        // Hors de P98.07 : l'écran d'intégrations de l'agence le propose encore.
        'mailgun' => 'proposé par IntegrationsManager, hors de P98.07',
    ];

    public function test_every_registry_key_has_a_driver_that_reads_its_row(): void
    {
        $readers = array_merge(array_keys(PaymentGatewayService::DRIVERS), array_keys(self::MESSAGING_READERS));

        foreach (app(IntegrationProviderRegistry::class)->keys() as $key) {
            if (array_key_exists($key, self::WITHOUT_READER)) {
                continue;
            }
            $this->assertContains($key, $readers, "`{$key}` est au registre, mais aucun pilote ne lit sa ligne");
        }
    }

    public function test_each_messaging_reader_names_its_key(): void
    {
        foreach (self::MESSAGING_READERS as $key => $driver) {
            $source = (string) file_get_contents((string) (new ReflectionClass($driver))->getFileName());
            $this->assertStringContainsString("'{$key}'", $source, $driver);
        }
    }

    public function test_the_exemptions_are_still_in_the_registry(): void
    {
        $keys = app(IntegrationProviderRegistry::class)->keys();
        foreach (array_keys(self::WITHOUT_READER) as $key) {
            $this->assertContains($key, $keys, "`{$key}` a quitté le registre : retirer son exemption");
        }
    }
}
