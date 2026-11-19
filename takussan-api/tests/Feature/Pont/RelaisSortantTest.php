<?php

namespace Tests\Feature\Pont;

use App\Models\MessageRelay;
use App\Models\NotificationDeliveryAttempt;
use App\Notifications\CodedNotification;
use App\Services\Pont\EtatDAccord;
use App\Services\Pont\ResultatDEnvoi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\Pont\FauxCanal;
use Tests\Support\SceneDuPont;

/**
 * TCK-2981 (ADR-0132 §§ 0, 3, 4) — le pont sortant, sur le FAUX pilote placé en tête de l'ordre de repli (aucun
 * canal nommé en dur), puis le SMS : l'invitation, l'accord, le relais par destinataire, la non-fuite.
 */
class RelaisSortantTest extends ApiTestCase
{
    use RefreshDatabase;
    use SceneDuPont;

    protected function setUp(): void
    {
        parent::setUp();
        FauxCanal::remettreAZero();
        $this->monterLePont();
        config()->set('messagerie.canaux.'.FauxCanal::NOM, ['actif' => true, 'pilote' => FauxCanal::class]);
        config()->set('messagerie.repli', [FauxCanal::NOM, 'sms']);
        FauxCanal::$numeros = ['FAUX-A' => $this->agence->id];
        FauxCanal::$boutons = true;
    }

    private function inviter(?int $userId = null): TestResponse
    {
        Sanctum::actingAs($this->auteur);

        return $this->postJson('/api/conversations/'.$this->fil->id.'/pont/invitations', ['user_id' => $userId ?? $this->bailleur->id]);
    }

    private function accepter(): void
    {
        $invitation = MessageRelay::query()->where('purpose', MessageRelay::PURPOSE_INVITATION)->latest('id')->firstOrFail();
        $this->withHeaders(['X-Faux-Signature' => 'ok'])->postJson('/api/webhooks/messagerie/faux/'.FauxCanal::JETON, [
            'messages' => [['de' => self::TEL_BAILLEUR, 'vers' => 'FAUX-A', 'id' => 'faux-in-'.$invitation->id, 'bouton' => 'pont-invitation:'.$invitation->id]],
        ])->assertOk();
    }

    private function joindre(): void
    {
        $this->inviter()->assertCreated();
        $this->accepter();
        FauxCanal::$envois = [];
    }

    /** @return list<array<string, mixed>> */
    private function relaisDe(int $messageId): array
    {
        return MessageRelay::query()->where('message_id', $messageId)->where('direction', 'out')->orderBy('id')->get()->toArray();
    }

    public function test_l_invitation_part_avec_son_bouton_et_rien_d_autre_avant_l_accord(): void
    {
        $this->inviter()->assertCreated();

        $this->assertCount(1, FauxCanal::$envois);
        $this->assertStringStartsWith('pont-invitation:', (string) FauxCanal::$envois[0]['contexte']['bouton_reponse']);

        // AC2 — avant l'accord : rien ne part, le message attend.
        $m = $this->ecrireUnMessage('Le plombier passe mardi.');
        $this->assertCount(1, FauxCanal::$envois);
        $this->assertSame(MessageRelay::STATUS_EN_ATTENTE_ACCORD, $this->relaisDe($m->id)[0]['status']);
    }

    public function test_a_l_accord_les_messages_en_attente_partent_dans_l_ordre(): void
    {
        $this->inviter()->assertCreated();
        $premier = $this->ecrireUnMessage('Premier.');
        $second = $this->ecrireUnMessage('Second.');
        FauxCanal::$envois = [];

        $this->accepter();

        $this->assertSame(EtatDAccord::Accorde, FauxCanal::$accords[self::TEL_BAILLEUR]);
        $this->assertCount(2, FauxCanal::$envois);
        $this->assertStringEndsWith('Premier.', (string) FauxCanal::$envois[0]['texte']);
        $this->assertStringEndsWith('Second.', (string) FauxCanal::$envois[1]['texte']);
        $this->assertDatabaseHas('messages', ['conversation_id' => $this->fil->id, 'type' => 'system', 'content' => 'pont.accord', 'visibility' => 'team']);
        foreach ([$premier, $second] as $m) {
            $this->assertSame(MessageRelay::STATUS_ENVOYE, collect($this->relaisDe($m->id))->last()['status']);
        }
    }

    public function test_fenetre_ouverte_texte_fermee_gabarit_sans_gabarit_sms(): void
    {
        $this->joindre();
        FauxCanal::$gabarits = true;

        $ouvert = $this->ecrireUnMessage('Ouvert.');
        FauxCanal::$fenetre = false;
        $ferme = $this->ecrireUnMessage('Fermé.');
        FauxCanal::$gabarits = false;
        $sms = $this->ecrireUnMessage('Secours.');

        $this->assertSame(['text', 'template'], array_column(FauxCanal::$envois, 'forme'));
        $this->assertSame('pont_nouveau_message', FauxCanal::$envois[1]['gabarit']);
        $this->assertSame(['faux', 'text'], [$this->relaisDe($ouvert->id)[0]['channel'], $this->relaisDe($ouvert->id)[0]['form']]);
        $this->assertSame('template', $this->relaisDe($ferme->id)[0]['form']);
        $this->assertCount(1, $this->relaisDe($sms->id));
        $this->assertSame(['sms', 'sms', 'envoye'], [$this->relaisDe($sms->id)[0]['channel'], $this->relaisDe($sms->id)[0]['form'], $this->relaisDe($sms->id)[0]['status']]);
    }

    public function test_echec_sur_puis_sms_echec_ambigu_rien_de_plus(): void
    {
        $this->joindre();
        FauxCanal::$resultats['text'] = new ResultatDEnvoi(ResultatDEnvoi::ECHEC, forme: 'text', motif: 'refus');
        $sur = $this->ecrireUnMessage('Sûr.');
        $this->assertSame('sms', $this->relaisDe($sur->id)[0]['channel']);

        FauxCanal::$resultats['text'] = new ResultatDEnvoi(ResultatDEnvoi::ECHEC, forme: 'text', ambigu: true, motif: 'delai');
        $ambigu = $this->ecrireUnMessage('Ambigu.');
        $this->assertCount(1, $this->relaisDe($ambigu->id));
        $this->assertSame(['faux', 'echec'], [$this->relaisDe($ambigu->id)[0]['channel'], $this->relaisDe($ambigu->id)[0]['status']]);
    }

    public function test_apres_stop_rien_ne_part_pas_meme_un_sms(): void
    {
        $this->joindre();
        FauxCanal::$accords[self::TEL_BAILLEUR] = EtatDAccord::Oppose;

        $m = $this->ecrireUnMessage('Après STOP.');

        $this->assertSame([], FauxCanal::$envois);
        $this->assertCount(1, $this->relaisDe($m->id));
        $this->assertSame([null, 'non_envoye'], [$this->relaisDe($m->id)[0]['channel'], $this->relaisDe($m->id)[0]['status']]);
    }

    public function test_note_d_equipe_avis_et_message_d_un_non_personnel_ne_partent_jamais(): void
    {
        $this->joindre();
        $this->locataire->forceFill(['phone' => '+221770000001', 'phone_verified_at' => now()])->save();

        $note = $this->ecrireUneNote('Ne pas relayer.');
        $duLocataire = $this->ecrireUnMessage('Du locataire.', $this->locataire);

        $this->assertSame([], FauxCanal::$envois);
        $this->assertSame([], $this->relaisDe($note->id));
        $this->assertSame([], $this->relaisDe($duLocataire->id));
    }

    public function test_un_joint_ne_recoit_pas_message_received_sur_le_mobile(): void
    {
        $this->joindre();
        $avant = NotificationDeliveryAttempt::query()->count();
        Notification::fake();

        $this->ecrireUnMessage('Bonjour.');

        Notification::assertSentTo($this->bailleur, CodedNotification::class, function ($n, array $canaux) {
            return ! in_array('whatsapp', $canaux, true) && ! in_array('sms', $canaux, true) && $n->mobileBorne === false;
        });
        $this->assertSame($avant, NotificationDeliveryAttempt::query()->count());
    }

    public function test_joindre_dans_un_second_fil_ne_reinvite_pas_mais_une_autre_source_d_accord_si(): void
    {
        $this->joindre();
        $second = $this->groupe([$this->auteur, $this->bailleur], ['subject' => 'Autre fil', 'lease_id' => $this->bail->id, 'property_id' => $this->bien->id]);
        Sanctum::actingAs($this->auteur);
        $this->postJson('/api/conversations/'.$second->id.'/pont/invitations', ['user_id' => $this->bailleur->id])->assertCreated();
        $this->assertSame([], FauxCanal::$envois);
        $this->assertDatabaseHas('message_relays', ['conversation_id' => $second->id, 'purpose' => 'invitation', 'status' => 'accepte']);

        // Un `opted_in` sans compte du pont (alerte de recherche) : l'invitation part.
        $autre = $this->agentDeLAgence($this->agence);
        $this->collegue->forceFill(['phone' => '+221775550000', 'phone_verified_at' => now()])->save();
        FauxCanal::$accords['+221775550000'] = EtatDAccord::Accorde;
        $this->postJson('/api/conversations/'.$this->fil->id.'/pont/invitations', ['user_id' => $this->collegue->id])->assertCreated();
        $this->assertCount(1, FauxCanal::$envois);
        unset($autre);
    }

    public function test_droits_et_codes_de_l_invitation(): void
    {
        // Un client, un agent d'une autre agence : 403.
        Sanctum::actingAs($this->locataire);
        $this->postJson('/api/conversations/'.$this->fil->id.'/pont/invitations', ['user_id' => $this->bailleur->id])->assertForbidden();
        Sanctum::actingAs($this->agentAilleurs);
        $this->postJson('/api/conversations/'.$this->fil->id.'/pont/invitations', ['user_id' => $this->bailleur->id])->assertForbidden();

        $this->inviter($this->agentDeLAgence($this->agence)->id)->assertStatus(422)->assertJsonPath('code', 'pont.not_participant');
        $this->locataire->forceFill(['phone' => null])->save();
        $this->inviter($this->locataire->id)->assertStatus(422)->assertJsonPath('code', 'pont.no_phone');
        FauxCanal::$accords[self::TEL_BAILLEUR] = EtatDAccord::Oppose;
        $this->inviter()->assertStatus(422)->assertJsonPath('code', 'pont.opted_out');
        FauxCanal::$accords = [];
        $this->joindre();
        $this->inviter()->assertStatus(422)->assertJsonPath('code', 'pont.already_joined');
    }

    public function test_relays_et_numero_absents_des_reponses_du_fil(): void
    {
        $this->joindre();
        $this->ecrireUnMessage('Visible.');

        Sanctum::actingAs($this->locataire);
        $corps = $this->getJson('/api/conversations/'.$this->fil->id.'/messages')->assertOk()->getContent();
        $this->assertStringNotContainsString(self::TEL_BAILLEUR, (string) $corps);
        $this->assertStringNotContainsString(ltrim(self::TEL_BAILLEUR, '+'), (string) $corps);
        $this->assertStringNotContainsString('"relays"', (string) $corps);
    }
}
