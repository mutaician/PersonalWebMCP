import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://personal-webmcp.mutaician.chatgpt.site'),
  title: 'PersonalWebMCP — Make any website work your way',
  description:
    'Teach missing web workflows, personalize native WebMCP tools, and expose your own reusable capabilities to agents.',
  openGraph: {
    title: 'PersonalWebMCP — Make any website work your way',
    description: 'Teach missing workflows, personalize native tools, and keep your WebMCP capabilities useful as websites evolve.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'PersonalWebMCP capability layer spanning three web environments' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PersonalWebMCP — Make any website work your way',
    description: 'Teach missing workflows and personalize native WebMCP tools for any compatible agent.',
    images: ['/og.png'],
  },
  alternates: { canonical: '/' },
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
