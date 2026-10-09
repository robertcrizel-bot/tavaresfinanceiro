import { LayoutDashboard, List, User, Wallet, Tag, CalendarClock, ArrowLeftRight, PieChart, ReceiptText, ScanLine } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Análises de Despesas", url: "/analises-despesas", icon: PieChart },
  { title: "Meus Registros", url: "/records", icon: List },
  { title: "Extratos", url: "/extratos", icon: ReceiptText },
  { title: "Contas & Cartões", url: "/accounts", icon: Wallet },
  { title: "Transferências", url: "/transfers", icon: ArrowLeftRight },
  { title: "Categorias", url: "/categories", icon: Tag },
  { title: "Previsões", url: "/forecasts", icon: CalendarClock },
];

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const isMobile = useIsMobile();

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "icon"} className="border-r-0">
      <SidebarContent className="bg-sidebar px-2 pt-4">
        <div className="mb-6 px-2">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary font-display text-base font-bold text-sidebar-primary-foreground">F</span>
              <div>
                <h1 className="font-display text-lg font-bold leading-none text-white">FinanceControl</h1>
                <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/55">Financial workspace</p>
              </div>
            </div>
          )}
          {collapsed && !isMobile && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground">F</span>
          )}
        </div>

        <SidebarGroup className="p-0">
          {(!collapsed || isMobile) && <p className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[0.2em] text-sidebar-foreground/40">Workspace</p>}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-white"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-bold ring-1 ring-sidebar-primary/20"
                      onClick={handleNavClick}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {(!collapsed || isMobile) && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {(!collapsed || isMobile) && (
          <NavLink to="/receipt" onClick={handleNavClick} className="mx-1 mt-4 flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/70 p-2.5 text-xs font-semibold text-sidebar-foreground transition-colors hover:text-white" activeClassName="border-sidebar-primary/50 text-sidebar-primary">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary"><ScanLine className="h-4 w-4" /></span>
            <span>Importar comprovante</span>
          </NavLink>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border bg-sidebar p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/profile"
                className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-bold"
                onClick={handleNavClick}
              >
                <User className="h-5 w-5 shrink-0" />
                {(!collapsed || isMobile) && <span>Meu Perfil</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
