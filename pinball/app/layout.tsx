import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '幻想兔 · 弹珠机预测系统',
  description: '多租户弹珠机个人统计分析工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--surface)] text-[var(--fg)] antialiased">
        {children}
      </body>
    </html>
  );
}
