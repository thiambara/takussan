<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Invitation;
use App\Services\Invitation\InvitationService;
use App\Services\Notifications\ContactSansCompte;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-728 (P29.01) — une invitation a UNE langue, écrite à sa création : `fr` explicite
 * (`ContactSansCompte::DEFAULT_LOCALE`), jamais la langue négociée de l'invitant ni celle
 * du processus qui joue la relance. Le compte existant du destinataire garde la priorité.
 *
 * Rouge avant TCK-728 : l'envoi partait sous `Accept-Language` de l'invitant (`en`, `wo`),
 * la relance J+2 sous `config('app.locale')` du worker.
 */
class InvitationLocaleTest extends TestCase
{
    use RefreshDatabase;

    public function test_envoi_et_relance_partent_en_francais_quelle_que_soit_la_langue_de_l_invitant(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        foreach (['en' => 'awa@example.com', 'wo' => 'moussa@example.com'] as $langue => $email) {
            $this->withHeader('Accept-Language', $langue)
                ->postJson("/api/agencies/{$agency->id}/owners/invite", [
                    'email' => $email,
                    'first_name' => 'Awa',
                    'last_name' => 'Diop',
                    'owner_type' => 'individual',
                ])->assertCreated();

            $invitation = Invitation::query()->where('email', $email)->sole();
            $this->assertSame(ContactSansCompte::DEFAULT_LOCALE, data_get($invitation->metadata, 'locale'));
        }

        // La relance est jouée par le worker, sous une autre langue de processus.
        app()->setLocale('en');
        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();
        $this->assertCount(2, app(InvitationService::class)->remindPending());

        $envois = Mail::sent(InvitationMailable::class);
        $this->assertCount(4, $envois);
        foreach ($envois as $mail) {
            $this->assertSame('fr', $mail->locale, ($mail->isReminder ? 'relance' : 'envoi').' à '.$mail->invitation->email);
        }
    }

    public function test_une_invitation_par_numero_porte_aussi_le_francais(): void
    {
        config(['auth.phone_login.enabled' => true]);
        Mail::fake();
        FakeSmsRouter::install();
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->withHeader('Accept-Language', 'en')
            ->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
                'phone' => '+221770000802',
                'first_name' => 'Awa',
                'last_name' => 'Ndiaye',
            ])->assertCreated();

        $this->assertSame('fr', data_get(Invitation::query()->sole()->metadata, 'locale'));
    }

    public function test_une_invitation_ancienne_sans_langue_ecrite_retombe_sur_le_francais(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'ancienne@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'owner_type' => 'individual',
        ])->assertCreated();

        // Une ligne créée avant TCK-728 : aucune `metadata.locale`.
        $invitation = Invitation::query()->sole();
        $invitation->forceFill(['metadata' => ['first_name' => 'Awa']])->save();

        config(['app.locale' => 'en']);
        app()->setLocale('en');
        $this->travel(InvitationService::REMINDER_OFFSET_DAYS + 1)->days();
        app(InvitationService::class)->remindPending();

        $relance = Mail::sent(InvitationMailable::class, fn (InvitationMailable $m) => $m->isReminder)->sole();
        $this->assertSame('fr', $relance->locale);
    }
}
