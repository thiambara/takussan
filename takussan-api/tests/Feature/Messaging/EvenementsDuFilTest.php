<?php

namespace Tests\Feature\Messaging;

use App\Jobs\NotifyNewMessageJob;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\CodesDuFil;
use App\Services\Messaging\EvenementsDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2958 (ADR-0128 § 3, AC4) — `EvenementsDuFil`, le seul écrivain d'une carte ou d'un événement.
 *
 * Il refuse, par exception de logique : un objet hors registre, un code hors catalogue, un code d'une
 * autre nature, un type d'objet qui ne va pas avec le code, une clé de `data` en trop (`amount`
 * compris), une valeur qui n'est pas simple. Un événement est sans auteur, `content` = son code, et ne
 * met aucune notification de nouveau message en file.
 */
class EvenementsDuFilTest extends TestCase
{
    use RefreshDatabase;

    private function fil(): Conversation
    {
        $auteur = User::factory()->create();
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $auteur->id,
        ]);
        $fil->participants()->attach($auteur->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);

        return $fil;
    }

    private function evenements(): EvenementsDuFil
    {
        return app(EvenementsDuFil::class);
    }

    public function test_un_evenement_s_ecrit_sans_auteur_avec_son_code_pour_contenu_et_sans_notification(): void
    {
        Queue::fake();
        $fil = $this->fil();
        $mr = MaintenanceRequest::factory()->create();

        $message = $this->evenements()->ecrire($fil, $mr, 'maintenance.assigned', [
            'status' => 'open', 'from' => null, 'provider_name' => 'Awa Ndiaye', 'actor_name' => 'Moussa',
        ]);

        $message->refresh();
        $this->assertSame(MessageType::Event, $message->type);
        $this->assertNull($message->sender_id);
        $this->assertSame('maintenance.assigned', $message->content);
        $this->assertEquals(['type' => 'maintenance_request', 'id' => $mr->id], $message->metadata['object']);
        $this->assertSame('maintenance.assigned', $message->metadata['code']);
        $this->assertSame('Awa Ndiaye', $message->metadata['data']['provider_name']);
        // L'aperçu commun de la liste est le code, jamais un texte.
        $this->assertSame('maintenance.assigned', $fil->fresh()->last_message_preview);
        $this->assertSame($message->id, $fil->fresh()->last_message_id);
        Queue::assertNotPushed(NotifyNewMessageJob::class);
    }

    public function test_la_forme_du_metadata_est_fermee_pour_tout_le_catalogue(): void
    {
        $fil = $this->fil();
        $mr = MaintenanceRequest::factory()->create();

        foreach (CodesDuFil::catalogue() as $code => $entree) {
            if ($entree['nature'] !== CodesDuFil::NATURE_EVENEMENT || $entree['objet'] !== 'maintenance_request') {
                continue;
            }
            $data = array_fill_keys($entree['data'], 'x');
            $metadata = $this->evenements()->ecrire($fil, $mr, $code, $data)->metadata;

            // TCK-2959 — `action_for` est la quatrième clé d'un événement, et la seule ajoutée (`[]` sans geste attendu).
            $this->assertSame(['object', 'code', 'data', 'action_for'], array_keys($metadata), $code);
            $this->assertSame([], $metadata['action_for'], $code);
            $this->assertSame(['type', 'id'], array_keys($metadata['object']), $code);
            $this->assertSame($data, $metadata['data'], $code);
        }
    }

    /** @return array<string, array{string, array<string, mixed>, ?string}> */
    public static function refus(): array
    {
        return [
            'code hors catalogue' => ['maintenance.inconnu', [], null],
            'code vide' => ['', [], null],
            'clé de data en trop' => ['maintenance.assigned', ['comment' => 'x'], null],
            // AC4 — un montant n'entre jamais dans `data`, même sur un code d'intervention.
            'montant dans data' => ['maintenance.quote_submitted', ['amount' => 25000], null],
            'téléphone dans data' => ['maintenance.assigned', ['provider_phone' => '+221770000000'], null],
            'valeur non simple' => ['maintenance.assigned', ['status' => ['open']], null],
            'type d objet qui ne va pas avec le code' => ['maintenance.assigned', [], 'lease'],
        ];
    }

    /** @param  array<string, mixed>  $data */
    #[DataProvider('refus')]
    public function test_un_evenement_hors_regle_est_refuse(string $code, array $data, ?string $objet): void
    {
        $fil = $this->fil();
        $cible = $objet === 'lease' ? Lease::factory()->create() : MaintenanceRequest::factory()->create();

        try {
            $this->evenements()->ecrire($fil, $cible, $code, $data);
            $this->fail('écrit malgré la règle');
        } catch (LogicException) {
            $this->assertSame(0, Message::query()->count());
        }
    }

    public function test_un_objet_hors_registre_est_refuse(): void
    {
        $fil = $this->fil();

        $this->expectException(LogicException::class);
        $this->evenements()->ecrire($fil, User::factory()->create(), 'maintenance.assigned');
    }

    public function test_une_carte_ne_s_ecrit_pas_avec_un_code_d_evenement(): void
    {
        $fil = $this->fil();
        $auteur = $fil->participants()->first();

        try {
            $this->evenements()->carte($fil, $auteur, MaintenanceRequest::factory()->create(), 'maintenance.assigned');
            $this->fail('une carte a été écrite avec un code d\'événement');
        } catch (LogicException) {
            $this->assertSame(0, Message::query()->count());
        }
    }

    /**
     * Le contrat (« Contraintes strictes ») : la route d'envoi d'un participant n'admet ni `card` ni
     * `event` (une carte se pose par la route de TCK-2964). Témoin : un texte passe.
     */
    public function test_la_route_d_envoi_refuse_une_carte_et_un_evenement(): void
    {
        $fil = $this->fil();
        Sanctum::actingAs($fil->participants()->first());

        foreach ([MessageType::Card, MessageType::Event] as $type) {
            $this->postJson("/api/conversations/{$fil->id}/messages", [
                'content' => 'maintenance.assigned',
                'type' => $type->value,
                'metadata' => ['object' => ['type' => 'lease', 'id' => 1], 'code' => 'maintenance.assigned', 'data' => []],
            ])->assertUnprocessable()->assertJsonValidationErrors('type');
        }
        $this->assertSame(0, Message::query()->count());

        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Bonjour', 'type' => MessageType::Text->value])->assertCreated();
    }
}
