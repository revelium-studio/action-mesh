import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'ActionMesh | Video to 3D Mesh',
  description: 'Convert videos to animated 3D meshes with Meta\'s ActionMesh model',
  keywords: ['3D', 'mesh', 'video', 'animation', 'AI', 'ActionMesh', 'Meta'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen mesh-bg">
        {children}
      </body>
    </html>
  );
}
