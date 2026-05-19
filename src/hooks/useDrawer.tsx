// Global drawer state — open / close from anywhere.
//
// Sits next to UserContextProvider in the App tree. HamburgerButton
// (rendered inside each screen's top bar) calls openDrawer(); the Drawer
// component (rendered once at the App level) reads `open` and animates
// accordingly. Decoupled this way so each screen doesn't have to know
// the drawer exists — they just expose a button that fires an intent.
//
// Why not just useState inside Drawer? Two reasons:
// 1. The hamburger button lives inside the screen header, not next to
//    the Drawer mount point. Lifting state to the common ancestor is
//    the clean fix; context is the React-y way to do that.
// 2. Closing the drawer on route change (any nav item click) needs to
//    be triggered from inside the Drawer itself. That's just
//    `closeDrawer()` — no need to thread state down.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DrawerCtx = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const Ctx = createContext<DrawerCtx>({
  open: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo<DrawerCtx>(
    () => ({ open, openDrawer, closeDrawer, toggleDrawer }),
    [open, openDrawer, closeDrawer, toggleDrawer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDrawer(): DrawerCtx {
  return useContext(Ctx);
}
