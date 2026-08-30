import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PersonalWebMCP — Teach the web once',
  description:
    'A user-owned capability layer that turns repeated browser workflows into reusable WebMCP tools.',
  openGraph: {
    title: 'PersonalWebMCP — Teach the web once',
    description: 'Turn repeated browser workflows into reusable WebMCP tools across legacy, native, and changing websites.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'PersonalWebMCP capability layer spanning three web environments' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PersonalWebMCP — Teach the web once',
    description: 'Turn repeated browser workflows into reusable WebMCP tools.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
