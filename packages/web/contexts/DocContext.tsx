"use client";

import { createContext, useContext, ReactNode } from "react";

interface DocContextValue {
  projectSlug: string | undefined;
}

const DocContext = createContext<DocContextValue | undefined>(undefined);

export function DocContextProvider({
  projectSlug,
  children,
}: {
  projectSlug: string | undefined;
  children: ReactNode;
}) {
  return (
    <DocContext.Provider value={{ projectSlug }}>
      {children}
    </DocContext.Provider>
  );
}

export function useDocContext(): DocContextValue {
  const context = useContext(DocContext);
  if (context === undefined) {
    throw new Error("useDocContext must be used within a DocContextProvider");
  }
  return context;
}
