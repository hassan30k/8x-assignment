import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UGC Factory — AI-organized product videos",
  description: "Send a product URL. Get a 9:16 UGC-style video back: background, trending text, trending audio, GIF on top.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}