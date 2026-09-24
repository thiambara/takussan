<?php

namespace Tests\Feature\Notifications;

use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\User;
use App\Notifications\DataExportReadyNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * TCK-575 — l'e-mail « Votre export de données est prêt » était rédigé en français en dur, et son
 * bouton visait l'hôte de l'API (`auth:sanctum`, 401 à qui clique depuis sa messagerie).
 *
 * Ces tests passent par la VRAIE pile d'envoi (`$user->notify()`, mailer `array` de
 * `phpunit.xml`) : c'est elle qui applique la langue du destinataire (`HasLocalePreference`), pas
 * `toMail()`. Rendre `toMail()` après un `setLocale()` à la main prouverait la traduction, jamais
 * que la langue de l'utilisateur est celle qui s'applique.
 */
class DataExportReadyNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app()->setLocale(config('app.locale'));
        parent::tearDown();
    }

    /**
     * @return array<string, array{string, string, string, string}>
     */
    public static function langues(): array
    {
        return [
            'français' => ['fr', 'Votre export de données est prêt', 'Ouvrir « Mes données »', '7 jours'],
            'anglais' => ['en', 'Your data export is ready', 'Open “My data”', '7 days'],
            'wolof' => ['wo', 'Sa génne xibaar pare na', 'Ubbi « Samay xibaar »', '7 fan'],
        ];
    }

    #[DataProvider('langues')]
    public function test_l_e_mail_part_dans_la_langue_du_destinataire(string $langue, string $sujet, string $bouton, string $duree): void
    {
        // La langue de la REQUÊTE (ou du worker) n'est pas celle du destinataire : on la fixe
        // ailleurs exprès, pour que seul `preferred_language` puisse produire le bon texte.
        app()->setLocale($langue === 'fr' ? 'en' : 'fr');
        $user = User::factory()->create(['preferred_language' => $langue]);

        $user->notify(new DataExportReadyNotification($this->exportPret($user)));

        $email = $this->seulEmailEnvoye();
        $this->assertSame($sujet, $email->getSubject());
        $corps = html_entity_decode((string) $email->getHtmlBody(), ENT_QUOTES | ENT_HTML5);
        $this->assertStringContainsString($bouton, $corps);
        $this->assertStringContainsString($duree, $corps);
        if ($langue !== 'fr') {
            $this->assertStringNotContainsString('Votre archive', $corps);
            $this->assertStringNotContainsString('Télécharger', $corps);
        }
        if ($langue !== 'en') {
            // Le GABARIT de Laravel ajoute deux phrases que `toMail()` n'écrit pas : la note sous le
            // bouton et le pied de page, traduites par `lang/<locale>.json`. Elles partaient en
            // anglais à un destinataire fr ou wo (mesuré dans le journal du 2026-09-24).
            foreach ([$corps, (string) $email->getTextBody()] as $partie) {
                $this->assertStringNotContainsString('having trouble', $partie);
                $this->assertStringNotContainsString('copy and paste', $partie);
                $this->assertStringNotContainsString('All rights reserved', $partie);
            }
        }
    }

    /**
     * Les phrases que les gabarits de courriel du FRAMEWORK traduisent par `lang/<locale>.json`.
     * Chacune est d'abord cherchée dans le gabarit lui-même : si Laravel change une clé, ce test
     * rougit au lieu de rester vert sur une clé que plus rien ne lit.
     *
     * @return array<string, array{string}>
     */
    public static function phrasesDuGabarit(): array
    {
        return [
            'note sous le bouton' => ["If you're having trouble clicking the \":actionText\" button, copy and paste the URL below\ninto your web browser:"],
            'pied de page' => ['All rights reserved.'],
            'salutation par défaut' => ['Hello!'],
            'salutation d\'erreur' => ['Whoops!'],
            'formule de fin par défaut' => ['Regards,'],
        ];
    }

    #[DataProvider('phrasesDuGabarit')]
    public function test_chaque_phrase_du_gabarit_de_courriel_est_traduite_en_fr_et_en_wo(string $cle): void
    {
        $gabarits = implode("\n", array_map(
            'file_get_contents',
            [
                base_path('vendor/laravel/framework/src/Illuminate/Notifications/resources/views/email.blade.php'),
                base_path('vendor/laravel/framework/src/Illuminate/Mail/resources/views/html/message.blade.php'),
            ],
        ));
        $this->assertStringContainsString(
            str_contains($cle, 'having trouble') ? "If you're having trouble clicking the" : $cle,
            $gabarits,
            'Cette phrase n\'est plus dans le gabarit de Laravel : la clé a changé.',
        );

        foreach (['fr', 'wo'] as $langue) {
            $traduction = __($cle, ['actionText' => 'X'], $langue);
            $this->assertNotSame(str_replace(':actionText', 'X', $cle), $traduction, "« {$cle} » n'est pas traduite en {$langue}.");
        }
    }

    public function test_le_bouton_mene_a_la_page_mes_donnees_du_front_pas_a_l_api(): void
    {
        config(['app.frontend_url' => 'https://front.example.test', 'app.url' => 'https://api.example.test']);
        $user = User::factory()->create(['preferred_language' => 'fr']);

        $user->notify(new DataExportReadyNotification($this->exportPret($user)));

        $corps = (string) $this->seulEmailEnvoye()->getHtmlBody();
        $this->assertStringContainsString('https://front.example.test/app/account/privacy', $corps);
        // L'hôte de l'API exige un jeton Bearer que le navigateur de la messagerie n'a pas.
        // (Le gabarit de Laravel lie son en-tête à `app.url` : c'est le chemin d'API qui est exclu.)
        $this->assertStringNotContainsString('api.example.test/api/', $corps);
        $this->assertStringNotContainsString('/api/data-exports/', $corps);
    }

    public function test_la_duree_annoncee_est_lue_sur_l_export_pas_ecrite_dans_le_texte(): void
    {
        $user = User::factory()->create(['preferred_language' => 'fr']);
        $export = $this->exportPret($user);
        $export->update(['expires_at' => now()->addDays(3)]);

        $user->notify(new DataExportReadyNotification($export));

        $corps = html_entity_decode((string) $this->seulEmailEnvoye()->getHtmlBody(), ENT_QUOTES | ENT_HTML5);
        $this->assertStringContainsString('pendant 3 jours', $corps);
        $this->assertStringNotContainsString('7 jours', $corps);
    }

    public function test_le_refus_a_24_h_porte_un_code_et_l_instant_de_la_prochaine_demande(): void
    {
        Storage::fake('local');
        $user = $this->actingAsRole('customer');
        $this->travelTo(now()->startOfMinute());

        $this->postJson('/api/me/data-exports')->assertAccepted();
        $premiere = now()->copy();
        $this->travel(2)->hours();

        $reponse = $this->withHeader('Accept-Language', 'en')->postJson('/api/me/data-exports');

        $reponse->assertStatus(429)
            ->assertJsonPath('code', 'data_export_throttled')
            ->assertJsonPath('available_at', $premiere->copy()->addDay()->utc()->format(DATE_ATOM));
        $this->assertSame((string) (22 * 3600), $reponse->headers->get('Retry-After'));
        // La prose suit la langue négociée — elle était française pour tous.
        $this->assertStringStartsWith('An export was already requested in the last 24 hours.', $reponse->json('message'));
        $this->assertNotNull($user);
    }

    private function exportPret(User $user): DataExport
    {
        return DataExport::query()->create([
            'user_id' => $user->id,
            'requested_by' => $user->id,
            'status' => DataExportStatus::Ready,
            'archive_path' => 'data-exports/user-'.$user->id.'/export.zip',
            'requested_at' => now(),
            'ready_at' => now(),
            'expires_at' => now()->addDays(7),
        ]);
    }

    private function seulEmailEnvoye(): Email
    {
        /** @var Collection<int, SentMessage> $messages */
        $messages = app('mailer')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $original = $messages->first()->getOriginalMessage();
        $this->assertInstanceOf(Email::class, $original);

        return $original;
    }
}
