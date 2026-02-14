"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

export type ViewId = "home" | "radar" | "slab"

interface NavigationContextType {
  activeView: ViewId
  setActiveView: (view: ViewId) => void
  /** Slab address for drill-down view */
  selectedSlab: string | null
  /** Program label for the selected slab */
  selectedSlabProgram: string | null
  /** Network for the selected slab */
  selectedSlabNetwork: "devnet" | "mainnet" | null
  /** Navigate to slab detail view */
  navigateToSlab: (address: string, programLabel?: string, network?: "devnet" | "mainnet") => void
  /** Go back to previous view */
  goBack: () => void
  /** Label for back navigation */
  previousView: ViewId
}

const NavigationContext = createContext<NavigationContextType>({
  activeView: "home",
  setActiveView: () => {},
  selectedSlab: null,
  selectedSlabProgram: null,
  selectedSlabNetwork: null,
  navigateToSlab: () => {},
  goBack: () => {},
  previousView: "home",
})

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ViewId>("home")
  const [previousView, setPreviousView] = useState<ViewId>("home")
  const [selectedSlab, setSelectedSlab] = useState<string | null>(null)
  const [selectedSlabProgram, setSelectedSlabProgram] = useState<string | null>(null)
  const [selectedSlabNetwork, setSelectedSlabNetwork] = useState<"devnet" | "mainnet" | null>(null)

  const handleSetView = useCallback((view: ViewId) => {
    if (view !== "slab") {
      setSelectedSlab(null)
      setSelectedSlabProgram(null)
      setSelectedSlabNetwork(null)
    }
    setActiveView(view)
  }, [])

  const navigateToSlab = useCallback((address: string, programLabel?: string, network?: "devnet" | "mainnet") => {
    setPreviousView(activeView === "slab" ? previousView : activeView)
    setSelectedSlab(address)
    setSelectedSlabProgram(programLabel ?? null)
    setSelectedSlabNetwork(network ?? null)
    setActiveView("slab")
  }, [activeView, previousView])

  const goBack = useCallback(() => {
    setSelectedSlab(null)
    setSelectedSlabProgram(null)
    setSelectedSlabNetwork(null)
    setActiveView(previousView)
  }, [previousView])

  return (
    <NavigationContext.Provider
      value={{
        activeView,
        setActiveView: handleSetView,
        selectedSlab,
        selectedSlabProgram,
        selectedSlabNetwork,
        navigateToSlab,
        goBack,
        previousView,
      }}
    >
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  return useContext(NavigationContext)
}
