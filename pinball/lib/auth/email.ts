import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * OTP 邮件发送。优先级：EMAIL_MODE=resend → Resend SDK；
 * EMAIL_MODE=smtp → nodemailer；默认/console → 只打日志（开发）。
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport(process.env.EMAIL_SERVER);
  }
  return transporter;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const mode = process.env.EMAIL_MODE ?? 'console';
  const from = process.env.EMAIL_FROM ?? 'no-reply@pinball.local';
  const subject = '「幻想兔」登录验证码';
  const text = `您的验证码是 ${code}，10 分钟内有效。\n\n结果本质随机，历史统计不构成未来保证。`;

  if (mode === 'resend') {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from, to: email, subject, text });
    if (error) throw new Error(`resend failed: ${error.message}`);
    return;
  }

  if (mode === 'smtp') {
    if (!process.env.EMAIL_SERVER) throw new Error('EMAIL_SERVER required when EMAIL_MODE=smtp');
    await getTransporter().sendMail({ from, to: email, subject, text });
    return;
  }

  // console（开发）：不真发，测试从日志读 code
  console.log(`[OTP:console] email=${email} code=${code}`);
}
