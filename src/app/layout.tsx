import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Chino Barber Shop | Reservas en línea",
  description: "Chino Barber Shop — Sistema de reservas en línea. Tu mejor corte, sin esperas. Proyecto académico de Interacción Humano-Computador (UCSS).",
  keywords: ["barbería", "reservas", "Chino Barber Shop", "UCSS", "IHC", "corte de cabello"],
  authors: [{ name: "Chino Barber Shop" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Chino Barber Shop | Reservas en línea",
    description: "Tu mejor corte, sin esperas. Reserva tu cita en línea.",
    siteName: "Chino Barber Shop",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="font-sans antialiased bg-background text-foreground"
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
