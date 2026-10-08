<?php

namespace App\Support;

/**
 * TCK-599 (verif-599 B1) — une SAISIE insérée dans un e-mail Markdown reste du texte.
 *
 * Les e-mails de notification passent par le gabarit Markdown de Laravel : Blade échappe le HTML
 * (`{{ }}`), puis CommonMark interprète le reste. L'échappement de Blade ne touche pas la syntaxe
 * Markdown : un nom d'alerte `[Votre compte est bloqué](https://evil.example)` devenait un
 * `<a href>` dans un e-mail signé Takussan, envoyé à une adresse qui n'avait rien confirmé.
 *
 * `escape()` préfixe d'une barre oblique inverse chaque ponctuation qui ouvre une construction
 * CommonMark (lien, image, emphase, titre, liste, code, tableau). Elle ne touche ni `&`, ni `<`,
 * ni `>`, ni les guillemets : Blade les échappe en entités, et une entité précédée d'une barre
 * s'afficherait telle quelle (`&amp;`).
 */
final class MarkdownText
{
    private const SYNTAXE = ['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|', '~'];

    public static function escape(string $saisie): string
    {
        return (string) preg_replace_callback(
            '/['.preg_quote(implode('', self::SYNTAXE), '/').']/u',
            fn (array $m): string => '\\'.$m[0],
            $saisie,
        );
    }
}
