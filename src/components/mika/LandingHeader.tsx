"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#como-funciona", label: "Como Funciona" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-200",
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : "bg-transparent border-b border-transparent",
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Logo />

        <nav className="hidden md:flex items-center gap-8" aria-label="Navegação principal">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Button asChild className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]">
              <Link to="/painel" search={{}}>Ir para o painel</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="rounded-lg">
                <Link to="/login">Entrar</Link>
              </Button>
              <Button asChild className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]">
                <Link to="/signup">Começar agora</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex md:hidden items-center gap-1">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <SheetHeader>
                <SheetTitle><Logo /></SheetTitle>
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-1" aria-label="Navegação móvel">
                {NAV.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="text-base font-medium text-foreground py-3 px-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="mt-6 flex flex-col gap-3">
                {user ? (
                  <Button asChild className="rounded-lg w-full bg-primary hover:bg-primary-dark text-primary-foreground">
                    <Link to="/painel" search={{}} onClick={() => setOpen(false)}>Ir para o painel</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="outline" className="rounded-lg w-full">
                      <Link to="/login" onClick={() => setOpen(false)}>Entrar</Link>
                    </Button>
                    <Button asChild className="rounded-lg w-full bg-primary hover:bg-primary-dark text-primary-foreground">
                      <Link to="/signup" onClick={() => setOpen(false)}>Começar agora</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
