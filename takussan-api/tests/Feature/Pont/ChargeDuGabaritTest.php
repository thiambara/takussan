<?php

namespace Tests\Feature\Pont;

use App\Models\NotificationTemplate;
use App\Services\Pont\Canaux\WhatsappCloud;
use App\Services\Pont\RegistreDesCanaux;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\ApiTestCase;
use Tests\Support\SceneDuPont;

/**
 * TCK-2981 (pour TCK-2982) — la charge que le pilote WhatsApp envoie à l'API Cloud pour un gabarit : le bouton d'URL
 * reçoit le jeton en suffixe (`sub_type = url`, paramètre `text`), hors du corps ; le bouton de réponse rapide reçoit
 * sa charge utile (`quick_reply`, paramètre `payload`). Faux transport (`Http::fake`), aucune clé réelle.
 */
class ChargeDuGabaritTest extends ApiTestCase
{
    use RefreshDatabase;
    use SceneDuPont;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLePont();
        config()->set('whatsapp.default_driver', 'cloud');
        config()->set('whatsapp.base_uri', 'https://graph.example.test/v21.0');
        Http::fake(['graph.example.test/*' => Http::response(['messages' => [['id' => 'wamid.CHARGE']]])]);
        foreach (['pont_lien_action', 'pont_invitation'] as $gabarit) {
            NotificationTemplate::query()->updateOrCreate(
                ['event' => $gabarit, 'channel' => 'whatsapp', 'locale' => 'fr'],
                ['body' => '{{1}} — {{2}}', 'is_active' => true, 'meta_template_name' => $gabarit,
                    'meta_category' => NotificationTemplate::META_CATEGORY_UTILITY, 'meta_status' => NotificationTemplate::META_STATUS_APPROVED],
            );
        }
    }

    /** @return array<string, mixed> */
    private function chargeEnvoyee(): array
    {
        $charges = [];
        Http::assertSent(function (Request $r) use (&$charges): bool {
            $charges[] = $r->data();

            return true;
        });
        $this->assertCount(1, $charges);

        return $charges[0];
    }

    public function test_le_bouton_d_url_porte_le_jeton_en_suffixe_hors_du_corps(): void
    {
        $canal = app(RegistreDesCanaux::class)->canal(WhatsappCloud::NOM);

        $resultat = $canal->envoyerGabarit(self::TEL_BAILLEUR, 'pont_lien_action', 'fr', ['Agence A', 'Signer'], ['agency_id' => $this->agence->id, 'bouton_url' => 'JETON-123']);

        $this->assertTrue($resultat->envoye());
        $this->assertSame('wamid.CHARGE', $resultat->identifiantExterne);
        $charge = $this->chargeEnvoyee();
        $this->assertSame('pont_lien_action', $charge['template']['name']);
        $this->assertSame([
            ['type' => 'body', 'parameters' => [['type' => 'text', 'text' => 'Agence A'], ['type' => 'text', 'text' => 'Signer']]],
            ['type' => 'button', 'sub_type' => 'url', 'index' => '0', 'parameters' => [['type' => 'text', 'text' => 'JETON-123']]],
        ], $charge['template']['components']);
        $this->assertStringNotContainsString('JETON-123', json_encode($charge['template']['components'][0]));
    }

    public function test_le_bouton_de_reponse_rapide_porte_sa_charge_utile(): void
    {
        $canal = app(RegistreDesCanaux::class)->canal(WhatsappCloud::NOM);

        $canal->envoyerGabarit(self::TEL_BAILLEUR, 'pont_invitation', 'fr', ['Agence A', 'Bail'], ['agency_id' => $this->agence->id, 'bouton_reponse' => 'pont-invitation:7']);

        $this->assertSame(
            ['type' => 'button', 'sub_type' => 'quick_reply', 'index' => '0', 'parameters' => [['type' => 'payload', 'payload' => 'pont-invitation:7']]],
            $this->chargeEnvoyee()['template']['components'][1],
        );
    }
}
