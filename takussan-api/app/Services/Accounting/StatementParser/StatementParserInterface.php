<?php

namespace App\Services\Accounting\StatementParser;

/**
 * @template-implements \IteratorAggregate<int, ParsedLine>
 */
interface StatementParserInterface
{
    /** @return iterable<ParsedLine> */
    public function parse(string $absolutePath, ParserContext $context): iterable;
}
