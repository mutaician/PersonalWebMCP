import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PersonalWebMCP — Teach the web once',
  description:
    'A user-owned capability layer that turns repeated browser workflows into reusable WebMCP tools.',
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
