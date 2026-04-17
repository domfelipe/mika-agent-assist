import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
  };
  return (
    <Link
      to="/"
      aria-label="Mika — página inicial"
      className={cn("font-bold tracking-tight text-foreground", sizes[size], className)}
    >
      Mika<span className="text-accent">.</span>
    </Link>
  );
}
