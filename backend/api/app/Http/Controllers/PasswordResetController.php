<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class PasswordResetController extends Controller
{
    public function show(string $token, Request $request)
    {
        return view('password-reset', [
            'token' => $token,
            'email' => (string) $request->query('email', ''),
        ]);
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@gmail\.com$/i'],
            'password' => ['required', 'string', 'min:12', 'max:128', 'confirmed'],
        ]);

        $status = Password::reset(
            $validated,
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();
                $user->tokens()->delete();
            },
        );

        if ($status === Password::PASSWORD_RESET) {
            return redirect()->route('password.reset.success');
        }

        return back()->withInput($request->only('email'))->withErrors([
            'email' => __($status),
        ]);
    }

    public function success()
    {
        return view('password-reset-success');
    }
}
