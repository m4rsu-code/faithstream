<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Verify your FaithStream Studio email</title>
</head>
<body style="margin:0;padding:0;background:#eef2f5;font-family:Arial,Helvetica,sans-serif;color:#152334;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f5;padding:36px 14px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #dce3e8;border-radius:14px;overflow:hidden;">
                    <tr>
                        <td style="padding:25px 32px;background:#102337;">
                            <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#e4a365;">FAITHSTREAM STUDIO</div>
                            <div style="margin-top:5px;font-size:12px;color:#b9c5ce;">Worship production, made simple</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:34px 32px 18px;">
                            <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#b8753e;">ACCOUNT SECURITY</div>
                            <h1 style="margin:10px 0 14px;font-size:25px;line-height:1.3;color:#152334;">Verify your email address</h1>
                            <p style="margin:0 0 13px;font-size:15px;line-height:1.7;color:#344657;">Hello {{ $name }},</p>
                            <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#536575;">
                                Thanks for creating a FaithStream Studio account. Verify this email address to finish setting up your account. You’ll use the same account on the website and desktop app.
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 24px;">
                                <tr>
                                    <td align="center" style="border-radius:6px;background:#c9864d;">
                                        <a href="{{ $verificationUrl }}" style="display:inline-block;padding:14px 24px;color:#102337;font-size:14px;font-weight:700;text-decoration:none;">Verify email address</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#71808c;">If the button doesn’t work, copy this link into your browser:</p>
                            <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;">
                                <a href="{{ $verificationUrl }}" style="color:#a96532;">{{ $verificationUrl }}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:18px 32px 25px;border-top:1px solid #e7ecef;">
                            <p style="margin:0;font-size:12px;line-height:1.6;color:#84919b;">
                                If you didn’t create this account, you can ignore this email. Your account won’t be verified through this message.
                            </p>
                        </td>
                    </tr>
                </table>
                <p style="margin:16px 0 0;font-size:11px;color:#84919b;">FaithStream Studio · Account verification</p>
            </td>
        </tr>
    </table>
</body>
</html>