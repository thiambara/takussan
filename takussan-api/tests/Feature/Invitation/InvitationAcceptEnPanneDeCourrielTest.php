<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Notifications\InvitationAcceptedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Tests\TestCase;

/**
 * TCK-1335 (P123.02) — l'avis à l'invitant part après le commit et en file :
 * une panne du courriel n'empêche plus l'invité d'entrer.
 */
class InvitationAcceptEnPanneDeCourrielTest extends TestCase
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

    /** @return array{0: User, 1: Invitation, 2: OwnerProfile} */
    private function ownerInvitation(string $email): array
    {
        $agency = Agency::factory()->create();
        $inviter = User::factory()->create();
        $profile = OwnerProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => OwnerProfileStatus::Draft->value,
            'user_id' => null,
        ]);
        $invitation = Invitation::factory()->create([
            'email' => $email,
            'invited_by' => $inviter->id,
            'agency_id' => $agency->id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profile->id,
            'role' => 'owner',
            'status' => InvitationStatus::Sent->value,
        ]);

        return [$inviter, $invitation, $profile];
    }

    public function test_l_invite_entre_quand_le_courriel_de_l_invitant_est_en_panne(): void
    {
        // Une vraie file : le travail part au worker, comme en préproduction.
        config(['queue.default' => 'database']);
        $this->failingTransport();
        [, $invitation, $profile] = $this->ownerInvitation('panne.accept@example.com');

        $this->postJson('/api/invitations/'.$invitation->token.'/accept', [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'password' => 'sup3r-secret',
        ])->assertOk();

        $this->assertSame(InvitationStatus::Accepted, $invitation->refresh()->status);
        $user = User::query()->where('email', 'panne.accept@example.com')->first();
        $this->assertNotNull($user);
        $this->assertSame('active', $profile->refresh()->getRawOriginal('status'));

        $jobs = DB::table('jobs')->pluck('payload');
        $this->assertCount(1, $jobs);
        $this->assertSame(InvitationAcceptedNotification::class, json_decode((string) $jobs->first(), true)['displayName']);
    }

    public function test_l_avis_part_toujours_a_l_invitant(): void
    {
        [$inviter, $invitation] = $this->ownerInvitation('avis.accept@example.com');

        $this->postJson('/api/invitations/'.$invitation->token.'/accept', [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'password' => 'sup3r-secret',
        ])->assertOk();

        $sent = collect(app('mailer')->getSymfonyTransport()->messages());
        $this->assertCount(1, $sent->filter(
            fn ($m) => collect($m->getEnvelope()->getRecipients())->contains(fn ($a) => $a->getAddress() === $inviter->email),
        ));
    }
}
