import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar (drawer no mobile, fixo no desktop) */}
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 hidden md:flex items-center border-b border-border px-4 shrink-0">
            <SidebarTrigger />
          </header>
          {/* Mobile header */}
          <header className="h-14 flex md:hidden items-center justify-between border-b border-border px-4 shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-8 w-8 text-foreground" />
              <h1 className="font-bold text-foreground tracking-tight text-lg">
                Finance<span className="text-primary">Control</span>
              </h1>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 lg:p-8 pb-20 md:pb-8">
            <Outlet />
          </main>
        </div>
        {/* Bottom nav only on mobile */}
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
