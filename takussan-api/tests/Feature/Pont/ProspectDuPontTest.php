<?php

namespace Tests\Feature\Pont;

use App\Models\Customer;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Message;
use App\Models\PropertyContactLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\SceneDuPont;

/**
 * TCK-2980 (ADR-0132 § 2) — un numéro inconnu crée un PROSPECT (`whatsapp_inbound`), jamais un fil : à traiter,
 * listé par défaut, convertible ; un second message s'ajoute au même prospect ; une fiche client au même numéro n'y
 * change rien (AC2) ; le numéro de la plateforme donne un prospect sans agence.
 */
class ProspectDuPontTest extends ApiTestCase
{
    use RefreshDatabase, SceneDuPont;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLePont();
    }

    public function test_un_numero_inconnu_devient_un_prospect_a_traiter(): void
    {
        $this->recevoir([$this->texte('wamid.P1', self::TEL_INCONNU, 'Bonjour, le F3 est-il libre ?')])->assertOk();

        $prospect = PropertyContactLead::query()->sole();
        $this->assertSame(ContactLeadChannel::WhatsappInbound, $prospect->channel);
        $this->assertSame($this->agence->id, (int) $prospect->agency_id);
        $this->assertSame(self::TEL_INCONNU, $prospect->phone);
        $this->assertSame('Profil '.ltrim(self::TEL_INCONNU, '+'), $prospect->name);
        $this->assertSame('Bonjour, le F3 est-il libre ?', $prospect->message);
        $this->assertSame(1, PropertyContactLead::query()->aTraiter()->count());

        // La boîte de l'agence le liste par défaut, et il se convertit.
        Sanctum::actingAs($this->auteur);
        $ids = array_column($this->getJson('/api/contact-leads')->assertOk()->json('data'), 'id');
        $this->assertContains($prospect->id, $ids);
        $this->postJson("/api/contact-leads/{$prospect->id}/convert", ['allow_duplicate' => true])->assertCreated();
    }

    public function test_un_second_message_s_ajoute_au_meme_prospect(): void
    {
        $this->recevoir([$this->texte('wamid.P2', self::TEL_INCONNU, 'Bonjour')])->assertOk();
        $this->recevoir([$this->texte('wamid.P3', self::TEL_INCONNU, 'Je peux visiter samedi ?')])->assertOk();

        $prospect = PropertyContactLead::query()->sole();
        $this->assertSame("Bonjour\n\nJe peux visiter samedi ?", $prospect->message);
    }

    /** AC2 — une fiche client au même numéro ne fait pas entrer l'inconnu dans un fil. */
    public function test_ac2_une_fiche_client_au_meme_numero_reste_un_prospect(): void
    {
        $client = Customer::factory()->create(['agency_id' => $this->agence->id, 'phone' => self::TEL_INCONNU, 'user_id' => $this->locataire->id]);
        $this->assertNotNull($client->id);
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.P4', self::TEL_INCONNU, 'Bonjour')])->assertOk();

        $this->assertSame(0, Message::query()->where('sender_id', $this->locataire->id)->count());
        $this->assertSame(1, PropertyContactLead::query()->whereNull('customer_id')->count());
    }

    public function test_le_numero_de_la_plateforme_donne_un_prospect_sans_agence(): void
    {
        $this->numeroDEntreprise('PNID-PLATEFORME', null);

        $this->recevoir([$this->texte('wamid.P5', self::TEL_INCONNU, 'Bonjour')], 'PNID-PLATEFORME')->assertOk();

        $this->assertNull(PropertyContactLead::query()->sole()->agency_id);
    }
}
