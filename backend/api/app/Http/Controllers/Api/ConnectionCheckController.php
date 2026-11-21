<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class ConnectionCheckController
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::connection()->select('SELECT 1');

            return response()->json([
                'ok' => true,
                'message' => 'FaithStream API and database are reachable.',
                'services' => [
                    'api' => 'connected',
                    'database' => 'connected',
                ],
                'checked_at' => now()->toIso8601String(),
            ])->header('Cache-Control', 'no-store');
        } catch (Throwable) {
            return response()->json([
                'ok' => false,
                'message' => 'The API is reachable, but the database connection failed.',
                'services' => [
                    'api' => 'connected',
                    'database' => 'disconnected',
                ],
                'checked_at' => now()->toIso8601String(),
            ], 503)->header('Cache-Control', 'no-store');
        }
    }
}
