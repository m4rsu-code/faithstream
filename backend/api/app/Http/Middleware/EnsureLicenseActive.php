<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Models\UserLicense;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureLicenseActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! config('license.license_required') || ! $user instanceof User || $this->isAdministrator($user)) {
            return $next($request);
        }

        if (! UserLicense::query()->where('user_id', $user->id)->where('status', 'active')->exists()) {
            return $this->licenseRequiredResponse();
        }

        return $next($request);
    }

    public static function licenseRequiredResponse(): JsonResponse
    {
        return response()->json([
            'license_required' => true,
            'message' => 'A one-time FaithStream Studio license is required for this account. Submit your payment proof on the FaithStream Studio website and wait for verification.',
        ], 403)->header('Cache-Control', 'no-store');
    }

    private function isAdministrator(User $user): bool
    {
        return in_array(strtolower($user->email), config('admin.emails', []), true);
    }
}
