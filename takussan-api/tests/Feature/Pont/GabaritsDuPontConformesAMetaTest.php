<?php

namespace Tests\Feature\Pont;

use App\Models\NotificationTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2980 — les corps des quatre gabarits du pont passent les règles de format que Meta applique à la création d'un
 * gabarit (relevées le 2026-11-19, outil de création des gabarits) : un gabarit qui les enfreint est refusé, et le
 * relais retombe alors sur le texte libre ou le SMS sans que rien ne le signale. Le registre doit dire le texte que
 * Meta approuve, variables dans le même nombre que `meta_variables`.
 */
class GabaritsDuPontConformesAMetaTest extends TestCase
{
    use RefreshDatabase;

    private const GABARITS = ['pont_invitation', 'pont_nouveau_message', 'pont_lien_action', 'resume_hebdo_bailleur'];

    public function test_les_corps_du_pont_passent_les_regles_de_format_de_meta(): void
    {
        $lignes = NotificationTemplate::query()->where('channel', 'whatsapp')->whereIn('meta_template_name', self::GABARITS)->get();
        $this->assertCount(8, $lignes, 'quatre gabarits, en fr et en en');

        foreach ($lignes as $ligne) {
            $corps = trim((string) $ligne->body);
            $nom = "{$ligne->meta_template_name}/{$ligne->locale}";
            preg_match_all('/\{\{(\d+)\}\}/', $corps, $m);
            $variables = json_decode((string) $ligne->getRawOriginal('meta_variables'), true);

            $this->assertSame(range(1, count($variables)), array_map('intval', $m[1]), "$nom : variables {{1}}…{{n}} dans l'ordre, autant que meta_variables");
            $this->assertDoesNotMatchRegularExpression('/^\{\{\d+\}\}/', $corps, "$nom : commence par une variable");
            $this->assertDoesNotMatchRegularExpression('/\{\{\d+\}\}[\s\p{P}]*$/u', $corps, "$nom : finit par une variable");
            $this->assertDoesNotMatchRegularExpression('/\{\{\d+\}\}[\s\p{P}]*\{\{\d+\}\}/u', $corps, "$nom : deux variables séparées par une ponctuation seule");
            $mots = count(preg_split('/\s+/u', trim(preg_replace('/\{\{\d+\}\}/', ' ', $corps))));
            $this->assertLessThanOrEqual(intdiv($mots, 3), count($m[1]), "$nom : plus d'une variable pour trois mots");
        }
    }
}
