<?php

namespace Tests\Feature\Messaging;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Observers\FermeLeFilDeSonObjet;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2957 (AC3, AC4, AC6 ; ADR-0128 § 1) — il n'y a pas de clé étrangère sur le lien générique :
 * c'est un observateur qui ferme le fil d'un objet supprimé (`closed`), et le rouvre à sa
 * restauration s'il l'avait fermé.
 *
 * Le jeu de données est TIRÉ du registre (`SujetsDuFil::typesSujets()`) : un type ajouté au registre
 * est éprouvé sans une ligne de plus, et un type dont l'observateur ne serait pas branché rougit sa
 * ligne seule.
 *
 * Les fils éprouvés ne portent QUE leur sujet (ni `maintenance_request_id`, ni `lease_id`, ni
 * `property_id`) : l'écriture n'y dépend que de la participation, et `closed` est donc la seule
 * raison pour laquelle `allowsWriting` bascule. Un fil d'intervention dont la demande est supprimée
 * en douceur est déjà illisible par `maintenanceAllows` (relevé du ticket) : il ne prouverait rien.
 */
class FilFermeALaSuppressionTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function typesSujets(): array
    {
        $jeu = [];
        foreach (SujetsDuFil::typesSujets() as $type) {
            $jeu[$type] = [$type];
        }

        return $jeu;
    }

    private function objet(string $type): Model
    {
        return SujetsDuFil::modele($type)::factory()->create();
    }

    private function filDe(Model $objet, User $membre): Conversation
    {
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $membre->id,
            'subject_type' => SujetsDuFil::typeDe($objet),
            'subject_id' => $objet->getKey(),
        ]);
        $fil->participants()->attach($membre->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);

        return $fil;
    }

    private function ecrit(User $user, Conversation $fil): bool
    {
        return app(ConversationAccess::class)->allowsWriting($user, $fil->fresh());
    }

    #[DataProvider('typesSujets')]
    public function test_suppression_douce_ferme_le_fil_de_l_objet_seul_et_la_restauration_le_rouvre(string $type): void
    {
        $objet = $this->objet($type);
        $voisin = $this->objet($type);
        $membre = User::factory()->create();
        $fil = $this->filDe($objet, $membre);
        $filVoisin = $this->filDe($voisin, $membre);
        $this->assertTrue($this->ecrit($membre, $fil), 'Le membre écrivait avant la suppression.');

        $objet->delete();

        $this->assertSame(ConversationStatus::Closed, $fil->fresh()->status);
        $this->assertFalse($this->ecrit($membre, $fil));
        // Le fil d'un autre objet du même type n'est pas touché.
        $this->assertSame(ConversationStatus::Active, $filVoisin->fresh()->status);
        $this->assertTrue($this->ecrit($membre, $filVoisin));

        $objet->restore();

        $this->assertSame(ConversationStatus::Active, $fil->fresh()->status);
        $this->assertArrayNotHasKey(FermeLeFilDeSonObjet::MARQUE, $fil->fresh()->metadata ?? []);
        $this->assertTrue($this->ecrit($membre, $fil));
    }

    #[DataProvider('typesSujets')]
    public function test_suppression_definitive_ferme_le_fil(string $type): void
    {
        $objet = $this->objet($type);
        $membre = User::factory()->create();
        $fil = $this->filDe($objet, $membre);

        $objet->forceDelete();

        $this->assertSame(ConversationStatus::Closed, $fil->fresh()->status);
        $this->assertFalse($this->ecrit($membre, $fil));
    }

    /**
     * AC6 — `restored` ne rouvre que ce que la suppression a fermé : un fil du MÊME objet, déjà
     * `closed` avant la suppression et sans la marque, reste `closed`.
     */
    #[DataProvider('typesSujets')]
    public function test_la_restauration_ne_rouvre_que_ce_que_la_suppression_a_ferme(string $type): void
    {
        $objet = $this->objet($type);
        $membre = User::factory()->create();
        $ferme = $this->filDe($objet, $membre);
        $ferme->update(['status' => ConversationStatus::Closed->value]);
        $ouvert = $this->filDe($objet, $membre);

        $objet->delete();
        $this->assertArrayNotHasKey(FermeLeFilDeSonObjet::MARQUE, $ferme->fresh()->metadata ?? []);
        $this->assertSame(ConversationStatus::Closed, $ouvert->fresh()->status);

        $objet->restore();

        $this->assertSame(ConversationStatus::Closed, $ferme->fresh()->status);
        $this->assertSame(ConversationStatus::Active, $ouvert->fresh()->status);
    }

    /**
     * Le relevé du ticket, sur le vrai fil d'une intervention : la suppression DÉFINITIVE remet
     * `maintenance_request_id` à nul (`nullOnDelete`), le fil redevient lisible par ses participants,
     * et `closed` y ferme l'écriture.
     */
    public function test_le_fil_d_une_intervention_supprimee_definitivement_se_lit_sans_s_ecrire(): void
    {
        $mr = MaintenanceRequest::factory()->create();
        $membre = User::factory()->create();
        $fil = $this->filDe($mr, $membre);
        $fil->update(['maintenance_request_id' => $mr->id]);

        $mr->forceDelete();

        $fil = $fil->fresh();
        $this->assertNull($fil->maintenance_request_id);
        $this->assertSame(ConversationStatus::Closed, $fil->status);
        $this->assertTrue(app(ConversationAccess::class)->allows($membre, $fil));
        $this->assertFalse(app(ConversationAccess::class)->allowsWriting($membre, $fil));
    }
}
