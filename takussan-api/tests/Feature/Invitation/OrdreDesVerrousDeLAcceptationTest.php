<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Property;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2755 — accepter l'invitation d'un bailleur contre la confirmation d'une visite d'un bien tenu
 * pour lui : 4 à 9 interblocages (40P01) sur 20 courses, tous sur la même paire — `update properties
 * set pending_owner_profile_id` (le déliement de `aLAcceptation`) contre `select users … for update`
 * (la visite). L'acceptation touchait `users` (prénom d'un compte sans nom, e-mail d'un compte qui
 * n'en a pas, ou la clé étrangère `owner_profiles.user_id`, qui prend un `KEY SHARE` sur `users`)
 * AVANT d'écrire les biens : l'ordre inverse de celui du dépôt (bien → visite → utilisateur,
 * `takussan-api/CLAUDE.md`, piège 10).
 *
 * L'épingle : dans la transaction de l'acceptation, le `select … for update` des biens liés précède
 * toute requête sur `users`, et porte ces biens par identifiant croissant. Le compte d'arrivée des
 * requêtes commence au `BEGIN` de l'acceptation : la recherche du destinataire (`recipientAccount`),
 * une lecture sans verrou, la précède et n'en fait pas partie.
 */
class OrdreDesVerrousDeLAcceptationTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    /** @var list<array{sql: string, bindings: array<int, mixed>}> */
    private array $requetes = [];

    private bool $enregistrer = false;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->agentWith($this->agency, Capability::TeamInvite, Capability::PropertiesUpdateAny);
    }

    private function inviter(string $email): Invitation
    {
        $id = $this->actingAsApi($this->agent)->postJson("/api/agencies/{$this->agency->id}/owners/invite", [
            'email' => $email,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'owner_type' => 'individual',
        ])->assertCreated()->json('data.id');

        return Invitation::query()->findOrFail($id);
    }

    private function bienLie(Invitation $invitation, string $titre): Property
    {
        $id = $this->actingAsApi($this->agent)->postJson('/api/properties', [
            'title' => $titre,
            'type' => 'house',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 250_000,
            'pending_owner_profile_id' => $invitation->invitable_id,
        ])->assertCreated()->json('data.id');

        return Property::query()->findOrFail($id);
    }

    /** Les requêtes émises à partir du premier `BEGIN` (ou point de sauvegarde) de l'acceptation. */
    private function ecouter(): void
    {
        $this->requetes = [];
        $this->enregistrer = false;
        Event::listen(TransactionBeginning::class, function (): void {
            $this->enregistrer = true;
        });
        DB::listen(function ($q): void {
            if ($this->enregistrer) {
                $this->requetes[] = ['sql' => $q->sql, 'bindings' => $q->bindings];
            }
        });
    }

    private function indexDuVerrouDesBiens(): ?int
    {
        foreach ($this->requetes as $i => $r) {
            if (preg_match('/from "properties" where "pending_owner_profile_id" in .* for update/', $r['sql']) === 1) {
                return $i;
            }
        }

        return null;
    }

    private function indexDeLaPremiereRequeteSurUsers(): ?int
    {
        foreach ($this->requetes as $i => $r) {
            if (str_contains($r['sql'], '"users"')) {
                return $i;
            }
        }

        return null;
    }

    /** @param  list<int>  $biens */
    private function assertBiensVerrouillesAvantUsers(array $biens): void
    {
        $verrou = $this->indexDuVerrouDesBiens();
        $users = $this->indexDeLaPremiereRequeteSurUsers();
        $this->assertNotNull($verrou, 'les biens liés sont verrouillés dans la transaction');
        $this->assertNotNull($users, 'l’acceptation touche bien `users` (sans quoi l’épingle ne dit rien)');
        $this->assertLessThan($users, $verrou, 'le verrou des biens précède toute requête sur `users` : '.$this->requetes[$users]['sql']);
        $this->assertStringContainsString('order by "id" asc', $this->requetes[$verrou]['sql'], 'plusieurs biens : par identifiant croissant');
        $this->assertSame(InvitationStatus::Accepted, Invitation::query()->whereNotNull('invitable_id')->latest('id')->first()?->status);
        foreach ($biens as $id) {
            $this->assertNull(Property::withTrashed()->findOrFail($id)->pending_owner_profile_id, 'le lien tombe à l’acceptation');
        }
    }

    public function test_acceptfor_user_un_compte_sans_nom_verrouille_les_biens_avant_users(): void
    {
        $invitation = $this->inviter('awa.diop@example.sn');
        $a = $this->bienLie($invitation, 'Maison de Awa à Ouakam');
        $b = $this->bienLie($invitation, 'Studio de Awa à Mermoz');
        $compte = User::factory()->create(['email' => 'awa.diop@example.sn', 'first_name' => '', 'last_name' => '']);
        $this->app['auth']->forgetGuards();
        $this->ecouter();

        // Le destinataire existe et c'est lui qui est connecté : branche B, `acceptForUser`.
        app(InvitationService::class)->accept($invitation->token, ['first_name' => 'Awa', 'last_name' => 'Diop'], $compte);

        $this->assertBiensVerrouillesAvantUsers([$a->id, $b->id]);
        $this->assertSame('Awa', $compte->fresh()->first_name);
    }

    public function test_acceptfor_account_un_compte_sans_e_mail_verrouille_les_biens_avant_users(): void
    {
        $invitation = $this->inviter('awa.diop@example.sn');
        $a = $this->bienLie($invitation, 'Maison de Awa à Ouakam');
        $compte = User::factory()->create(['email' => null, 'email_verified_at' => null]);
        $this->app['auth']->forgetGuards();
        $this->ecouter();

        // Aucun compte ne porte l'adresse et l'appelant est connecté : `acceptForAccount`, qui pose l'e-mail.
        app(InvitationService::class)->accept($invitation->token, [], $compte);

        $this->assertBiensVerrouillesAvantUsers([$a->id]);
        $this->assertSame('awa.diop@example.sn', $compte->fresh()->email);
    }

    /**
     * Le témoin de la course (4 sur 20) : un compte nommé, qui porte l'adresse — l'acceptation n'écrit
     * pas `users`, mais poser `owner_profiles.user_id` prend, par la clé étrangère, un `KEY SHARE` sur
     * la ligne `users` que la visite tient `FOR UPDATE`. Cette écriture ne nomme pas `users` : l'épingle
     * la cherche elle-même.
     */
    public function test_un_compte_nomme_verrouille_les_biens_avant_de_poser_le_profil_du_bailleur(): void
    {
        $invitation = $this->inviter('awa.diop@example.sn');
        $a = $this->bienLie($invitation, 'Maison de Awa à Ouakam');
        $compte = User::factory()->create(['email' => 'awa.diop@example.sn', 'first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->app['auth']->forgetGuards();
        $this->ecouter();

        app(InvitationService::class)->accept($invitation->token, [], $compte);

        $verrou = $this->indexDuVerrouDesBiens();
        $profil = null;
        foreach ($this->requetes as $i => $r) {
            if (preg_match('/^update "owner_profiles" set .*"user_id"/', $r['sql']) === 1) {
                $profil = $i;
                break;
            }
        }
        $this->assertNotNull($verrou, 'les biens liés sont verrouillés dans la transaction');
        $this->assertNotNull($profil, 'le profil du bailleur reçoit son compte (sans quoi l’épingle ne dit rien)');
        $this->assertLessThan($profil, $verrou, 'le verrou des biens précède la clé étrangère vers `users`');
        $users = $this->indexDeLaPremiereRequeteSurUsers();
        if ($users !== null) {
            $this->assertLessThan($users, $verrou);
        }
        $this->assertNull($a->fresh()->pending_owner_profile_id);
    }

    public function test_une_invitation_qui_ne_vise_pas_un_bailleur_ne_verrouille_aucun_bien(): void
    {
        $invitation = Invitation::factory()->create([
            'agency_id' => $this->agency->id, 'role' => 'agent', 'email' => 'moussa.fall@example.sn',
        ]);
        $compte = User::factory()->create(['email' => 'moussa.fall@example.sn']);
        $this->app['auth']->forgetGuards();
        $this->ecouter();

        app(InvitationService::class)->accept($invitation->token, [], $compte);

        $this->assertSame(InvitationStatus::Accepted, $invitation->fresh()->status);
        $this->assertNotEmpty($this->requetes);
        foreach ($this->requetes as $r) {
            $this->assertDoesNotMatchRegularExpression('/from "properties" .*for update/', $r['sql'], 'aucun verrou de bien');
        }
    }
}
