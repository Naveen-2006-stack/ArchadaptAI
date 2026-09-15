import type { Metadata } from 'next';
import { Playfair_Display, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ArchAdapt AI — Core Generative Architectural Studio',
  description:
    'Conversational GenAI architectural studio helping users design and adapt conceptual house floor plans based on site constraints, location, family needs, and architectural styles.',
  keywords: [
    'Architecture AI',
    'Conceptual Floor Plan Generator',
    'Kerala Traditional House Plans',
    '3D Massing Visualization',
    'Generative Spatial Planner'
  ]
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${playfair.variable} ${jetbrainsMono.variable} scroll-smooth`}>
      <body className="font-sans bg-[#F9F8F6] text-stone-900 antialiased selection:bg-terracotta-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
