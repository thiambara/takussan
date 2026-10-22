<?php

namespace Tests\Support;

/**
 * ADR-0071 (TCK-1509) — une écriture rend la projection de son `show`. L'assertion compare la
 * FORME de deux `data` : l'ensemble des chemins de clés, chacun avec le type JSON de sa valeur
 * (`null`, `bool`, `number`, `string`, `object`, `list`). Un objet se compare récursivement, une
 * liste se réduit à son premier élément. Le type compte : `null` contre une chaîne est un écart
 * (P95.01).
 *
 * Les écarts admis sont des chemins (`can_refund`, `property.address`), chacun justifié par le
 * docblock de la ressource (ADR-0071, point 3). Un écart admis qui ne diverge plus fait aussi
 * échouer : la liste ne peut que rapetisser, au rythme du code.
 *
 * Un chemin qui diverge masque ses descendants : `property` absent n'énumère pas `property.id`,
 * `property.title`… un par un.
 */
trait FormeDuShow
{
    /**
     * @param  array<mixed>  $ecriture  le `data` de la réponse d'écriture
     * @param  array<mixed>  $show  le `data` du `show`, lu après l'écriture par le même appelant
     * @param  list<string>  $ecartsAdmis
     */
    protected function assertEcritureALaFormeDuShow(array $ecriture, array $show, array $ecartsAdmis = [], string $geste = 'écriture'): void
    {
        $ecarts = self::ecartsDeForme(self::forme($ecriture), self::forme($show));

        $nonAdmis = array_values(array_diff($ecarts, $ecartsAdmis));
        $perimes = array_values(array_diff($ecartsAdmis, $ecarts));

        $this->assertSame([], $nonAdmis, "{$geste} : ces chemins n'ont pas la forme du show");
        $this->assertSame([], $perimes, "{$geste} : ces écarts admis n'en sont plus, retirer l'entrée");
    }

    /**
     * @param  array<mixed>  $valeur
     * @return array<string, string> chemin → type JSON
     */
    protected static function forme(array $valeur, string $prefixe = ''): array
    {
        $forme = [];
        foreach ($valeur as $cle => $v) {
            $chemin = $prefixe === '' ? (string) $cle : $prefixe.'.'.$cle;
            $forme[$chemin] = self::typeJson($v);
            if (is_array($v) && $v !== []) {
                $forme += array_is_list($v)
                    ? (is_array($v[0]) ? self::forme($v[0], $chemin.'[]') : [$chemin.'[]' => self::typeJson($v[0])])
                    : self::forme($v, $chemin);
            }
        }

        return $forme;
    }

    /**
     * @param  array<string, string>  $a
     * @param  array<string, string>  $b
     * @return list<string> les chemins qui divergent, sans les descendants d'un chemin qui diverge
     */
    protected static function ecartsDeForme(array $a, array $b): array
    {
        $ecarts = [];
        foreach (array_unique([...array_keys($a), ...array_keys($b)]) as $chemin) {
            if (($a[$chemin] ?? null) !== ($b[$chemin] ?? null)) {
                $ecarts[] = $chemin;
            }
        }

        $ecarts = array_values(array_filter($ecarts, function (string $chemin) use ($ecarts): bool {
            foreach ($ecarts as $autre) {
                if ($autre !== $chemin && (str_starts_with($chemin, $autre.'.') || str_starts_with($chemin, $autre.'[]'))) {
                    return false;
                }
            }

            return true;
        }));
        sort($ecarts);

        return $ecarts;
    }

    private static function typeJson(mixed $v): string
    {
        return match (true) {
            $v === null => 'null',
            is_bool($v) => 'bool',
            is_int($v), is_float($v) => 'number',
            is_string($v) => 'string',
            is_array($v) && ($v === [] || array_is_list($v)) => 'list',
            default => 'object',
        };
    }
}
