import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Chino Barbershop | Reservas en línea",
  description: "Chino Barbershop — Sistema de reservas en línea. Tu mejor corte, sin esperas. Proyecto académico de Interacción Humano-Computador (UCSS).",
  keywords: ["barbería", "reservas", "Chino Barbershop", "UCSS", "IHC", "corte de cabello"],
  authors: [{ name: "Chino Barbershop" }],
  icons: {
    icon: "/logo.png?v=3",
    apple: "/logo.png?v=3",
  },
  openGraph: {
    title: "Chino Barbershop | Reservas en línea",
    description: "Tu mejor corte, sin esperas. Reserva tu cita en línea.",
    siteName: "Chino Barbershop",
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
      </body>
    </html>
  );
}
