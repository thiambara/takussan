<?php

namespace Tests\Unit\Integrations;

use App\Domain\Integrations\Providers\IntegrationProviderRegistry;
use App\Services\Notifications\Sms\Drivers\LAfricaMobileSmsDriver;
use App\Services\Notifications\Sms\Drivers\MtargetSmsDriver;
use App\Services\Notifications\Sms\Drivers\OrangeSmsDriver;
use App\Services\Notifications\Whatsapp\CloudApiWhatsappDriver;
use ReflectionClass;
use Tests\TestCase;

/**
 * P98.06 (TCK-1166) — la règle de TCK-602 étendue aux fournisseurs SMS et WhatsApp : le schéma que
 * la console rend est tiré des clés que le pilote lit. Avant, les quatre étaient servis par le
 * schéma générique, un `api_key` obligatoire que nul pilote ne lit, et aucun identifiant réel ne se
 * saisissait depuis l'écran.
 *
 * Les clés lues sont relevées dans le SOURCE du pilote (`$creds['…']`) : une clé neuve lue par un
 * pilote fait rougir ce test tant que le schéma ne la demande pas.
 */
class MessagingDriverCredentialsTest extends TestCase
{
    /** @var array<string, class-string> */
    private const DRIVERS = [
        'sms_orange' => OrangeSmsDriver::class,
        'sms_mtarget' => MtargetSmsDriver::class,
        'sms_lafricamobile' => LAfricaMobileSmsDriver::class,
        'whatsapp_cloud' => CloudApiWhatsappDriver::class,
    ];

    /** Les clés sans lesquelles le pilote n'envoie rien : obligatoires dans le schéma. */
    private const REQUIRED = [
        'sms_orange' => ['client_id', 'client_secret', 'sender_address'],
        'sms_mtarget' => ['username', 'password'],
        'sms_lafricamobile' => ['accountid', 'password'],
        'whatsapp_cloud' => ['phone_number_id', 'access_token'],
    ];

    /** @return list<string> */
    private function keysReadBy(string $driver): array
    {
        $source = (string) file_get_contents((string) (new ReflectionClass($driver))->getFileName());
        preg_match_all('/\$creds\[\'([a-z_]+)\'\]/', $source, $matches);

        return array_values(array_unique($matches[1]));
    }

    public function test_every_key_a_messaging_driver_reads_is_a_field_of_its_provider_schema(): void
    {
        $registry = app(IntegrationProviderRegistry::class);

        foreach (self::DRIVERS as $provider => $driver) {
            $read = $this->keysReadBy($driver);
            $this->assertNotEmpty($read, $provider);
            $fields = array_column($registry->get($provider)->schema(), 'name');

            foreach ($read as $key) {
                $this->assertContains($key, $fields, "{$provider} : `{$key}` est lu par le pilote, absent du schéma");
            }
            foreach ($fields as $field) {
                $this->assertContains($field, $read, "{$provider} : `{$field}` est demandé par le schéma, lu par aucun pilote");
            }
        }
    }

    public function test_the_required_fields_are_those_without_which_the_driver_sends_nothing(): void
    {
        $registry = app(IntegrationProviderRegistry::class);

        foreach (self::REQUIRED as $provider => $required) {
            $schema = $registry->get($provider)->schema();
            $this->assertEqualsCanonicalizing($required, array_column(array_filter($schema, fn (array $f): bool => $f['required'] === true), 'name'), $provider);

            $credentials = array_fill_keys($required, 'x');
            $this->assertSame([], $registry->get($provider)->validate($credentials), $provider);
        }
    }

    public function test_secret_fields_are_masked(): void
    {
        $registry = app(IntegrationProviderRegistry::class);
        $secrets = ['client_secret', 'password', 'access_token'];

        foreach (array_keys(self::DRIVERS) as $provider) {
            foreach ($registry->get($provider)->schema() as $field) {
                $this->assertSame(in_array($field['name'], $secrets, true), $field['secret'], "{$provider}.{$field['name']}");
            }
        }
    }
}
