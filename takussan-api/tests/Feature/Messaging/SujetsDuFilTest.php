<?php

namespace Tests\Feature\Messaging;

use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2957 (ADR-0128 § 1) — le registre FERMÉ des objets auxquels un fil se rattache.
 *
 * Un type se lit dans une table écrite en code, jamais dans une chaîne venue d'ailleurs : ni nom de
 * classe, ni `new $type`, ni morph map. Un type inconnu lève une exception de logique — un `null`
 * se confondrait avec « objet supprimé ».
 */
class SujetsDuFilTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, class-string<Model>}> */
    public static function typesSujetsAttendus(): array
    {
        return [
            'maintenance_request' => ['maintenance_request', MaintenanceRequest::class],
            'lease' => ['lease', Lease::class],
            'booking' => ['booking', Booking::class],
        ];
    }

    public function test_les_trois_types_sujets_sont_au_registre(): void
    {
        $this->assertEqualsCanonicalizing(['maintenance_request', 'lease', 'booking'], SujetsDuFil::typesSujets());
        foreach (SujetsDuFil::typesSujets() as $type) {
            $this->assertContains($type, SujetsDuFil::types());
        }
    }

    /** @param  class-string<Model>  $classe */
    #[DataProvider('typesSujetsAttendus')]
    public function test_chaque_type_resout_son_modele(string $type, string $classe): void
    {
        $this->assertSame($classe, SujetsDuFil::modele($type));

        $objet = $classe::factory()->create();
        $this->assertSame($type, SujetsDuFil::typeDe($objet));

        $resolu = SujetsDuFil::resoudre($type, (int) $objet->getKey());
        $this->assertInstanceOf($classe, $resolu);
        $this->assertSame($objet->getKey(), $resolu->getKey());

        // Supprimé en douceur, l'objet se résout encore : l'appelant juge de `trashed()`.
        $objet->delete();
        $this->assertTrue(SujetsDuFil::resoudre($type, (int) $objet->getKey())?->trashed());

        // Un identifiant sans ligne : `null`, et seulement dans ce cas.
        $this->assertNull(SujetsDuFil::resoudre($type, (int) $objet->getKey() + 1000));
    }

    /** AC5 — un type hors du registre est refusé, même si la ligne visée existe. */
    public function test_un_type_inconnu_est_refuse(): void
    {
        $user = User::factory()->create();

        foreach (['user', 'App\\Models\\User', User::class, 'users', '', 'LEASE'] as $type) {
            try {
                SujetsDuFil::resoudre($type, (int) $user->id);
                $this->fail("Le type « {$type} » a été résolu.");
            } catch (LogicException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->expectException(LogicException::class);
        SujetsDuFil::modele('user');
    }

    /** AC5 — le nom de classe d'un modèle DU registre n'est pas un type : seule la clé l'est. */
    public function test_aucun_nom_de_classe_n_est_accepte_comme_type(): void
    {
        $lease = Lease::factory()->create();

        foreach ([Lease::class, '\\'.Lease::class, MaintenanceRequest::class, Booking::class] as $classe) {
            try {
                SujetsDuFil::resoudre($classe, (int) $lease->id);
                $this->fail("Le nom de classe « {$classe} » a été résolu.");
            } catch (LogicException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    /** Le registre est fermé À L'ÉCRITURE : un fil ne s'enregistre pas avec un sujet hors des types sujets. */
    public function test_un_fil_ne_s_ecrit_pas_avec_un_sujet_hors_registre(): void
    {
        $user = User::factory()->create();

        foreach ([['user', $user->id], [User::class, $user->id], [Lease::class, 1], ['lease', null]] as [$type, $id]) {
            try {
                Conversation::create([
                    'type' => ConversationType::Group->value,
                    'status' => ConversationStatus::Active->value,
                    'subject' => 'Fil',
                    'created_by' => $user->id,
                    'subject_type' => $type,
                    'subject_id' => $id,
                ]);
                $this->fail("Le sujet « {$type} » a été écrit.");
            } catch (LogicException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertSame(0, Conversation::query()->count());
    }

    public function test_un_objet_hors_registre_n_a_pas_de_type(): void
    {
        $this->expectException(LogicException::class);
        SujetsDuFil::typeDe(User::factory()->create());
    }

    public function test_peut_lire_suit_la_politique_de_l_objet(): void
    {
        $lease = Lease::factory()->create();
        $etranger = User::factory()->create();

        $this->assertSame($etranger->can('view', $lease), SujetsDuFil::peutLire($etranger, $lease));
        $this->assertFalse(SujetsDuFil::peutLire($etranger, $lease));

        // Le locataire lit son bail : `peutLire` le suit (sans ce cas, un `peutLire` qui refuse tout passerait).
        $locataire = User::factory()->create();
        $lease->tenant->forceFill(['user_id' => $locataire->id])->save();
        $this->assertTrue(SujetsDuFil::peutLire($locataire, $lease->fresh()));

        $this->expectException(LogicException::class);
        SujetsDuFil::peutLire($etranger, $etranger);
    }
}
