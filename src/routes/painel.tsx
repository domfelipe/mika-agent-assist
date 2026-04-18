"use client";

import { createFileRoute, Outlet, redirect, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bot,
  CalendarClock,
  CreditCard,
  Home,
  LogOut,
  Menu,
  Plug,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useSubscriptionRealtime } from "@/hooks/use-subscription-realtime";

const PADDLE_ENV = (import.meta.env.VITE_PADDLE_ENVIRONMENT as string) === "production" ? "live" : "sandbox";
import { Logo } from "@/components/mika/Logo";
import { PaymentIssueBanner } from "@/components/mika/PaymentIssueBanner";
import { CancellationScheduledBanner } from "@/components/mika/CancellationScheduledBanner";
import { TelegramConnectionBanner } from "@/components/mika/telegram/TelegramConnectionBanner";
import { ThemeToggle } from "@/components/mika/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/painel")({
  beforeLoad: () => {
    // Auth real é validada client-side abaixo (Supabase usa localStorage).
    // Mantemos beforeLoad como hook para futuro SSR auth.
  },
  component: PainelLayout,
});

interface NavItem {
  to: "/painel" | "/painel/agente" | "/painel/skills" | "/painel/integracoes" | "/painel/cronjobs" | "/painel/faturamento" | "/painel/configuracoes";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

interface DisabledNavItem {
  to: null;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled: true;
}

const NAV: (NavItem | DisabledNavItem)[] = [
  { to: "/painel", label: "Dashboard", icon: Home },
  { to: "/painel/agente", label: "Meu Agente", icon: Bot },
  { to: "/painel/skills", label: "Skills", icon: Sparkles },
  { to: "/painel/cronjobs", label: "Automações", icon: CalendarClock },
  { to: "/painel/integracoes", label: "Integrações", icon: Plug },
  { to: "/painel/faturamento", label: "Faturamento", icon: CreditCard },
  { to: "/painel/configuracoes", label: "Configurações", icon: Settings },
];

function PainelLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Atualiza queries quando o webhook gravar/alterar a assinatura
  useSubscriptionRealtime();

  // Faturamento permanece acessível mesmo sem assinatura ativa
  // (para que o usuário possa ver o estado e assinar / gerenciar).
  const skipSubGuard = location.pathname.startsWith("/painel/faturamento");

  const { data: hasActiveSub, isLoading: subLoading } = useQuery({
    queryKey: ["has-active-subscription", user?.id, PADDLE_ENV],
    enabled: !!user && !skipSubGuard,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_active_subscription", {
        user_uuid: user!.id,
        check_env: PADDLE_ENV,
      });
      if (error) throw error;
      return data === true;
    },
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: location.pathname } });
    }
  }, [loading, user, navigate, location.pathname]);

  useEffect(() => {
    if (!loading && user && !skipSubGuard && !subLoading && hasActiveSub === false) {
      window.location.href = "/#planos";
    }
  }, [loading, user, skipSubGuard, subLoading, hasActiveSub]);

  const checkingSub = !skipSubGuard && (subLoading || hasActiveSub === false);

  if (loading || !user || checkingSub) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen flex bg-background">
        <DesktopSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetHeader className="p-4 border-b">
                    <SheetTitle><Logo /></SheetTitle>
                  </SheetHeader>
                  <SidebarNav onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <div className="lg:hidden"><Logo /></div>
            </div>

            <UserMenu />
          </header>

          <PaymentIssueBanner />
          <CancellationScheduledBanner />

          <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8">
            <div className="mx-auto max-w-6xl space-y-4">
              <TelegramConnectionBanner />
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-sidebar shrink-0">
      <div className="h-16 px-6 flex items-center border-b border-border">
        <Link to="/" aria-label="Início"><Logo /></Link>
      </div>
      <SidebarNav />
    </aside>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const location = useLocation();
  return (
    <nav className="flex-1 p-3 space-y-1" aria-label="Navegação do painel">
      {NAV.map((item) => {
        const Icon = item.icon;
        if (item.disabled) {
          return (
            <Tooltip key={item.label} delayDuration={150}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground/60 cursor-not-allowed">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Em breve</TooltipContent>
            </Tooltip>
          );
        }
        const active = location.pathname === item.to ||
          (item.to !== "/painel" && location.pathname.startsWith(item.to));
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="rounded-full p-1 h-auto" aria-label="Menu do usuário">
            <Avatar className="h-8 w-8">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-semibold">{profile?.full_name || "Usuário"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/painel/configuracoes" className="cursor-pointer">
              <User className="h-4 w-4 mr-2" /> Perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
