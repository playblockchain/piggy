import type { Metadata } from "next";
import { Nunito, Pixelify_Sans, Tiny5 } from "next/font/google";
import "./globals.css";

/** Pixel caps: labels, window titles, tags. Caps only, never paragraphs. */
const tiny5 = Tiny5({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

/** Pixel display: short mixed-case headings and big numbers. */
const pixelify = Pixelify_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

/** Body and UI: everything you actually read. */
const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lil Piggy",
  description:
    "Little pig, big feelings. Lil Piggy reads a wallet snapshot and hands back a money personality, a mood and a plan your agent can carry out.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${tiny5.variable} ${pixelify.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
