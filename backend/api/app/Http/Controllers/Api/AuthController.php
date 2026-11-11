<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnsureLicenseActive;
use App\Models\User;
use App\Models\UserLicense;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Guard as SanctumGuard;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuthController extends Controller
{
    public function sessionStatus(Request $request): JsonResponse
    {
        $user = (new SanctumGuard(
            app(AuthFactory::class),
            config('sanctum.expiration'),
            config('auth.guards.sanctum.provider'),
            false,
        ))($request);

        if (! $user instanceof User) {
            return response()->json(['message' => 'Your FaithStream Studio session is no longer active.'], 401);
        }

        $isWebsiteSession = $user->currentAccessToken()?->name === 'faithstream-website';
        if (config('license.license_required') && ! $isWebsiteSession && ! in_array(strtolower($user->email), config('admin.emails', []), true) && ! UserLicense::query()->where('user_id', $user->id)->where('status', 'active')->exists()) {
            return EnsureLicenseActive::licenseRequiredResponse();
        }

        return response()->json(['authenticated' => true])->header('Cache-Control', 'no-store');
    }

    public function register(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email_address' => ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@gmail\.com$/i', 'unique:users,email'],
            'password' => ['required', 'string', 'min:12', 'max:128'],
            'confirm_password' => ['required', 'string', 'same:password'],
        ], [
            'email_address.regex' => 'Use a Google Gmail address ending in @gmail.com.',
            'confirm_password.same' => 'The password confirmation does not match.',
        ]);

        $user = User::create([
            'name' => trim($validated['name']),
            'email' => $validated['email_address'],
            'password' => $validated['password'],
            'role' => 'Media Team',
        ]);
        $user->sendEmailVerificationNotification();

        return response()->json([
            'verification_required' => true,
            'message' => 'Account created. Check your Gmail inbox for a verification link before signing in.',
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'email_address' => ['required', 'string', 'email', 'regex:/^[^@\s]+@gmail\.com$/i'],
            'password' => ['required', 'string'],
            'client' => ['sometimes', 'string', 'in:desktop,website'],
        ], [
            'email_address.regex' => 'Use the Gmail address associated with your account.',
        ]);

        $user = User::where('email', $validated['email_address'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email_address' => ['The email or password is incorrect.'],
            ]);
        }

        if (! $user->hasVerifiedEmail()) {
            return response()->json([
                'verification_required' => true,
                'message' => 'Please verify your email address before signing in.',
            ], 403);
        }

        $client = $validated['client'] ?? 'desktop';
        if (config('license.license_required') && $client !== 'website' && ! in_array(strtolower($user->email), config('admin.emails', []), true) && ! UserLicense::query()->where('user_id', $user->id)->where('status', 'active')->exists()) {
            return EnsureLicenseActive::licenseRequiredResponse();
        }

        return response()->json([
            'user' => $this->userData($user),
            'token' => $user->createToken($client === 'website' ? 'faithstream-website' : 'faithstream-desktop')->plainTextToken,
        ])->header('Cache-Control', 'no-store');
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'email_address' => ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@gmail\.com$/i'],
        ], [
            'email_address.regex' => 'Use the Gmail address associated with your account.',
        ]);

        Password::sendResetLink(['email' => $validated['email_address']]);

        // Return the same response whether or not the address has an account.
        return response()->json([
            'message' => 'If an account exists for that Gmail address, a password reset link has been sent.',
        ]);
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'email_address' => ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@gmail\.com$/i'],
        ], [
            'email_address.regex' => 'Use the Gmail address associated with your account.',
        ]);

        $user = User::where('email', $validated['email_address'])->first();
        if ($user && ! $user->hasVerifiedEmail()) {
            $user->sendEmailVerificationNotification();
        }

        return response()->json([
            'message' => 'If that Gmail address has an unverified account, a new verification link has been sent.',
        ]);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userData($request->user())]);
    }

    public function websiteAccount(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userData($request->user())])->header('Cache-Control', 'no-store');
    }

    public function updateUser(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', 'max:255'],
        ]);
        $user = $request->user();
        $user->name = trim($validated['name']);
        $user->role = trim($validated['role']);
        $user->save();

        return response()->json(['user' => $this->userData($user)]);
    }

    /** The service title shown in the desktop app's header (empty clears it). */
    public function updateServiceTitle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'service_title' => ['present', 'nullable', 'string', 'max:120'],
        ]);
        $title = trim((string) ($validated['service_title'] ?? ''));
        $user = $request->user();
        $user->service_title = $title === '' ? null : $title;
        $user->save();

        return response()->json(['user' => $this->userData($user)]);
    }

    public function storeProfilePhoto(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $user = $request->user();
        $previousPath = $user->profile_photo_path;
        $photoPath = $validated['photo']->store('profile-photos/'.$user->id, 'public');

        if (! $photoPath) {
            return response()->json(['message' => 'Could not save the profile photo. Please try again.'], 500);
        }

        $user->profile_photo_path = $photoPath;
        $user->profile_photo_x = 50;
        $user->profile_photo_y = 50;
        $user->save();

        if ($previousPath && $previousPath !== $photoPath) {
            Storage::disk('public')->delete($previousPath);
        }

        return response()->json(['user' => $this->userData($user)]);
    }

    public function deleteProfilePhoto(Request $request): JsonResponse
    {
        $user = $request->user();
        $previousPath = $user->profile_photo_path;
        $user->profile_photo_path = null;
        $user->profile_photo_x = 50;
        $user->profile_photo_y = 50;
        $user->save();

        if ($previousPath) {
            Storage::disk('public')->delete($previousPath);
        }

        return response()->json(['user' => $this->userData($user)]);
    }

    public function updateProfilePhotoPosition(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'x' => ['required', 'integer', 'between:0,100'],
            'y' => ['required', 'integer', 'between:0,100'],
        ]);

        $user = $request->user();
        if (! $user->profile_photo_path) {
            return response()->json(['message' => 'Add a profile photo before adjusting its position.'], 422);
        }

        $user->profile_photo_x = $validated['x'];
        $user->profile_photo_y = $validated['y'];
        $user->save();

        return response()->json(['user' => $this->userData($user)]);
    }

    public function showProfilePhoto(User $user): StreamedResponse|JsonResponse
    {
        $photoPath = $user->profile_photo_path;
        if (! $photoPath || ! Storage::disk('public')->exists($photoPath)) {
            return response()->json(['message' => 'Profile photo not found.'], 404);
        }

        return Storage::disk('public')->response($photoPath, null, ['Cache-Control' => 'private, max-age=3600']);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    /** @return array{id: int, name: string, email_address: string, role: string, service_title: string|null, profile_photo_url: string|null, profile_photo_position: array{x: int, y: int}, deletion_request_status: 'pending'|'rejected'|null} */
    private function userData(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email_address' => $user->email,
            'role' => $user->role,
            'service_title' => $user->service_title,
            'profile_photo_url' => $user->profile_photo_path
                ? URL::temporarySignedRoute('profile-photos.show', now()->addYear(), ['user' => $user->getKey()], absolute: false)
                : null,
            'profile_photo_position' => [
                'x' => (int) $user->profile_photo_x,
                'y' => (int) $user->profile_photo_y,
            ],
            'deletion_request_status' => $user->deletion_requested_at
                ? 'pending'
                : ($user->deletion_rejected_at ? 'rejected' : null),
        ];
    }

    public function requestAccountDeletion(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'max:128'],
        ]);
        /** @var User $user */
        $user = $request->user();

        if (in_array(strtolower($user->email), config('admin.emails', []), true)) {
            return response()->json(['message' => 'Administrator accounts cannot request deletion here.'], 403);
        }

        if (! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => ['The password is incorrect.']]);
        }

        if ($user->deletion_requested_at) {
            return response()->json([
                'message' => 'Your account deletion request is already waiting for administrator review.',
                'deletion_request_status' => 'pending',
            ], 409);
        }

        $user->forceFill([
            'deletion_requested_at' => now(),
            'deletion_rejected_at' => null,
        ])->save();

        return response()->json([
            'message' => 'Your request was sent to an administrator for review. Your account remains active until it is approved.',
            'deletion_request_status' => 'pending',
        ])->header('Cache-Control', 'no-store');
    }

    public function cancelAccountDeletionRequest(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->forceFill(['deletion_requested_at' => null])->save();

        return response()->json([
            'message' => 'Your account deletion request was cancelled.',
            'deletion_request_status' => $user->deletion_rejected_at ? 'rejected' : null,
        ])->header('Cache-Control', 'no-store');
    }
}
