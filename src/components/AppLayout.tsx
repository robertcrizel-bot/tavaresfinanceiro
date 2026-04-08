import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar only on desktop */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 hidden md:flex items-center border-b border-border px-4 shrink-0">
            <SidebarTrigger />
          </header>
          {/* Mobile header */}
          <header className="h-14 flex md:hidden items-center border-b border-border px-4 shrink-0">
            <h1 className="font-bold text-foreground tracking-tight text-lg">
              Finance<span className="text-primary">Control</span>
            </h1>
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
