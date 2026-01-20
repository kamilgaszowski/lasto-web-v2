import type { Metadata, Viewport } from "next"; // <--- Pamiętaj o imporcie Viewport
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lasto",
  description: "Transkrypcja i edycja",
};

// TO BLOKUJE ZOOMOWANIE NA IPHONE
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
}