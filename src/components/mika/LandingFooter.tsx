import { Logo } from "./Logo";
import { Badge } from "@/components/ui/badge";

const cols = [
  {
    title: "Produto",
    items: [
      { label: "Recursos", href: "#recursos" },
      { label: "Planos", href: "#planos" },
      { label: "Skills", href: "#" },
      { label: "Mudanças", href: "#" },
    ],
  },
  {
    title: "Empresa",
    items: [
      { label: "Sobre", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contato", href: "#" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Termos de Uso", href: "#" },
      { label: "Política de Privacidade", href: "#" },
      { label: "LGPD", href: "#" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="bg-background border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <Logo />
            <p className="mt-4 text-sm text-muted-foreground max-w-xs">
              Seu assistente de IA pessoal no Telegram, gerenciado e em português.
            </p>
            <Badge className="mt-4 bg-secondary/15 text-secondary hover:bg-secondary/15 border-0 font-semibold">
              Feito no Brasil 🇧🇷
            </Badge>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold text-foreground">{c.title}</h4>
              <ul className="mt-4 space-y-3">
                {c.items.map((it) => (
                  <li key={it.label}>
                    <a href={it.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {it.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
          © 2026 DOMCO — Todos os direitos reservados. Mika é um produto da DOMCO (AI Solutions On Demand).
        </div>
      </div>
    </footer>
  );
}
