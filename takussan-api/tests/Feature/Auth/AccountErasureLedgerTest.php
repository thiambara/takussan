<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Account\ErasureLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-885 (ADR-0044, amendement du 2026-10-18, § B) — chaque effacement exécuté laisse, HORS de la
 * base, un objet sur le disque privé des médias : l'identifiant du compte et l'instant, rien d'autre.
 * Une restauration antérieure à l'effacement rendrait le compte en clair ET effacerait la trace
 * (`account_deletion_requests`) qui permettait de le retrouver ; cet objet, lui, n'est pas restauré.
 */
class AccountErasureLedgerTest extends TestCase
{
    use RefreshDatabase;

    /** AC1 — l'objet existe, et ne porte que l'identifiant et l'instant. */
    public function test_ac1_un_effacement_execute_ecrit_l_identifiant_et_l_instant_hors_de_la_base(): void
    {
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-18 19:05:12', 'UTC'));

        $user = User::factory()->create([
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'email' => 'awa.ndiaye@example.test',
            'phone' => '+221770008851',
        ]);
        $demande = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($demande);

        $disque = Storage::disk(config('media-library.disk_name'));
        $cle = "effacements/2026-10-18/{$user->id}-20261018T190512Z.json";
        $this->assertSame([$cle], $disque->allFiles('effacements'));

        $contenu = $disque->get($cle);
        $this->assertSame(
            ['user_id' => $user->id, 'erased_at' => '2026-10-18T19:05:12Z'],
            json_decode($contenu, true, flags: JSON_THROW_ON_ERROR),
        );
        foreach (['Awa', 'Ndiaye', 'awa.ndiaye', '770008851'] as $donnee) {
            $this->assertStringNotContainsString($donnee, $contenu);
        }

        // L'instant de l'objet est celui que la base scelle.
        $this->assertSame('2026-10-18T19:05:12Z', $demande->fresh()->executed_at->utc()->format('Y-m-d\TH:i:s\Z'));
    }

    /**
     * Le disque de préproduction et de production est R2 (`r2-private`) : l'écriture passe par
     * `Storage::disk()`, jamais par un chemin local, et suit le disque que la configuration désigne.
     */
    public function test_l_objet_suit_le_disque_prive_distant(): void
    {
        Notification::fake();
        $distant = RemoteDiskFake::install('r2-private');
        $demande = AccountDeletionRequest::factory()->for(User::factory())->due()->create();

        app(AccountDeletionService::class)->executeDeletion($demande);

        $this->assertCount(1, $distant->allFiles('effacements'));
        $this->assertSame([], Storage::disk('local')->allFiles('effacements'));
    }

    /** Un second passage sur une demande déjà exécutée n'écrit rien de plus. */
    public function test_un_effacement_rejoue_n_ecrit_pas_un_second_objet(): void
    {
        Notification::fake();
        $demande = AccountDeletionRequest::factory()->for(User::factory())->due()->create();
        $service = app(AccountDeletionService::class);

        $service->executeDeletion($demande);
        $service->executeDeletion($demande->fresh());

        $this->assertCount(1, Storage::disk(config('media-library.disk_name'))->allFiles('effacements'));
    }

    /**
     * L'écriture précède l'effacement : si elle échoue, rien n'est fait — ni courriel, ni
     * anonymisation, `executed_at` nul — et le passage suivant retente. Un effacement scellé sans
     * son objet serait un compte qu'une restauration ramènerait sans que personne ne le sache ; un
     * courriel « votre compte est supprimé » par passage, pendant une panne du seau, serait l'autre
     * défaut de l'écriture placée en fin de transaction (le courriel part en synchrone).
     */
    public function test_si_l_ecriture_echoue_l_effacement_n_est_pas_scelle_et_la_commande_le_dit(): void
    {
        Notification::fake();
        Log::spy();
        $user = User::factory()->create(['first_name' => 'Awa']);
        $demande = AccountDeletionRequest::factory()->for($user)->due()->create();
        $this->mock(ErasureLedger::class)
            ->shouldReceive('record')
            ->once()
            ->andThrow(new \RuntimeException('seau injoignable'));

        $this->artisan('account:execute-deletions')->assertExitCode(1);

        $this->assertNull($demande->fresh()->executed_at);
        $intact = User::query()->find($user->id);
        $this->assertNotNull($intact);
        $this->assertSame('Awa', $intact->first_name);
        Notification::assertNothingSent();
        Log::shouldHaveReceived('error')->withArgs(
            fn (string $message, array $context): bool => ($context['account_deletion_request_id'] ?? null) === $demande->id,
        );
    }

    /**
     * Une demande dont le compte n'est plus résolu (supprimé par ailleurs) est scellée sans rien
     * anonymiser (comportement de TCK-080) : rien n'a été effacé, rien ne s'écrit.
     */
    public function test_une_demande_sans_compte_n_ecrit_rien(): void
    {
        $demande = AccountDeletionRequest::factory()->for(User::factory())->due()->create();
        $demande->user->delete();

        app(AccountDeletionService::class)->executeDeletion($demande->fresh());

        $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles('effacements'));
    }

    /** La lecture rend les effacements à partir d'un instant, dans l'ordre, un par compte. */
    public function test_la_liste_se_lit_a_partir_d_un_instant(): void
    {
        $registre = app(ErasureLedger::class);
        $registre->record(11, Carbon::parse('2026-10-16 23:59:59', 'UTC'));
        $registre->record(12, Carbon::parse('2026-10-17 02:59:59', 'UTC'));
        $registre->record(13, Carbon::parse('2026-10-17 03:00:00', 'UTC'));
        $registre->record(14, Carbon::parse('2026-10-18 10:15:00', 'UTC'));
        // Un compte rejoué après une restauration : deux objets, une seule entrée, la plus ancienne.
        $registre->record(13, Carbon::parse('2026-10-18 11:00:00', 'UTC'));

        $lecture = $registre->since(Carbon::parse('2026-10-17 03:00:00', 'UTC'));

        $this->assertSame([], $lecture['illisibles']);
        $this->assertSame([13, 14], array_column($lecture['effacements'], 'user_id'));
        $this->assertSame('2026-10-17T03:00:00Z', $lecture['effacements'][0]['erased_at']->format('Y-m-d\TH:i:s\Z'));
        $this->assertSame([11, 12, 13, 14], array_column($registre->since(null)['effacements'], 'user_id'));
    }
}
