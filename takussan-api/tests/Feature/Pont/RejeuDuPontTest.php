<?php

namespace Tests\Feature\Pont;

use App\Models\Message;
use App\Models\MessageRelay;
use App\Models\PropertyContactLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Support\SceneDuPont;

/** TCK-2980 (ADR-0132 § 1) — AC3 : un identifiant rejoué par le fournisseur ne s'écrit qu'une fois. */
class RejeuDuPontTest extends ApiTestCase
{
    use RefreshDatabase, SceneDuPont;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLePont();
    }

    public function test_ac3_un_message_rejoue_dans_un_fil(): void
    {
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);
        $message = $this->texte('wamid.R1', self::TEL_BAILLEUR, 'Bien reçu.');

        $this->recevoir([$message])->assertOk();
        $this->recevoir([$message])->assertOk();
        // Dans la même livraison, deux fois.
        $this->recevoir([$message, $message])->assertOk();

        $this->assertSame(1, Message::query()->where('sender_id', $this->bailleur->id)->count());
        $this->assertSame(1, MessageRelay::query()->where('provider_message_id', 'wamid.R1')->count());
    }

    public function test_ac3_un_prospect_rejoue(): void
    {
        $message = $this->texte('wamid.R2', self::TEL_INCONNU, 'Bonjour');

        $this->recevoir([$message])->assertOk();
        $this->recevoir([$message])->assertOk();

        $this->assertSame('Bonjour', PropertyContactLead::query()->sole()->message);
        $this->assertSame(1, MessageRelay::query()->where('provider_message_id', 'wamid.R2')->count());
    }
}
