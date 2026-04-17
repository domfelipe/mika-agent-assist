import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <Link to="/" aria-label="Início">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-soft">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
          </div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
