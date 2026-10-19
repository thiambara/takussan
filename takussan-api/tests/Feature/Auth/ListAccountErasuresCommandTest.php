<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Account\ErasureLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-885 — `account:list-erasures` relit la liste tenue hors de la base et ré-efface ce qu'une
 * restauration a ramené. La « restauration » est simulée : le compte est en clair, sans demande
 * d'effacement, alors que la liste dit qu'il a été effacé.
 */
class ListAccountErasuresCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_liste_dit_ce_que_la_base_courante_garde_de_chaque_effacement(): void
    {
        Notification::fake();
        $registre = app(ErasureLedger::class);

        // Effacé pour de bon, par le chemin réel.
        $efface = User::factory()->create();
        app(AccountDeletionService::class)->executeDeletion(
            AccountDeletionRequest::factory()->for($efface)->due()->create(),
        );
        // Ramené en clair par une restauration.
        $ramene = User::factory()->create();
        $registre->record($ramene->id, Carbon::parse('2026-10-18 10:00:00', 'UTC'));
        // Inconnu de la base courante.
        $registre->record(999_999, Carbon::parse('2026-10-18 11:00:00', 'UTC'));

        $this->artisan('account:list-erasures')
            ->expectsOutputToContain('a_reeffacer=1')
            ->expectsOutputToContain("À ré-effacer : {$ramene->id}")
            ->assertExitCode(0);

        // Rien n'a été touché sans `--execute`.
        $this->assertSame(UserStatus::Active, $ramene->fresh()->status);
    }

    public function test_since_ne_lit_que_les_effacements_a_partir_de_l_instant_restaure(): void
    {
        $avant = User::factory()->create();
        $apres = User::factory()->create();
        $registre = app(ErasureLedger::class);
        $registre->record($avant->id, Carbon::parse('2026-10-18 02:59:59', 'UTC'));
        $registre->record($apres->id, Carbon::parse('2026-10-18 03:00:00', 'UTC'));

        $this->artisan('account:list-erasures', ['--since' => '2026-10-18T03:00:00Z'])
            ->expectsOutputToContain("À ré-effacer : {$apres->id}")
            ->expectsOutputToContain('lus=1 a_reeffacer=1')
            ->assertExitCode(0);
    }

    /**
     * AC2 en test — la mesure sur une copie de la préproduction reste à faire en session. Le
     * compte ramené est ré-effacé, sans second courriel, et un second passage ne trouve plus rien.
     */
    public function test_execute_re_efface_le_compte_ramene_par_la_restauration(): void
    {
        Notification::fake();
        $ramene = User::factory()->create([
            'first_name' => 'Awa',
            'email' => 'awa.ndiaye@example.test',
            'phone' => '+221770008852',
        ]);
        app(ErasureLedger::class)->record($ramene->id, Carbon::parse('2026-10-18 10:00:00', 'UTC'));

        $this->artisan('account:list-erasures', ['--since' => '2026-10-18', '--execute' => true])
            ->expectsOutputToContain('rejoues=1 echecs=0')
            ->assertExitCode(0);

        $fresh = User::withTrashed()->find($ramene->id);
        $this->assertSame(UserStatus::Deleted, $fresh->status);
        $this->assertSame('', $fresh->first_name);
        $this->assertNull($fresh->phone);
        $this->assertSame("deleted-{$ramene->id}@takussan.local", $fresh->email);
        $this->assertNotNull($fresh->deleted_at);
        $demande = AccountDeletionRequest::query()->where('user_id', $ramene->id)->sole();
        $this->assertNotNull($demande->executed_at);
        $this->assertSame('2026-10-18 10:00:00', $demande->requested_at->utc()->format('Y-m-d H:i:s'));
        Notification::assertNothingSent();

        $this->artisan('account:list-erasures', ['--execute' => true])
            ->expectsOutputToContain('a_reeffacer=0')
            ->assertExitCode(0);
    }

    /** Une demande restée « à exécuter » dans la copie est rejouée telle quelle. */
    public function test_execute_rejoue_une_demande_restee_en_attente_dans_la_copie(): void
    {
        Notification::fake();
        $ramene = User::factory()->create();
        $demande = AccountDeletionRequest::factory()->for($ramene)->due()->create();
        app(ErasureLedger::class)->record($ramene->id, now());

        $this->artisan('account:list-erasures', ['--execute' => true])->assertExitCode(0);

        $this->assertNotNull($demande->fresh()->executed_at);
        $this->assertSame(UserStatus::Deleted, User::withTrashed()->find($ramene->id)->status);
    }

    /** Un objet illisible est un compte qu'on ne sait plus nommer : la commande sort en échec. */
    public function test_un_objet_illisible_fait_echouer_la_commande(): void
    {
        Storage::disk(config('media-library.disk_name'))->put('effacements/2026-10-18/x.json', 'pas du json');

        $this->artisan('account:list-erasures')
            ->expectsOutputToContain('Objet illisible : effacements/2026-10-18/x.json')
            ->assertExitCode(1);
    }

    public function test_un_since_illisible_est_refuse(): void
    {
        $this->artisan('account:list-erasures', ['--since' => 'hier soir'])->assertExitCode(2);
    }
}
