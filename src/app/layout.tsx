import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"

import "./globals.css"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "SLAB SCOPE \u2014 Percolator Ecosystem Intelligence",
  description:
    "The only eyes on every Percolator deployment \u2014 ecosystem intelligence across devnet and mainnet",
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="font-mono antialiased">{children}</body>
    </html>
  )
}
