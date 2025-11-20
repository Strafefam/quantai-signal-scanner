import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata = {
  title: 'QuantAI Signal Scanner - AI-Powered Crypto Trading Signals',
  description: 'Real-time AI-driven cryptocurrency market scanner with buy/sell signals, risk analysis, and advanced analytics powered by machine learning.',
  keywords: 'crypto signals, trading, AI, market scanner, bitcoin, ethereum',
  openGraph: {
    title: 'QuantAI Signal Scanner',
    description: 'AI-Powered Market Signals',
    type: 'website',
  },
};

export default function RootLayout({ children, }: { children: React.ReactNode; }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='75' font-size='75' fill='%2322c55e'>⚡</text></svg>" />
        </head>
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
