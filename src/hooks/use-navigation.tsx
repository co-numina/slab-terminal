"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export type ViewId = "dashboard" | "radar"
// Future: | "markets" | "wallets" | "liquidations"

interface NavigationContextType {
  activeView: ViewId
  setActiveView: (view: ViewId) => void
}

const NavigationContext = createContext<NavigationContextType>({
  activeView: "dashboard",
  setActiveView: () => {},
})

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ViewId>("dashboard")
  return (
    <NavigationContext.Provider value={{ activeView, setActiveView }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  return useContext(NavigationContext)
}
