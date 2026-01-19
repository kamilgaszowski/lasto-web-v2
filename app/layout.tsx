import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./lasto.css"; // Import stylów globalnie tutaj

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lasto",
  description: "Słuchaj. Nagraj. Twórz",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning na html ignoruje błędy atrybutów html
    <html lang="pl" className="dark" suppressHydrationWarning> 
     <body 
  suppressHydrationWarning={true} // <--- TO JEST KLUCZOWE
  className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-white`}
>
        {children}
      </body>
    </html>
  )
}