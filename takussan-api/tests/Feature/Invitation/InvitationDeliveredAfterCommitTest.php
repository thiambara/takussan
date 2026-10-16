<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Tests\TestCase;

/**
 * TCK-690 (P11.02) — le courriel d'invitation part APRÈS le commit de la
 * transaction de l'appelant.
 *
 * `InvitationService::send()` veut son envoi « hors de la transaction » : une
 * panne du transport ne doit pas défaire l'invitation fraîchement écrite (on la
 * relance ensuite). Mais les trois services par rôle l'appellent depuis LEUR
 * `DB::transaction` : l'envoi synchrone s'y retrouvait, et une panne annulait
 * profil et invitation. À l'inverse, un échec de l'appelant après l'envoi
 * laissait partir un lien vers une invitation qui n'existe plus.
 */
class InvitationDeliveredAfterCommitTest extends TestCase
{
    use RefreshDatabase;

    private function failingTransport(): void
    {
        Mail::extend('panne', fn () => new class extends AbstractTransport
        {
            protected function doSend(SentMessage $message): void
            {
                throw new TransportException('Transport indisponible (test).');
            }

            public function __toString(): string
            {
                return 'panne://';
            }
        });

        config([
            'mail.mailers.panne' => ['transport' => 'panne'],
            'mail.default' => 'panne',
        ]);
        Mail::purge('panne');
    }

    private function standardAgency(): Agency
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        return $agency;
    }

    public function test_une_panne_du_transport_ne_defait_pas_l_invitation_d_un_agent(): void
    {
        $agency = $this->standardAgency();
        $this->failingTransport();

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'agent.panne@example.com',
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertStatus(500);

        $invitation = Invitation::query()->where('email', 'agent.panne@example.com')->first();
        $this->assertNotNull($invitation, 'L’invitation doit survivre à la panne du transport.');
        $this->assertSame(AgentProfile::class, $invitation->invitable_type);
        $this->assertTrue(AgentProfile::query()->whereKey($invitation->invitable_id)->exists());
    }

    public function test_une_panne_du_transport_ne_defait_pas_l_invitation_d_un_proprietaire(): void
    {
        $agency = $this->standardAgency();
        $this->failingTransport();

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'owner.panne@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'owner_type' => 'individual',
        ])->assertStatus(500);

        $invitation = Invitation::query()->where('email', 'owner.panne@example.com')->first();
        $this->assertNotNull($invitation, 'L’invitation doit survivre à la panne du transport.');
        $this->assertTrue(OwnerProfile::query()->whereKey($invitation->invitable_id)->exists());
    }

    public function test_une_panne_du_transport_ne_defait_pas_l_invitation_d_un_prestataire(): void
    {
        $agency = $this->standardAgency();
        $this->failingTransport();

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'sp.panne@example.com',
            'first_name' => 'Mamadou',
            'last_name' => 'Sow',
            'trades' => ['plumbing'],
            'intervention_zones' => ['Dakar'],
        ])->assertStatus(500);

        $invitation = Invitation::query()->where('email', 'sp.panne@example.com')->first();
        $this->assertNotNull($invitation, 'L’invitation doit survivre à la panne du transport.');
        $this->assertTrue(ServiceProviderProfile::query()->whereKey($invitation->invitable_id)->exists());
    }

    public function test_aucun_courriel_ne_part_quand_la_transaction_de_l_appelant_echoue_apres_l_envoi(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $inviter = User::factory()->create();

        try {
            DB::transaction(function () use ($agency, $inviter): void {
                $profile = AgentProfile::query()->create([
                    'user_id' => null,
                    'agency_id' => $agency->id,
                    'status' => 'draft',
                ]);

                app(InvitationService::class)->send([
                    'email' => 'annule@example.com',
                    'role' => 'agent',
                    'invitable_type' => AgentProfile::class,
                    'invitable_id' => $profile->id,
                    'agency_id' => $agency->id,
                ], $inviter);

                throw new RuntimeException('Échec de l’appelant après l’envoi.');
            });
            $this->fail('La transaction de l’appelant devait échouer.');
        } catch (RuntimeException $e) {
            $this->assertSame('Échec de l’appelant après l’envoi.', $e->getMessage());
        }

        $this->assertFalse(Invitation::query()->where('email', 'annule@example.com')->exists());
        Mail::assertNotSent(InvitationMailable::class);
    }

    public function test_hors_transaction_le_courriel_part_toujours(): void
    {
        Mail::fake();
        $agency = $this->standardAgency();

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'agent.ok@example.com',
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertStatus(201);

        Mail::assertSent(InvitationMailable::class, fn (InvitationMailable $m) => $m->hasTo('agent.ok@example.com'));
    }
}
