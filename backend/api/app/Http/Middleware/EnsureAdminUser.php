<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminUser
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $adminEmails = config('admin.emails', []);

        if (! $user instanceof User || ! in_array(strtolower($user->email), $adminEmails, true)) {
            return response()->json(['message' => 'Administrator access is required.'], 403);
        }

        return $next($request);
    }
}
