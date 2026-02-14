"use client"

import { NavigationProvider, useNavigation } from "@/hooks/use-navigation"
import { Header } from "@/components/terminal/header"
import { Footer } from "@/components/terminal/footer"
import { HomeView } from "@/components/terminal/views/home-view"
import { RadarView } from "@/components/terminal/views/radar-view"
import { SlabDetailView } from "@/components/terminal/views/slab-detail-view"

function ViewRouter() {
  const { activeView } = useNavigation()
  switch (activeView) {
    case "radar":
      return <RadarView />
    case "slab":
      return <SlabDetailView />
    case "home":
    default:
      return <HomeView />
  }
}

export default function Dashboard() {
  return (
    <NavigationProvider>
      <div className="scanlines crt-scanline flex min-h-screen flex-col bg-[var(--terminal-bg)]">
        <Header />

        <main className="flex flex-1 flex-col gap-px p-1 lg:p-1.5">
          <ViewRouter />
        </main>

        <Footer />
      </div>
    </NavigationProvider>
  )
}
