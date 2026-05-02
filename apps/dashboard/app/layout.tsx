import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlphaScout Dashboard — AgentPay",
  description: "Real-time dashboard for AlphaScout autonomous research agent on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
