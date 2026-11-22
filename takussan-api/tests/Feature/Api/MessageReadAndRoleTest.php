<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\MessageType;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2858 — un message dit s'il a été LU, et dans un groupe QUI parle :
 *  - fil `direct` : `read_by_recipient` sur les messages de l'appelant — vrai quand le `last_read_at`
 *    de l'autre participant n'est pas antérieur au `created_at` du message ; `null` sur les autres ;
 *  - fil `group` : `read_count` sur les messages de l'appelant, et `sender.role_label_code` (un code :
 *    `tenant`, `owner`, `agent`, `agency_admin`, `service_provider`, `customer`), dérivé de la relation
 *    du participant au fil, jugée sur ce que l'APPELANT peut lire (`RelationsAuFil`) ;
 *  - la liste des fils dit qui a écrit le dernier message (`last_message.sender_id`).
 */
class MessageReadAndRoleTest extends TestCase
{
    use CreatesAgencyMembers;
    use MaintenanceActors;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-11-15 10:00:00', 'UTC'));
        $this->agency = Agency::factory()->create();
        $this->agent = $this->agentOf($this->agency);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param  list<User>  $membres */
    private function fil(ConversationType $type, array $membres, array $attributs = []): Conversation
    {
        $fil = Conversation::factory()->create([
            'type' => $type,
            'subject' => $type === ConversationType::Group ? 'Fuite sous évier' : null,
            'created_by' => $membres[0]->id,
            ...$attributs,
        ]);
        foreach ($membres as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now()->subDay()]);
        }

        return $fil;
    }

    private function message(Conversation $fil, User $auteur, string $quand): Message
    {
        $message = Message::query()->create([
            'conversation_id' => $fil->id,
            'sender_id' => $auteur->id,
            'type' => MessageType::Text,
            'content' => 'Bonjour',
        ]);
        $message->forceFill(['created_at' => Carbon::parse($quand, 'UTC')])->save();

        return $message;
    }

    /** @return array<int, array<string, mixed>> */
    private function messages(Conversation $fil, User $lecteur, array $query = []): array
    {
        Sanctum::actingAs($lecteur);
        $lignes = $this->getJson("/api/conversations/{$fil->id}/messages?".http_build_query($query))->assertOk()->json('data');

        return collect($lignes)->keyBy('id')->all();
    }

    /** AC3 — l'agent envoie, Malick ouvre le fil : `read_by_recipient` passe de faux à vrai. */
    public function test_la_coche_suit_la_lecture_du_destinataire(): void
    {
        $malick = User::factory()->create();
        $fil = $this->fil(ConversationType::Direct, [$this->agent, $malick]);

        // Malick a lu le fil AVANT ce message : le message n'est pas lu.
        Carbon::setTestNow('2026-11-15 09:00:00');
        Sanctum::actingAs($malick);
        $this->putJson("/api/conversations/{$fil->id}/read")->assertOk();

        Carbon::setTestNow('2026-11-15 10:00:00');
        $envoye = $this->message($fil, $this->agent, '2026-11-15 10:00:00');
        $recu = $this->message($fil, $malick, '2026-11-15 08:30:00');

        Carbon::setTestNow('2026-11-15 10:05:00');
        $avant = $this->messages($fil, $this->agent);
        $this->assertFalse($avant[$envoye->id]['read_by_recipient']);
        // Un message reçu ne porte pas la coche.
        $this->assertNull($avant[$recu->id]['read_by_recipient']);

        Carbon::setTestNow('2026-11-15 11:00:00');
        Sanctum::actingAs($malick);
        $this->putJson("/api/conversations/{$fil->id}/read")->assertOk();

        Carbon::setTestNow('2026-11-15 11:30:00');
        $apres = $this->messages($fil, $this->agent);
        $this->assertTrue($apres[$envoye->id]['read_by_recipient']);

        // Malick, lui, ne lit pas de coche sur le message de l'agent.
        $this->assertNull($this->messages($fil, $malick)[$envoye->id]['read_by_recipient']);
    }

    /** Lu dans la même seconde que l'envoi : lu (la règle des non-lus de la liste, `<` strict). */
    public function test_lu_dans_la_meme_seconde(): void
    {
        $malick = User::factory()->create();
        $fil = $this->fil(ConversationType::Direct, [$this->agent, $malick]);
        $envoye = $this->message($fil, $this->agent, '2026-11-15 10:00:00');
        $fil->participants()->updateExistingPivot($malick->id, ['last_read_at' => Carbon::parse('2026-11-15 10:00:00', 'UTC')]);

        Carbon::setTestNow('2026-11-15 12:00:00');
        $this->assertTrue($this->messages($fil, $this->agent)[$envoye->id]['read_by_recipient']);
    }

    /** Le message tout juste envoyé (`POST …/messages`) n'est pas encore lu ; `after_id` porte la coche aussi. */
    public function test_envoi_et_releve_par_after_id(): void
    {
        $malick = User::factory()->create();
        $fil = $this->fil(ConversationType::Direct, [$this->agent, $malick]);
        $ancien = $this->message($fil, $malick, '2026-11-15 08:00:00');

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Bonjour M. Seck'])
            ->assertCreated()
            ->assertJsonPath('data.read_by_recipient', false);

        $fil->participants()->updateExistingPivot($malick->id, ['last_read_at' => Carbon::parse('2026-11-15 10:30:00', 'UTC')]);
        Carbon::setTestNow('2026-11-15 11:00:00');
        $releve = $this->messages($fil, $this->agent, ['after_id' => $ancien->id]);
        $this->assertCount(1, $releve);
        $this->assertTrue(array_values($releve)[0]['read_by_recipient']);
    }

    /** @return array{0: Conversation, 1: User, 2: User, 3: User} */
    private function groupeDIntervention(): array
    {
        $bailleur = $this->landlordOf($this->agency);
        $bien = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $fatou = User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Wade']);
        $bail = Lease::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $fatou->id])->id,
            'landlord_id' => $bailleur->id,
            'status' => LeaseStatus::Active,
        ]);
        $astou = $this->providerFor($this->agency);
        $intervention = MaintenanceRequest::factory()->create([
            'property_id' => $bien->id,
            'lease_id' => $bail->id,
            'requester_id' => $fatou->id,
            'assigned_to' => $astou->id,
            'category' => MaintenanceCategory::Plumbing,
            'status' => MaintenanceStatus::Assigned,
        ]);

        $fil = $this->fil(ConversationType::Group, [$this->agent, $fatou, $astou, $bailleur], ['maintenance_request_id' => $intervention->id]);

        return [$fil, $fatou, $astou, $bailleur];
    }

    /** AC4 — dans le groupe « Fuite sous évier », le message de Fatou Wade dit `tenant`. */
    public function test_le_role_de_l_auteur_dans_un_groupe(): void
    {
        [$fil, $fatou, $astou, $bailleur] = $this->groupeDIntervention();
        $deFatou = $this->message($fil, $fatou, '2026-11-15 08:12:00');
        $dAstou = $this->message($fil, $astou, '2026-11-15 08:47:00');
        $duBailleur = $this->message($fil, $bailleur, '2026-11-15 08:50:00');
        $deLAgent = $this->message($fil, $this->agent, '2026-11-15 09:20:00');

        $lignes = $this->messages($fil, $this->agent);

        $this->assertSame('tenant', $lignes[$deFatou->id]['sender']['role_label_code']);
        $this->assertSame('service_provider', $lignes[$dAstou->id]['sender']['role_label_code']);
        $this->assertSame('owner', $lignes[$duBailleur->id]['sender']['role_label_code']);
        $this->assertSame('agent', $lignes[$deLAgent->id]['sender']['role_label_code']);
        // Pas de coche « destinataire » dans un groupe : un compte de lecteurs.
        $this->assertNull($lignes[$deLAgent->id]['read_by_recipient']);
    }

    /** L'administratrice de l'agence dit `agency_admin` ; un prospect qui a une fiche dans l'agence, `customer`. */
    public function test_administratrice_et_client_dans_un_groupe(): void
    {
        [$fil] = $this->groupeDIntervention();
        $admin = $this->agencyAdmin($this->agency);
        $prospect = User::factory()->create();
        Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $prospect->id]);
        $inconnu = User::factory()->create();
        foreach ([$admin, $prospect, $inconnu] as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now()->subDay()]);
        }
        $deLAdmin = $this->message($fil, $admin, '2026-11-15 09:00:00');
        $duProspect = $this->message($fil, $prospect, '2026-11-15 09:05:00');
        $deLInconnu = $this->message($fil, $inconnu, '2026-11-15 09:06:00');

        $lignes = $this->messages($fil, $this->agent);

        $this->assertSame('agency_admin', $lignes[$deLAdmin->id]['sender']['role_label_code']);
        $this->assertSame('customer', $lignes[$duProspect->id]['sender']['role_label_code']);
        // Aucune relation et aucune fiche : aucun rôle deviné.
        $this->assertNull($lignes[$deLInconnu->id]['sender']['role_label_code']);
    }

    /** Le prestataire ne lit pas le bail : il n'apprend pas qui est la locataire par le rôle de l'auteur. */
    public function test_le_role_suit_ce_que_le_lecteur_peut_lire(): void
    {
        [$fil, $fatou, $astou] = $this->groupeDIntervention();
        $deFatou = $this->message($fil, $fatou, '2026-11-15 08:12:00');

        $this->assertNull($this->messages($fil, $astou)[$deFatou->id]['sender']['role_label_code']);
    }

    /** Un fil direct ne porte pas de rôle. */
    public function test_pas_de_role_dans_un_fil_direct(): void
    {
        $malick = User::factory()->create();
        $fil = $this->fil(ConversationType::Direct, [$this->agent, $malick]);
        $recu = $this->message($fil, $malick, '2026-11-15 08:00:00');

        $this->assertNull($this->messages($fil, $this->agent)[$recu->id]['sender']['role_label_code']);
    }

    /** Groupe : `read_count` compte les AUTRES participants actuels qui ont lu le message de l'appelant. */
    public function test_read_count_dans_un_groupe(): void
    {
        [$fil, $fatou, $astou, $bailleur] = $this->groupeDIntervention();
        $deLAgent = $this->message($fil, $this->agent, '2026-11-15 09:20:00');
        $fil->participants()->updateExistingPivot($fatou->id, ['last_read_at' => Carbon::parse('2026-11-15 09:30:00', 'UTC')]);
        $fil->participants()->updateExistingPivot($astou->id, ['last_read_at' => Carbon::parse('2026-11-15 09:00:00', 'UTC')]);
        // Le bailleur a lu, puis quitté le groupe : il ne compte plus.
        $fil->participants()->updateExistingPivot($bailleur->id, ['last_read_at' => Carbon::parse('2026-11-15 09:40:00', 'UTC'), 'left_at' => Carbon::parse('2026-11-15 09:45:00', 'UTC')]);

        $lignes = $this->messages($fil, $this->agent);
        $this->assertSame(1, $lignes[$deLAgent->id]['read_count']);
        $deFatou = $this->message($fil, $fatou, '2026-11-15 09:50:00');
        $this->assertNull($this->messages($fil, $this->agent)[$deFatou->id]['read_count']);
    }

    /** Pas de N+1 : le même nombre de requêtes pour 10 et pour 50 messages, en direct comme en groupe. */
    public function test_requetes_constantes(): void
    {
        $malick = User::factory()->create();
        $direct = $this->fil(ConversationType::Direct, [$this->agent, $malick]);
        [$groupe, $fatou, $astou] = $this->groupeDIntervention();

        foreach ([$direct, $groupe] as $fil) {
            $auteurs = $fil->is($direct) ? [$this->agent, $malick] : [$this->agent, $fatou, $astou];
            $compte = [];
            foreach ([10, 50] as $n) {
                $fil->messages()->delete();
                for ($i = 0; $i < $n; $i++) {
                    $this->message($fil, $auteurs[$i % count($auteurs)], '2026-11-15 08:00:00');
                }
                Sanctum::actingAs($this->agent);
                DB::flushQueryLog();
                DB::enableQueryLog();
                $this->getJson("/api/conversations/{$fil->id}/messages?per_page=50")->assertOk();
                $compte[$n] = count(DB::getQueryLog());
                DB::disableQueryLog();
            }
            $this->assertSame($compte[10], $compte[50], "Fil {$fil->type->value} : requêtes ".json_encode($compte));
        }
    }

    /** Ajout du 2026-11-15 — la liste des fils dit qui a écrit le dernier message (accueil du client, TCK-2853). */
    public function test_la_liste_dit_l_auteur_du_dernier_message(): void
    {
        $malick = User::factory()->create();
        $fil = $this->fil(ConversationType::Direct, [$this->agent, $malick]);
        $dernier = $this->message($fil, $this->agent, '2026-11-15 09:00:00');
        $fil->forceFill(['last_message_id' => $dernier->id, 'last_message_at' => $dernier->created_at])->save();

        $fil->participants()->updateExistingPivot($malick->id, ['last_read_at' => Carbon::parse('2026-11-15 08:00:00', 'UTC')]);

        // La requête exacte de l'accueil (`useReponseRecue` → `conversationListParams(1, 1, {nonLus, type: 'direct'})`).
        Sanctum::actingAs($malick);
        $this->getJson('/api/conversations?'.http_build_query([
            'filter' => ['unread' => '1', 'type' => 'direct'],
            'fields' => [
                'conversations' => 'id,subject,property_id,type,status,last_message_at,last_message_preview,updated_at',
                'properties' => 'id,title,slug,main_photo_url',
            ],
            'include' => 'property,participants,last_message',
            'sort' => '-last_message_at',
            'page' => 1,
            'per_page' => 1,
        ]))->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $fil->id)
            ->assertJsonPath('data.0.last_message.id', $dernier->id)
            ->assertJsonPath('data.0.last_message.sender_id', $this->agent->id);
    }
}
