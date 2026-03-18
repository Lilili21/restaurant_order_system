import "@/styles/globals.css";

import type { Metadata } from "next";
import { ReactNode } from "react";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Restaurant QR Orders",
  description: "MVP for QR-based restaurant table ordering without online payment."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
        <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
        <Script
          src="/_vercel/speed-insights/script.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
