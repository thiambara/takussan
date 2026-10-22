<?php

namespace App\Domain\Integrations\Providers;

class GenericProvider extends AbstractProvider
{
    public function __construct(private readonly string $provider) {}

    public function key(): string
    {
        return $this->provider;
    }

    public function label(): string
    {
        return str($this->provider)->replace('_', ' ')->headline()->toString();
    }

    public function category(): string
    {
        return 'other';
    }

    /**
     * P98.06 (TCK-1166) — la règle de TCK-602 étendue aux fournisseurs de messagerie : le schéma est
     * tiré des clés que le pilote lit dans `credentials` (`MessagingDriverCredentialsTest`), et
     * n'exige que celles sans lesquelles il n'envoie rien. Avant, un `api_key` obligatoire que nul
     * pilote ne lit, et aucun identifiant réel ne se saisissait depuis la console.
     *
     * @var array<string, list<array{name:string,label:string,type:string,secret:bool,required:bool}>>
     */
    private const SCHEMAS = [
        'sms_orange' => [
            ['name' => 'client_id', 'label' => 'Client ID', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'client_secret', 'label' => 'Client secret', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'sender_address', 'label' => 'Sender address', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'sender_name', 'label' => 'Sender name', 'type' => 'text', 'secret' => false, 'required' => false],
        ],
        'sms_mtarget' => [
            ['name' => 'username', 'label' => 'Username', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'password', 'label' => 'Password', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'service_id', 'label' => 'Service ID', 'type' => 'text', 'secret' => false, 'required' => false],
            ['name' => 'sender_id', 'label' => 'Sender ID', 'type' => 'text', 'secret' => false, 'required' => false],
        ],
        'sms_lafricamobile' => [
            ['name' => 'accountid', 'label' => 'Account ID', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'password', 'label' => 'Password', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'host', 'label' => 'Host', 'type' => 'text', 'secret' => false, 'required' => false],
            ['name' => 'sender_id', 'label' => 'Sender ID', 'type' => 'text', 'secret' => false, 'required' => false],
        ],
        'whatsapp_cloud' => [
            ['name' => 'phone_number_id', 'label' => 'Phone number ID', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'access_token', 'label' => 'Access token', 'type' => 'password', 'secret' => true, 'required' => true],
        ],
    ];

    public function schema(): array
    {
        return self::SCHEMAS[$this->provider] ?? [
            ['name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true],
        ];
    }
}
