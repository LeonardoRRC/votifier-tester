<?php

use Illuminate\Support\Facades\Route;
use UK\TheQuantum\VotifierTester\Http\Controllers\VoteController;

// POST /api/client/servers/{server}/extensions/votifier-tester/vote
Route::post('/vote', [VoteController::class, 'store']);
