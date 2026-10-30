<?php

namespace Tests\Feature\Search;

use App\Models\AccountDeletionRequest;
use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\RotationDAppKey;
use Tests\TestCase;

/**
 * TCK-2430 (ADR-0084) — l'empreinte d'un contact d'alerte est un HMAC sous `APP_KEY`. Après une rotation qui garde
 * l'ancienne clé dans `APP_PREVIOUS_KEYS`, les demandes écrites avant restent celles du même contact : une
 * désinscription, un rattachement, une suppression de compte et les plafonds de la boîte les voient toutes.
 */
class SearchAlertAppKeyRotationTest extends TestCase
{
    use RefreshDatabase;
    use RotationDAppKey;

    private const EMAIL = 'awa@exemple.sn';

    /** Le jeton de désinscription du dernier abonné, tel que le lien de l'e-mail le porte. */
    private string $jetonEnClair = '';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /** Une demande écrite comme `RecordPublicSearchAlert` l'écrit : empreintes sous la clé de CE moment. */
    private function abonne(string $channel = AlertSubscriber::CHANNEL_EMAIL, string $contact = self::EMAIL, bool $confirme = true): AlertSubscriber
    {
        $abonne = AlertSubscriber::create([
            'channel' => $channel,
            'contact' => AlertSubscriber::normalizeContact($channel, $contact),
            'contact_hash' => AlertSubscriber::contactHash($channel, $contact),
            'locale' => 'fr',
            'confirmed_at' => $confirme ? now() : null,
            'unsubscribe_token' => $jeton = $this->jetonEnClair = AlertSubscriber::newToken(),
            'unsubscribe_token_hash' => AlertSubscriber::tokenHash($jeton),
            'consent_at' => now(),
            'consent_source' => 'public_search_alert',
            'consent_version' => AlertSubscriber::CONSENT_VERSION,
        ]);
        SavedSearch::create(['alert_subscriber_id' => $abonne->id, 'name' => 'Dakar '.$abonne->id, 'criteria' => ['city' => 'Dakar']]);

        return $abonne;
    }

    private function desinscrire(AlertSubscriber $par): void
    {
        $this->postJson('/api/public/search-alerts/unsubscribe', ['token' => $par->fresh()->unsubscribe_token])
            ->assertOk()->assertJsonPath('data.status', 'unsubscribed');
    }

    public function test_ac1_la_desinscription_d_une_demande_neuve_efface_les_demandes_confirmees_avant_la_rotation(): void
    {
        $avant = $this->abonne();
        $this->tournerAppKey();
        $apres = $this->abonne();
        $autre = $this->abonne(contact: 'autre@exemple.sn');
        $this->assertNotSame($avant->contact_hash, $apres->contact_hash, 'la rotation a bien changé l\'empreinte');

        $this->desinscrire($apres);

        $this->assertModelMissing($avant);
        $this->assertModelMissing($apres);
        $this->assertModelExists($autre);
        $this->assertSame(0, SavedSearch::query()->whereIn('alert_subscriber_id', [$avant->id, $apres->id])->count());
    }

    public function test_ac1_la_desinscription_d_une_demande_d_avant_la_rotation_efface_aussi_les_demandes_neuves(): void
    {
        $avant = $this->abonne();
        $this->tournerAppKey();
        $apres = $this->abonne();

        $this->desinscrire($avant);

        $this->assertSame(0, AlertSubscriber::query()->count());
    }

    public function test_ac1_whatsapp_la_desinscription_apres_rotation_efface_le_numero_ecrit_avant(): void
    {
        $avant = $this->abonne(AlertSubscriber::CHANNEL_WHATSAPP, '+221771234567');
        $this->tournerAppKey();
        $apres = $this->abonne(AlertSubscriber::CHANNEL_WHATSAPP, '+221771234567');

        $this->desinscrire($apres);

        $this->assertModelMissing($avant);
        $this->assertSame(0, AlertSubscriber::query()->count());
    }

    public function test_un_compte_verifie_rattache_les_alertes_ecrites_avant_la_rotation(): void
    {
        $this->abonne();
        $this->tournerAppKey();
        $this->abonne();
        Sanctum::actingAs($awa = User::factory()->create(['email' => self::EMAIL, 'email_verified_at' => now()]));

        $this->postJson('/api/saved-searches/claim')->assertOk()->assertJsonPath('data.claimed', 2);

        $this->assertSame(0, AlertSubscriber::query()->count());
        $this->assertSame(2, SavedSearch::query()->where('user_id', $awa->id)->count());
    }

    public function test_la_suppression_du_compte_emporte_les_alertes_ecrites_avant_la_rotation(): void
    {
        Notification::fake();
        $parMail = $this->abonne();
        $parNumero = $this->abonne(AlertSubscriber::CHANNEL_WHATSAPP, '+221771230008');
        $this->tournerAppKey();
        $user = User::factory()->create([
            'email' => self::EMAIL, 'email_verified_at' => now(), 'phone' => '+221771230008', 'phone_verified_at' => now(),
        ]);

        app(AccountDeletionService::class)->executeDeletion(AccountDeletionRequest::factory()->for($user)->due()->create());

        $this->assertModelMissing($parMail);
        $this->assertModelMissing($parNumero);
    }

    /** Les plafonds se comptent par boîte, toutes clés reconnues : une rotation ne rouvre pas cinq alertes de plus. */
    public function test_le_plafond_d_alertes_ouvertes_compte_celles_d_avant_la_rotation(): void
    {
        foreach (range(1, 5) as $i) {
            $this->abonne(confirme: false);
        }
        $this->tournerAppKey();

        $this->postJson('/api/public/search-alerts', [
            'criteria' => ['city' => 'Dakar'], 'name' => 'Sixième', 'frequency' => 'daily', 'channel' => 'email',
            'email' => self::EMAIL, 'locale' => 'fr', 'consent' => true,
        ])->assertStatus(202);

        $this->assertSame(5, AlertSubscriber::query()->count());
    }

    /**
     * Vérification adverse I1 — l'ancienne clé PERDUE (absente d'`APP_PREVIOUS_KEYS`) : le contact ne se déchiffre plus.
     * La désinscription aboutit quand même, sous l'empreinte stockée, comme avant TCK-2430 ; elle ne rend pas 500.
     */
    public function test_cle_perdue_la_desinscription_par_e_mail_aboutit_sous_l_empreinte_stockee(): void
    {
        $avant = $this->abonne();
        $this->tournerAppKey(garderLAncienne: false);

        $this->postJson('/api/public/search-alerts/unsubscribe', ['token' => $this->jetonEnClair])
            ->assertOk()->assertJsonPath('data.status', 'unsubscribed');

        $this->assertModelMissing($avant);
    }

    /** Vérification adverse M1 — le plafond de deux confirmations par 24 h compte aussi celles d'avant la rotation. */
    public function test_le_plafond_de_confirmations_du_jour_compte_celles_d_avant_la_rotation(): void
    {
        Notification::fake();
        foreach (range(1, 2) as $i) {
            $this->abonne(confirme: false)->forceFill(['confirmation_sent_at' => now()])->save();
        }
        $this->tournerAppKey();

        $this->postJson('/api/public/search-alerts', [
            'criteria' => ['city' => 'Dakar'], 'name' => 'Troisième', 'frequency' => 'daily', 'channel' => 'email',
            'email' => self::EMAIL, 'locale' => 'fr', 'consent' => true,
        ])->assertStatus(202);

        $this->assertSame(3, AlertSubscriber::query()->count(), 'la demande est écrite, sous les plafonds de demandes ouvertes');
        Notification::assertNothingSent();
        $this->assertNull(AlertSubscriber::query()->latest('id')->first()->confirmation_sent_at);
    }
}
