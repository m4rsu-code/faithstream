<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AccountDeletedMail;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Throwable;

class AdminDashboardController extends Controller
{
    public function overview(): JsonResponse
    {
        $now = now();
        $registrations = [];

        for ($monthsAgo = 5; $monthsAgo >= 0; $monthsAgo--) {
            $month = now()->startOfMonth()->subMonths($monthsAgo);
            $registrations[] = [
                'month' => $month->format('M Y'),
                'users' => User::query()
                    ->whereBetween('created_at', [$month, $month->copy()->endOfMonth()])
                    ->count(),
            ];
        }

        return response()->json([
            'stats' => [
                'total_users' => User::query()->count(),
                'verified_users' => User::query()->whereNotNull('email_verified_at')->count(),
                'unverified_users' => User::query()->whereNull('email_verified_at')->count(),
                'new_users_30_days' => User::query()->where('created_at', '>=', $now->copy()->subDays(30))->count(),
                'active_users_30_days' => User::query()
                    ->whereHas('tokens', static fn ($query) => $query->where('last_used_at', '>=', $now->copy()->subDays(30)))
                    ->count(),
            ],
            'registrations' => $registrations,
            'recent_users' => User::query()
                ->select(['id', 'name', 'email', 'role', 'email_verified_at', 'created_at'])
                ->withMax('tokens as last_activity_at', 'last_used_at')
                ->orderByDesc('created_at')
                ->limit(5)
                ->get()
                ->map(static fn (User $user): array => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email_address' => $user->email,
                    'role' => $user->role,
                    'email_verified' => $user->email_verified_at !== null,
                    'protected_account' => in_array(strtolower($user->email), config('admin.emails', []), true),
                    'deletion_requested_at' => $user->deletion_requested_at?->toIso8601String(),
                    'created_at' => $user->created_at?->toIso8601String(),
                    'last_activity_at' => $user->last_activity_at,
                ])
                ->all(),
            'subscriptions' => [
                'configured' => false,
                'message' => 'Subscription plans and billing are not connected to the backend yet.',
            ],
            'generated_at' => $now->toIso8601String(),
        ])->header('Cache-Control', 'no-store');
    }

    public function users(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $search = trim((string) ($validated['search'] ?? ''));
        $adminEmails = config('admin.emails', []);
        $authenticatedAdmin = $request->user();
        $pinnedAdmin = User::query()
            ->select(['id', 'name', 'email', 'role', 'email_verified_at', 'created_at'])
            ->withMax('tokens as last_activity_at', 'last_used_at')
            ->find($authenticatedAdmin->id);

        $users = User::query()
            ->select(['id', 'name', 'email', 'role', 'email_verified_at', 'created_at'])
            ->withMax('tokens as last_activity_at', 'last_used_at')
            ->when($search !== '', function ($query) use ($search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('name', 'like', '%'.$search.'%')
                        ->orWhere('email', 'like', '%'.$search.'%');
                });
            })
            ->where('id', '!=', $authenticatedAdmin->id)
            ->when($adminEmails !== [], static function ($query) use ($adminEmails): void {
                $placeholders = implode(', ', array_fill(0, count($adminEmails), '?'));
                $query->orderByRaw('CASE WHEN LOWER(email) IN ('.$placeholders.') THEN 0 ELSE 1 END', $adminEmails);
            })
            ->orderByDesc('created_at')
            ->paginate(10)
            ->through(static fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email_address' => $user->email,
                'role' => $user->role,
                'email_verified' => $user->email_verified_at !== null,
                'protected_account' => in_array(strtolower($user->email), config('admin.emails', []), true),
                'deletion_requested_at' => $user->deletion_requested_at?->toIso8601String(),
                'created_at' => $user->created_at?->toIso8601String(),
                'last_activity_at' => $user->last_activity_at,
            ]);

        return response()->json([
            'admin_account' => [
                'id' => $pinnedAdmin->id,
                'name' => $pinnedAdmin->name,
                'email_address' => $pinnedAdmin->email,
                'role' => $pinnedAdmin->role,
                'email_verified' => $pinnedAdmin->email_verified_at !== null,
                'protected_account' => true,
                'deletion_requested_at' => $pinnedAdmin->deletion_requested_at?->toIso8601String(),
                'created_at' => $pinnedAdmin->created_at?->toIso8601String(),
                'last_activity_at' => $pinnedAdmin->last_activity_at,
            ],
            'users' => $users->items(),
            'pagination' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function deletionRequests(): JsonResponse
    {
        $requests = User::query()
            ->whereNotNull('deletion_requested_at')
            ->orderBy('deletion_requested_at')
            ->get(['id', 'name', 'email', 'deletion_requested_at'])
            ->map(static fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email_address' => $user->email,
                'requested_at' => $user->deletion_requested_at?->toIso8601String(),
            ])
            ->all();

        return response()->json([
            'requests' => $requests,
            'pending_count' => count($requests),
        ])->header('Cache-Control', 'no-store');
    }

    public function deletionRequestCount(): JsonResponse
    {
        return response()->json([
            'pending_count' => User::query()->whereNotNull('deletion_requested_at')->count(),
        ])->header('Cache-Control', 'no-store');
    }

    public function decideDeletionRequest(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'decision' => ['required', 'in:approve,reject'],
        ]);

        if ($this->isProtectedAdmin($user)) {
            return response()->json(['message' => 'Administrator accounts cannot be deleted here.'], 403);
        }

        $profilePhotoPath = null;
        $deletionRecipient = null;
        $recipientName = null;
        $message = '';
        DB::transaction(function () use ($user, $validated, &$profilePhotoPath, &$deletionRecipient, &$recipientName, &$message): void {
            $account = User::query()->lockForUpdate()->findOrFail($user->id);
            if (! $account->deletion_requested_at) {
                abort(409, 'This account has no pending deletion request.');
            }

            if ($validated['decision'] === 'reject') {
                $account->forceFill([
                    'deletion_requested_at' => null,
                    'deletion_rejected_at' => now(),
                ])->save();
                $message = 'Deletion request rejected. The account remains active.';
                return;
            }

            $deletionRecipient = $account->email;
            $recipientName = $account->name;
            $profilePhotoPath = $account->profile_photo_path;
            $account->tokens()->delete();
            DB::table('sessions')->where('user_id', $account->id)->delete();
            DB::table('password_reset_tokens')->where('email', $account->email)->delete();
            $account->delete();
            $message = 'Deletion request approved. The account and its cloud-synced presentations were permanently deleted.';
        });

        if ($profilePhotoPath) {
            Storage::disk('public')->delete($profilePhotoPath);
        }

        $notificationSent = null;
        if ($deletionRecipient && $recipientName) {
            try {
                Mail::to($deletionRecipient)->send(new AccountDeletedMail(
                    recipientName: $recipientName,
                    deletedAt: now()->toDayDateTimeString(),
                ));
                $notificationSent = true;
            } catch (Throwable $exception) {
                Log::error('FaithStream account deletion confirmation email could not be sent.', [
                    'recipient' => $deletionRecipient,
                    'exception_type' => $exception::class,
                ]);
                $notificationSent = false;
                $message .= ' The account was deleted, but its confirmation email could not be sent. Check the mail settings and application logs.';
            }
        }

        return response()->json([
            'message' => $message,
            'notification_sent' => $notificationSent,
        ])->header('Cache-Control', 'no-store');
    }

    private function isProtectedAdmin(User $user): bool
    {
        return in_array(strtolower($user->email), config('admin.emails', []), true);
    }
}
