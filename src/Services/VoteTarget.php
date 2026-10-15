<?php

namespace UK\TheQuantum\VotifierTester\Services;

final class VoteTarget
{
    public function __construct(public readonly string $host, public readonly int $port)
    {
    }
}
