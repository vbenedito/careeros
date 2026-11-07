"use client";

/**
 * Collapsible sidebar in the spirit of shadcn/ui's `Sidebar` (collapsible="icon"), kept small:
 * desktop collapses to icons (state persisted in a cookie, DASH-01); below `md` it is a drawer
 * opened from the header (DASH-02).
 */
import { PanelLeft } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Sheet, SheetContent, SheetTitle } from "./sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

export const SIDEBAR_COOKIE = "sidebar_state";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;
const MOBILE_QUERY = "(max-width: 767px)";

interface SidebarState {
  /** Desktop: expanded (true) or icons only (false). */
  open: boolean;
  /** Mobile drawer. */
  mobileOpen: boolean;
  isMobile: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("useSidebar must be used inside SidebarProvider");
  return value;
}

export function SidebarProvider({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const toggle = useCallback(() => {
    if (isMobile) return setMobileOpen((v) => !v);
    setOpen((v) => {
      // biome-ignore lint/suspicious/noDocumentCookie: the component's documented persistence (DASH-01)
      document.cookie = `${SIDEBAR_COOKIE}=${!v}; path=/; max-age=${COOKIE_MAX_AGE_S}; samesite=lax`;
      return !v;
    });
  }, [isMobile]);

  const value = useMemo(
    () => ({ open, mobileOpen, isMobile, setMobileOpen, toggle }),
    [open, mobileOpen, isMobile, toggle],
  );
  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </SidebarContext.Provider>
  );
}

/** The sidebar itself: an aside on desktop, a drawer on mobile. */
export function Sidebar({ children, label }: { children: ReactNode; label: string }) {
  const { open, mobileOpen, setMobileOpen } = useSidebar();
  return (
    <>
      <aside
        aria-label={label}
        data-state={open ? "expanded" : "collapsed"}
        className={cn(
          "group/sidebar sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card transition-[width] md:flex",
          open ? "w-60" : "w-14",
        )}
      >
        {children}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          id="mobile-sidebar"
          aria-describedby={undefined}
          className="md:hidden"
          overlayClassName="md:hidden"
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <div data-state="expanded" className="group/sidebar flex h-full flex-col bg-card">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggle, open, isMobile, mobileOpen } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={isMobile ? "Open menu" : open ? "Collapse sidebar" : "Expand sidebar"}
      aria-expanded={isMobile ? mobileOpen : open}
      {...(isMobile ? { "aria-controls": "mobile-sidebar" } : {})}
    >
      <PanelLeft />
    </Button>
  );
}

export function SidebarSection({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-2", className)} {...props} />;
}

/** Nav link with icon; shows a tooltip with its label when the sidebar is collapsed. */
export function SidebarItem(props: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  const { open, isMobile } = useSidebar();
  const link = (
    <a
      href={props.href}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        props.active && "bg-muted text-foreground",
      )}
    >
      {props.icon}
      <span className="truncate group-data-[state=collapsed]/sidebar:sr-only">{props.label}</span>
    </a>
  );
  if (open || isMobile) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{props.label}</TooltipContent>
    </Tooltip>
  );
}
