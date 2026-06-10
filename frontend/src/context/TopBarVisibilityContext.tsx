import { createContext, useContext, type ReactNode } from 'react';

type TopBarVisibilityContextValue = {
  isHidden: boolean;
};

const TopBarVisibilityContext = createContext<TopBarVisibilityContextValue>({
  isHidden: false,
});

export function TopBarVisibilityProvider({
  isHidden,
  children,
}: {
  isHidden: boolean;
  children: ReactNode;
}) {
  return (
    <TopBarVisibilityContext.Provider value={{ isHidden }}>
      {children}
    </TopBarVisibilityContext.Provider>
  );
}

export function useTopBarVisibility() {
  return useContext(TopBarVisibilityContext);
}
