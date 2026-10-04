import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { APP_NAME, APP_URL } from "@/lib/config/brand";
import { LANGS, getDict, isLang } from "@/lib/i18n";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Only /es and /en exist; anything else under the dynamic segment is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang);
  return {
    metadataBase: new URL(APP_URL),
    title: `${APP_NAME} — ${t.meta.tagline}`,
    description: t.meta.description,
    alternates: { canonical: `/${lang}`, languages: { en: "/en", es: "/es", "x-default": "/en" } },
    openGraph: { title: `${APP_NAME} — ${t.meta.tagline}`, description: t.meta.description, locale: t.meta.ogLocale },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang);

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden">
        <div
          role="note"
          className="shrink-0 bg-banner text-banner-foreground text-center text-xs font-medium tracking-wide py-1.5 px-3"
        >
          {t.banner}
        </div>
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
