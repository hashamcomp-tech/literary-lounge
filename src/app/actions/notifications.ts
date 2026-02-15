
'use server';

import nodemailer from 'nodemailer';

/**
 * Sends an email notification to the administrator when a new access request is submitted.
 * Requires SMTP environment variables to be configured.
 * 
 * @param userEmail The email address of the user who requested access.
 */
export async function sendAccessRequestEmail(userEmail: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Fail silently if configuration is missing to avoid blocking the user flow
  if (!host || !user || !pass) {
    console.warn('SMTP configuration missing. Email notification skipped.');
    return { success: false, message: 'SMTP not configured' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // Use SSL for port 465
    auth: {
      user,
      pass,
    },
  });

  try {
    await transporter.sendMail({
      from: '"Literary Lounge" <no-reply@literarylounge.com>',
      to: 'hashamcomp@gmail.com',
      subject: 'New Contributor Access Request',
      text: `A new user has requested publish access: ${userEmail}. Check the admin dashboard to approve them.`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #6366f1;">New Contributor Access Request</h2>
          <p>A new user has requested publish access to the cloud library:</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Email:</strong> ${userEmail}</p>
          </div>
          <p>You can review and approve this request in the admin dashboard:</p>
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/admin" 
             style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Open Admin Dashboard
          </a>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to send email notification:', error);
    return { success: false, error: 'Failed to send email' };
  }
}
