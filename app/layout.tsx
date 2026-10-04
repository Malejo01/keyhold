import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/config/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description:
    "AI agents for rental agencies: tenant pre-qualification, contracts and USDC deposit escrow on Solana. Demo on devnet with simulated data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden">
        <div
          role="note"
          className="shrink-0 bg-banner text-banner-foreground text-center text-xs font-medium tracking-wide py-1.5 px-3"
        >
          Demo · Solana devnet · simulated data
        </div>
        {children}
      </body>
    </html>
  );
}
