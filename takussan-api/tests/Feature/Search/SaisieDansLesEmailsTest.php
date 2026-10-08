<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Enums\Currency;
use App\Models\Favorite;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Notifications\FavoriteChangesNotification;
use App\Notifications\SavedSearchMatchesNotification;
use App\Support\MarkdownText;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * TCK-599 (verif-599 B1) — une saisie reprise dans un e-mail reste du TEXTE : ni lien, ni image.
 *
 * Le défaut : le nom d'une alerte de visiteur, rendu en Markdown dans l'e-mail de confirmation,
 * faisait de la route publique un relais d'hameçonnage signé Takussan, vers n'importe quelle
 * adresse. Même mécanisme, moindre portée, pour le titre d'un bien (favoris, alerte) et le nom
 * d'une alerte confirmée.
 */
class SaisieDansLesEmailsTest extends TestCase
{
    use RefreshDatabase;

    /** Les trois formes qui produisaient un lien ou une image. */
    private const PIEGES = [
        '[Votre compte est bloqué, cliquez ici](https://evil.example/x)',
        '![pixel](https://evil.example/p.png)',
        '<a href="https://evil.example/a">ici</a>',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function assertSansLienNiImageEtrangers(string $html): void
    {
        $this->assertDoesNotMatchRegularExpression('/<a[^>]+href="https:\/\/evil\.example/i', $html);
        $this->assertDoesNotMatchRegularExpression('/<img[^>]+src="https:\/\/evil\.example/i', $html);
    }

    public function test_la_confirmation_d_un_visiteur_ne_reprend_aucune_saisie(): void
    {
        foreach (self::PIEGES as $i => $piege) {
            $this->postJson('/api/public/search-alerts', [
                'criteria' => ['city' => 'Dakar'],
                'name' => $piege,
                'frequency' => 'daily',
                'channel' => 'email',
                'email' => "victime{$i}@exemple.sn",
                'locale' => 'fr',
                'consent' => true,
            ])->assertStatus(202);

            $mails = collect(app('mailer')->getSymfonyTransport()->messages())
                ->map(fn (SentMessage $m) => $m->getOriginalMessage())
                ->filter(fn (Email $e) => $e->getTo()[0]->getAddress() === "victime{$i}@exemple.sn");
            $this->assertCount(1, $mails);
            $html = (string) $mails->first()->getHtmlBody();
            $this->assertSansLienNiImageEtrangers($html);
            // Avant consentement, pas même le texte : rien de ce qu'un tiers a écrit.
            $this->assertStringNotContainsString('evil.example', $html);
            $this->assertStringNotContainsString('evil.example', (string) $mails->first()->getTextBody());
        }
    }

    public function test_l_alerte_confirmee_rend_le_nom_et_les_titres_en_texte(): void
    {
        $user = User::factory()->create();
        foreach (self::PIEGES as $piege) {
            $search = SavedSearch::create([
                'user_id' => $user->id,
                'name' => mb_substr($piege, 0, 100),
                'criteria' => ['city' => 'Dakar'],
                'notification_frequency' => 'daily',
                'is_active' => true,
            ]);
            $bien = Property::factory()->published()->create(['title' => $piege]);

            $html = (string) (new SavedSearchMatchesNotification($search, new Collection([$bien]), 1))->toMail($user)->render();

            $this->assertSansLienNiImageEtrangers($html);
            $this->assertStringContainsString('evil.example', $html, 'la saisie reste lisible, en texte');
        }
    }

    /**
     * verif-599 B1-bis — le LIEU de la carte (quartier, ou la ville quand le quartier est vide) est
     * une saisie libre de l'annonceur, au même titre que le titre.
     */
    public function test_l_alerte_rend_le_quartier_et_la_ville_en_texte(): void
    {
        $user = User::factory()->create();
        $search = SavedSearch::create([
            'user_id' => $user->id,
            'name' => 'Dakar',
            'criteria' => ['city' => 'Dakar'],
            'notification_frequency' => 'daily',
            'is_active' => true,
        ]);
        foreach (self::PIEGES as $piege) {
            foreach ([['neighborhood' => $piege, 'city' => 'Dakar'], ['neighborhood' => null, 'city' => mb_substr($piege, 0, 100)]] as $adresse) {
                $bien = Property::factory()->published()->create(['title' => 'Villa']);
                Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'country' => 'SN'] + $adresse);

                $html = (string) (new SavedSearchMatchesNotification($search, new Collection([$bien->fresh('address')]), 1))->toMail($user)->render();

                $this->assertSansLienNiImageEtrangers($html);
                $this->assertStringContainsString('evil.example', $html, 'le lieu reste lisible, en texte');
            }
        }
    }

    public function test_les_favoris_rendent_le_titre_en_texte(): void
    {
        $user = User::factory()->create();
        foreach (self::PIEGES as $piege) {
            $baisse = new FavoriteChangesNotification(FavoriteChangesNotification::KIND_PRICE_DROP, [
                ['property_id' => 1, 'title' => $piege, 'old' => '500000.00', 'new' => '450000.00', 'currency' => Currency::XOF],
            ]);
            $sortie = new FavoriteChangesNotification(FavoriteChangesNotification::KIND_UNAVAILABLE, [
                ['property_id' => 1, 'title' => $piege, 'availability' => Favorite::RENTED],
            ]);

            foreach ([$baisse, $sortie] as $notification) {
                $html = (string) $notification->toMail($user)->render();
                $this->assertSansLienNiImageEtrangers($html);
                $this->assertStringContainsString('evil.example', $html, 'la saisie reste lisible, en texte');
            }
        }
    }

    public function test_l_echappement_ne_double_pas_les_entites(): void
    {
        $this->assertSame('Villa \[Ngor\] & co', MarkdownText::escape('Villa [Ngor] & co'));
        $this->assertSame('a\_b \*c\* \#1', MarkdownText::escape('a_b *c* #1'));
    }
}
