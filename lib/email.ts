import { Resend } from 'resend';

async function getUncachableResendClient() {
  const hostname = process.env.PLATFORM_CONNECTORS_HOSTNAME;
  const xPlatformToken = process.env.PLATFORM_IDENTITY 
    ? 'platform ' + process.env.PLATFORM_IDENTITY 
    : process.env.PLATFORM_WEB_RENEWAL 
    ? 'depl ' + process.env.PLATFORM_WEB_RENEWAL 
    : null;

  if (!xPlatformToken) {
    throw new Error('X_PLATFORM_TOKEN not found for platform/depl');
  }

  const connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_PLATFORM_TOKEN': xPlatformToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  
  return {
    client: new Resend(connectionSettings.settings.api_key),
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function sendVerificationEmail(to: string, token: string, baseUrl: string) {
  try {
    console.log('Attempting to send verification email to:', to);
    const { client, fromEmail } = await getUncachableResendClient();
    console.log('Resend client obtained, fromEmail:', fromEmail);
    
    const verifyUrl = `${baseUrl}/api/auth/verify?token=${token}`;
    console.log('Verification URL:', verifyUrl);
    
    const result = await client.emails.send({
      from: fromEmail || 'The Box <noreply@luctheleo.com>',
      to: [to],
      subject: 'Verify your account - The Box',
      html: `
        <div style="font-family: 'Courier New', Courier, monospace; background: #0a0a0a; color: #fff; padding: 40px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://luctheleo.com/box-logo.png" alt="The Box" style="width: 50px; height: 50px;" />
          </div>
          <h1 style="color: #c3f53c; text-align: center; margin-bottom: 20px;">Verify Your Email</h1>
          <p style="text-align: center; color: #999; margin-bottom: 30px;">
            Click the button below to verify your email address and activate your account with The Box.
          </p>
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${verifyUrl}" style="display: inline-block; background: #c3f53c; color: #000; font-weight: bold; padding: 15px 40px; text-decoration: none; border-radius: 8px;">
              Verify Email
            </a>
          </div>
          <p style="text-align: center; color: #666; font-size: 12px;">
            This link expires in 24 hours. If you didn't create an account, you can ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
          <p style="text-align: center; color: #444; font-size: 11px;">
            &copy; 2026 The Box by luctheleo.com | REVERIE | RVR Creative Development
          </p>
        </div>
      `
    });
    
    console.log('Email sent successfully:', result);
    return true;
  } catch (error: any) {
    console.error('Failed to send verification email:', error);
    console.error('Error details:', error?.message, error?.statusCode);
    return false;
  }
}
