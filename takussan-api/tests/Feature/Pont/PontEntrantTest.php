<?php

namespace Tests\Feature\Pont;

use App\Models\Agency;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\LeaseStatus;
use App\Models\IntegrationWebhookLog;
use App\Models\Message;
use App\Models\MessageRelay;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\WhatsappContact;
use App\Services\Messaging\SallesDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\SceneDuPont;

/**
 * TCK-2980 (ADR-0132 § 1, § 2) — le routage d'un message reçu d'un numéro CONNU, par le webhook signé, sans
 * `actingAs` : un cas par étape (`context.id`, dernier relais, fil le plus récent, numéro global à deux agences), le
 * fil fermé à l'écriture sauté, le second numéro vérifié, le numéro d'un autre `phone_number_id` ignoré, la
 * signature.
 */
class PontEntrantTest extends ApiTestCase
{
    use RefreshDatabase, SceneDuPont;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLePont();
    }

    private function dernierMessage(): ?Message
    {
        return Message::query()->where('sender_id', $this->bailleur->id)->latest('id')->first();
    }

    /** AC1 — la réponse à un relais (`context.id`) va dans le fil de ce relais, même si un autre fil est plus récent. */
    public function test_ac1_le_message_cite_designe_le_fil(): void
    {
        $autre = $this->groupe([$this->auteur, $this->bailleur], ['property_id' => $this->bien->id]);
        $this->relaisSortant($this->fil, $this->bailleur, 'wamid.SORTANT-1', quand: now()->subDays(10)->toDateTimeString());
        $this->ecrireUnMessage('Plus récent', fil: $autre);

        $this->recevoir([$this->texte('wamid.E1', self::TEL_BAILLEUR, 'Oui, je confirme.', cite: 'wamid.SORTANT-1')])->assertOk();

        $message = $this->dernierMessage();
        $this->assertNotNull($message);
        $this->assertSame($this->fil->id, (int) $message->conversation_id);
        $this->assertSame('whatsapp', $message->channel);
        $this->assertSame('Oui, je confirme.', $message->content);
        $relais = MessageRelay::query()->where('provider_message_id', 'wamid.E1')->sole();
        $this->assertSame('in', $relais->direction);
        $this->assertSame($message->id, (int) $relais->message_id);
        $this->assertNotNull(WhatsappContact::query()->where('phone', self::TEL_BAILLEUR)->value('last_inbound_at'));
        // Le journal des webhooks dit ce qui a été lu, comme celui du Radar.
        $journal = IntegrationWebhookLog::query()->latest('id')->first();
        $this->assertSame('messages', $journal?->event_type);
        $this->assertSame('wamid.E1', $journal?->external_id);
        $this->assertSame(1, (int) $journal?->matched_count);
    }

    /** Un accord du pont rattaché à un compte (l'invitation acceptée, TCK-2981) rend le numéro connu. */
    public function test_un_accord_du_pont_rattache_rend_le_numero_connu(): void
    {
        WhatsappContact::query()->create(['phone' => self::TEL_INCONNU, 'user_id' => $this->bailleur->id, 'opt_in_status' => 'opted_in', 'opt_in_source' => 'pont_invitation']);
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.E14', self::TEL_INCONNU, 'Par mon autre téléphone.')])->assertOk();

        $this->assertSame($this->fil->id, (int) $this->dernierMessage()?->conversation_id);
    }

    /** Un `user_id` posé par un autre chemin que le pont n'est jamais prouvé : ni tel quel, ni après STOP puis START. */
    public function test_un_compte_non_prouve_par_le_pont_reste_inconnu_meme_apres_start(): void
    {
        WhatsappContact::query()->create(['phone' => self::TEL_INCONNU, 'user_id' => $this->bailleur->id, 'opt_in_status' => 'opted_in', 'opt_in_source' => 'search_alert']);
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.E15', self::TEL_INCONNU, 'STOP')])->assertOk();
        $this->recevoir([$this->texte('wamid.E16', self::TEL_INCONNU, 'START')])->assertOk();
        $this->recevoir([$this->texte('wamid.E17', self::TEL_INCONNU, 'Bonjour')])->assertOk();

        $this->assertNull($this->dernierMessage());
        $this->assertSame(1, PropertyContactLead::query()->where('phone', self::TEL_INCONNU)->count());
        $this->assertNull(WhatsappContact::query()->where('phone', self::TEL_INCONNU)->value('user_id'));
    }

    /** `channel` n'est jamais lu d'une requête : un envoi qui le pose écrit `app`. */
    public function test_le_canal_ne_se_pose_pas_par_la_route(): void
    {
        Sanctum::actingAs($this->auteur);
        $id = $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => 'Bonjour', 'channel' => 'whatsapp'])
            ->assertCreated()->json('data.id');

        $this->assertSame('app', Message::query()->findOrFail($id)->channel);
        $this->assertArrayNotHasKey('channel', Message::query()->findOrFail($id)->toArray());
    }

    /** La route générique du canal WhatsApp fait la même chose que l'alias, sous la même garde. */
    public function test_la_route_generique_du_canal_whatsapp(): void
    {
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.G0', self::TEL_BAILLEUR, 'Par la route générique.')], secret: 'autre', generique: true)->assertForbidden();
        $this->recevoir([$this->texte('wamid.G1', self::TEL_BAILLEUR, 'Par la route générique.')], generique: true)->assertOk();

        $this->assertSame('Par la route générique.', $this->dernierMessage()?->content);
        $this->assertSame('whatsapp', $this->dernierMessage()?->channel);
        $this->get('/api/webhooks/messagerie/whatsapp/'.self::JETON.'?hub.mode=subscribe&hub.verify_token=x&hub.challenge=42')->assertForbidden();
        config()->set('whatsapp.webhook_verify_token', 'x');
        $this->assertSame('42', $this->get('/api/webhooks/messagerie/whatsapp/'.self::JETON.'?hub.mode=subscribe&hub.verify_token=x&hub.challenge=42')->assertOk()->getContent());
    }

    public function test_le_dernier_relais_recent_designe_le_fil(): void
    {
        $autre = $this->groupe([$this->auteur, $this->bailleur], ['property_id' => $this->bien->id]);
        $this->relaisSortant($this->fil, $this->bailleur, 'wamid.SORTANT-2', quand: now()->subDays(2)->toDateTimeString());
        $this->ecrireUnMessage('Plus récent', fil: $autre);

        $this->recevoir([$this->texte('wamid.E2', self::TEL_BAILLEUR, 'Bien reçu.')])->assertOk();

        $this->assertSame($this->fil->id, (int) $this->dernierMessage()?->conversation_id);
    }

    public function test_un_relais_de_plus_de_sept_jours_cede_au_fil_le_plus_recent(): void
    {
        $autre = $this->groupe([$this->auteur, $this->bailleur], ['property_id' => $this->bien->id]);
        $this->relaisSortant($this->fil, $this->bailleur, 'wamid.SORTANT-3', quand: now()->subDays(8)->toDateTimeString());
        $this->ecrireUnMessage('Plus récent', fil: $autre);

        $this->recevoir([$this->texte('wamid.E3', self::TEL_BAILLEUR, 'Bien reçu.')])->assertOk();

        $this->assertSame($autre->id, (int) $this->dernierMessage()?->conversation_id);
    }

    public function test_un_fil_ferme_a_l_ecriture_est_saute(): void
    {
        // TCK-2985 (cause de l'intermittence) — seule une SALLE (`type = lease`) se ferme avec son bail
        // (`SallesDuFil::enLectureSeule`) : un groupe qui porte `subject_type = lease` reste ouvert, et le test ne
        // passait que quand les deux messages tombaient dans la même seconde (`last_message_at` à la seconde, égalité
        // tranchée par l'identifiant). Le fil plus récent est donc la salle du bail, et il l'est d'une minute.
        $salle = app(SallesDuFil::class)->ouvrir($this->bail);
        $this->assertNotNull($salle);
        $this->assertTrue($salle->participants()->where('users.id', $this->bailleur->id)->wherePivotNull('left_at')->exists());
        $autre = $this->groupe([$this->auteur, $this->bailleur], ['property_id' => $this->bien->id]);
        $this->ecrireUnMessage('Ancien', fil: $autre);
        $this->travel(1)->minutes();
        $this->ecrireUnMessage('Plus récent', fil: $salle);
        // TCK-2960 — la salle d'un bail fini se lit, ne s'écrit plus.
        $this->bail->forceFill(['status' => LeaseStatus::Terminated])->save();

        $this->recevoir([$this->texte('wamid.E4', self::TEL_BAILLEUR, 'Toujours là ?')])->assertOk();

        $this->assertSame($autre->id, (int) $this->dernierMessage()?->conversation_id);
    }

    public function test_le_second_numero_verifie_est_connu(): void
    {
        $this->bailleur->forceFill(['secondary_phone' => '+221775554433', 'secondary_phone_verified_at' => now()])->save();
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.E5', '+221775554433', 'Depuis mon autre numéro.')])->assertOk();

        $this->assertSame($this->fil->id, (int) $this->dernierMessage()?->conversation_id);
    }

    public function test_un_numero_non_verifie_n_est_pas_connu(): void
    {
        $this->bailleur->forceFill(['phone_verified_at' => null])->save();
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.E6', self::TEL_BAILLEUR, 'Bonjour')])->assertOk();

        $this->assertNull($this->dernierMessage());
        $this->assertSame(1, PropertyContactLead::query()->where('channel', ContactLeadChannel::WhatsappInbound->value)->count());
    }

    /** Numéro de la plateforme, deux agences en jeu : le serveur ne choisit pas — un prospect au nom du compte, sans agence. */
    public function test_numero_global_a_deux_agences_donne_un_prospect(): void
    {
        $this->numeroDEntreprise('PNID-PLATEFORME', null);
        $agenceB = Agency::factory()->create();
        $agentB = $this->agentDeLAgence($agenceB);
        $bienB = Property::factory()->create(['agency_id' => $agenceB->id]);
        $filB = $this->groupe([$agentB, $this->bailleur], ['property_id' => $bienB->id]);
        $this->ecrireUnMessage('A', fil: $this->fil);
        $this->ecrireUnMessage('B', auteur: $agentB, fil: $filB);

        $this->recevoir([$this->texte('wamid.E7', self::TEL_BAILLEUR, 'Bonjour')], 'PNID-PLATEFORME')->assertOk();

        $this->assertNull($this->dernierMessage());
        $prospect = PropertyContactLead::query()->sole();
        $this->assertNull($prospect->agency_id);
        $this->assertSame(self::TEL_BAILLEUR, $prospect->phone);
        $this->assertSame($this->bailleur->nameWithoutContact(), $prospect->name);
    }

    public function test_numero_global_a_une_seule_agence_va_dans_son_fil(): void
    {
        $this->numeroDEntreprise('PNID-PLATEFORME', null);
        $this->ecrireUnMessage('A', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.E8', self::TEL_BAILLEUR, 'Bonjour')], 'PNID-PLATEFORME')->assertOk();

        $this->assertSame($this->fil->id, (int) $this->dernierMessage()?->conversation_id);
    }

    /** AC5 — un autre `phone_number_id` (celui du Radar, ou une intégration inactive) n'écrit rien. */
    public function test_ac5_un_autre_numero_d_entreprise_est_ignore(): void
    {
        config()->set('radar_whatsapp.phone_number_id', 'PNID-RADAR');
        $this->numeroDEntreprise('PNID-INACTIF', Agency::factory()->create()->id)->forceFill(['is_active' => false])->save();
        $this->ecrireUnMessage('A', fil: $this->fil);

        $this->recevoir([$this->texte('wamid.E9', self::TEL_BAILLEUR, 'Bonjour')], 'PNID-RADAR')->assertOk();
        $this->recevoir([$this->texte('wamid.E10', self::TEL_INCONNU, 'Bonjour')], 'PNID-INACTIF')->assertOk();

        $this->assertNull($this->dernierMessage());
        $this->assertSame(0, MessageRelay::query()->count());
        $this->assertSame(0, PropertyContactLead::query()->count());
    }

    /** AC6 — non signé, mal signé, secret absent : 403, rien d'écrit. */
    public function test_ac6_la_signature_garde_le_pont(): void
    {
        $this->recevoir([$this->texte('wamid.E11', self::TEL_INCONNU, 'Bonjour')], secret: null)->assertForbidden();
        $this->recevoir([$this->texte('wamid.E12', self::TEL_INCONNU, 'Bonjour')], secret: 'autre-secret')->assertForbidden();
        config()->set('whatsapp.webhook_app_secret', '');
        $this->recevoir([$this->texte('wamid.E13', self::TEL_INCONNU, 'Bonjour')])->assertForbidden();

        $this->assertSame(0, MessageRelay::query()->count());
        $this->assertSame(0, PropertyContactLead::query()->count());
        $this->assertSame(0, WhatsappContact::query()->count());
    }

    public function test_un_media_ecrit_l_avis_d_equipe_sans_rien_telecharger(): void
    {
        Http::fake();
        $this->ecrireUnMessage('A', fil: $this->fil);

        $this->recevoir([[
            'from' => ltrim(self::TEL_BAILLEUR, '+'), 'id' => 'wamid.M1', 'timestamp' => '1763500000',
            'type' => 'image', 'image' => ['id' => 'MEDIA-1', 'mime_type' => 'image/jpeg'],
        ]])->assertOk();

        Http::assertNothingSent();
        $avis = Message::query()->where('conversation_id', $this->fil->id)->where('content', 'pont.media_non_relaye')->sole();
        $this->assertSame('team', $avis->visibility->value);
        $this->assertSame('image', $avis->metadata['media']);
        $this->assertSame($this->bailleur->id, $avis->metadata['user_id']);
    }
}
