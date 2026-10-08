<?php

namespace Tests\Feature\Search;

use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-599 **AC19** (contrainte 7) — un compte rattache les alertes sans compte de SON contact, et
 * seulement s'il l'a VÉRIFIÉ. Jamais par déclaration.
 */
class SearchAlertClaimTest extends TestCase
{
    use RefreshDatabase;

    private function abonne(string $channel, string $contact, bool $confirme = true, string $nom = 'Dakar'): AlertSubscriber
    {
        $abonne = AlertSubscriber::create([
            'channel' => $channel,
            'contact' => AlertSubscriber::normalizeContact($channel, $contact),
            'contact_hash' => AlertSubscriber::contactHash($channel, $contact),
            'locale' => 'fr',
            'confirmed_at' => $confirme ? now() : null,
            'unsubscribe_token' => $jeton = AlertSubscriber::newToken(),
            'unsubscribe_token_hash' => AlertSubscriber::tokenHash($jeton),
            'consent_at' => now(),
            'consent_source' => 'public_search_alert',
            'consent_version' => AlertSubscriber::CONSENT_VERSION,
        ]);
        SavedSearch::create(['alert_subscriber_id' => $abonne->id, 'name' => $nom, 'criteria' => ['city' => 'Dakar']]);

        return $abonne;
    }

    public function test_un_e_mail_verifie_rattache_les_alertes_de_son_adresse_quelle_que_soit_la_casse(): void
    {
        $this->abonne('email', 'awa@exemple.sn');
        // verif-599 m5 (A19) — saisie `AWA@…` : le repli de casse de l'abonné, pas celui de `User`.
        $this->abonne('email', 'AWA@exemple.sn', nom: 'Thiès');
        $this->abonne('email', 'autre@exemple.sn');
        $awa = User::factory()->create(['email' => 'Awa@Exemple.sn', 'email_verified_at' => now()]);
        SavedSearch::create(['user_id' => $awa->id, 'name' => 'Dakar', 'criteria' => ['city' => 'Dakar']]);

        Sanctum::actingAs($awa);
        $this->postJson('/api/saved-searches/claim')->assertOk()->assertJsonPath('data.claimed', 2);

        $this->assertSame(3, SavedSearch::where('user_id', $awa->id)->count());
        $this->assertSame(0, AlertSubscriber::query()->forContact('email', 'awa@exemple.sn')->count(), 'le contact quitte alert_subscribers');
        $this->assertSame(1, AlertSubscriber::count(), 'celui d\'un autre reste');
        $this->assertSame(2, SavedSearch::where('user_id', $awa->id)->where('name', 'like', 'Dakar%')->count(), 'nom déjà pris : renommé, pas rejeté');
    }

    public function test_un_e_mail_non_verifie_ne_rattache_rien(): void
    {
        $this->abonne('email', 'awa@exemple.sn');
        Sanctum::actingAs(User::factory()->create(['email' => 'awa@exemple.sn', 'email_verified_at' => null]));

        $this->postJson('/api/saved-searches/claim')->assertOk()->assertJsonPath('data.claimed', 0);
        $this->assertSame(1, AlertSubscriber::count());
    }

    public function test_un_autre_utilisateur_ne_rattache_aucune_alerte(): void
    {
        $this->abonne('email', 'awa@exemple.sn');
        $this->abonne('whatsapp', '+221771234567');
        Sanctum::actingAs(User::factory()->create([
            'email' => 'moussa@exemple.sn', 'email_verified_at' => now(),
            'phone' => '+221770000000', 'phone_verified_at' => now(),
        ]));

        $this->postJson('/api/saved-searches/claim')->assertOk()->assertJsonPath('data.claimed', 0);
        $this->assertSame(2, AlertSubscriber::count());
    }

    public function test_un_telephone_verifie_rattache_les_alertes_whatsapp_de_son_numero(): void
    {
        $this->abonne('whatsapp', '+221771234567');
        $this->abonne('whatsapp', '+221771234567', confirme: false, nom: 'En attente');
        $non = User::factory()->create(['phone' => '+221771234567', 'phone_verified_at' => null]);
        Sanctum::actingAs($non);
        $this->postJson('/api/saved-searches/claim')->assertOk()->assertJsonPath('data.claimed', 0);

        $oui = User::factory()->create(['phone' => '+221 77 123 45 67', 'phone_verified_at' => now()]);
        Sanctum::actingAs($oui);
        $this->postJson('/api/saved-searches/claim')->assertOk()->assertJsonPath('data.claimed', 1);
        $this->assertSame(['Dakar'], SavedSearch::where('user_id', $oui->id)->pluck('name')->all(), 'une demande non confirmée ne se rattache pas');
    }
}
