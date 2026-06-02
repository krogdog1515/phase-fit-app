import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, DM_Sans } from "next/font/google";
import PwaRegister from "./components/PwaRegister";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const barlowAccent = Barlow({
  variable: "--font-barlow-accent",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "Phase Fit",
  description:
    "Cycle-aware training that adapts to your phase, recovery, and performance.",
  applicationName: "Phase Fit",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Phase Fit",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#F2736A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlowCondensed.variable} ${dmSans.variable} ${barlowAccent.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-pf-bg text-pf-text">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
