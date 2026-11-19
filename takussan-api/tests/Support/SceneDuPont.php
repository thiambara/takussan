<?php

namespace Tests\Support;

use App\Models\Conversation;
use App\Models\Integration;
use App\Models\MessageRelay;
use App\Models\User;
use Illuminate\Testing\TestResponse;

/**
 * TCK-2980 (ADR-0132) — la scène du pont entrant : la scène de la note d'équipe (un bail d'une agence A, son agent,
 * un collègue, le locataire, le bailleur, un agent d'une agence B), plus le numéro WhatsApp de l'agence A (une
 * intégration `whatsapp_cloud`), le numéro vérifié du bailleur, et le webhook signé par un secret de test.
 * Aucune clé réelle : le webhook est appelé comme Meta l'appelle, signé `X-Hub-Signature-256`.
 */
trait SceneDuPont
{
    use SceneDeNoteDEquipe;

    protected const JETON = 'tck-2980-jeton';

    protected const SECRET = 'tck-2980-secret';

    protected const NUMERO_A = 'PNID-AGENCE-A';

    protected const TEL_BAILLEUR = '+221771112233';

    protected const TEL_INCONNU = '+221779998877';

    protected Integration $integration;

    protected function monterLePont(): void
    {
        config()->set('whatsapp.webhook_url_token', self::JETON);
        config()->set('whatsapp.webhook_app_secret', self::SECRET);
        config()->set('whatsapp.default_driver', 'log');
        $this->monterLaScene();
        $this->integration = $this->numeroDEntreprise(self::NUMERO_A, $this->agence->id);
        $this->bailleur->forceFill(['phone' => self::TEL_BAILLEUR, 'phone_verified_at' => now()])->save();
    }

    protected function numeroDEntreprise(string $id, ?int $agence): Integration
    {
        return Integration::factory()->create([
            'provider' => 'whatsapp_cloud',
            'agency_id' => $agence,
            'credentials' => ['phone_number_id' => $id, 'access_token' => 'jeton-de-test'],
            'is_active' => true,
        ]);
    }

    /**
     * Un message WhatsApp tel que Meta le livre.
     *
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    protected function texte(string $wamid, string $tel, string $texte, ?string $cite = null, array $extra = []): array
    {
        return array_merge([
            'from' => ltrim($tel, '+'),
            'id' => $wamid,
            'timestamp' => '1763500000',
            'type' => 'text',
            'text' => ['body' => $texte],
        ], $cite === null ? [] : ['context' => ['from' => '221700000000', 'id' => $cite]], $extra);
    }

    /**
     * Par l'ALIAS `webhooks/whatsapp/status/{token}` (l'URL déjà déclarée chez Meta) ; `$generique` : par
     * `webhooks/messagerie/whatsapp/{token}`.
     *
     * @param  list<array<string, mixed>>  $messages
     */
    protected function recevoir(array $messages, string $numero = self::NUMERO_A, ?string $secret = self::SECRET, bool $generique = false): TestResponse
    {
        $contacts = array_map(fn (array $m) => ['profile' => ['name' => 'Profil '.$m['from']], 'wa_id' => $m['from']], $messages);
        $content = (string) json_encode(['object' => 'whatsapp_business_account', 'entry' => [[
            'id' => 'WABA',
            'changes' => [[
                'field' => 'messages',
                'value' => [
                    'messaging_product' => 'whatsapp',
                    'metadata' => ['display_phone_number' => '221330000000', 'phone_number_id' => $numero],
                    'contacts' => $contacts,
                    'messages' => $messages,
                ],
            ]],
        ]]]);
        $serveur = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'];
        if ($secret !== null) {
            $serveur['HTTP_X_HUB_SIGNATURE_256'] = 'sha256='.hash_hmac('sha256', $content, $secret);
        }

        $url = $generique ? '/api/webhooks/messagerie/whatsapp/' : '/api/webhooks/whatsapp/status/';

        return $this->call('POST', $url.self::JETON, [], [], [], $serveur, $content);
    }

    /** Un relais sortant du pont (TCK-2981 l'écrira), vers `$tel`, rattaché à `$fil`. */
    protected function relaisSortant(Conversation $fil, User $vers, string $wamid, string $tel = self::TEL_BAILLEUR, ?string $quand = null): MessageRelay
    {
        $relais = MessageRelay::query()->create([
            'purpose' => MessageRelay::PURPOSE_MESSAGE,
            'direction' => MessageRelay::DIRECTION_OUT,
            'conversation_id' => $fil->id,
            'agency_id' => $this->agence->id,
            'user_id' => $vers->id,
            'channel' => 'whatsapp',
            'form' => 'text',
            'phone' => $tel,
            'business_number_id' => self::NUMERO_A,
            'provider_message_id' => $wamid,
            'status' => 'envoye',
            'sent_at' => now(),
        ]);
        if ($quand !== null) {
            $relais->forceFill(['created_at' => $quand])->save();
        }

        return $relais;
    }
}
