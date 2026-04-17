import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mika — Seu assistente de IA pessoal no Telegram" },
      {
        name: "description",
        content:
          "Agentes de IA personalizados que aprendem com você e te atendem direto no Telegram. Planos a partir de R$ 69,90/mês.",
      },
      { name: "author", content: "DOMCO" },
      { name: "theme-color", content: "#F97316" },
      { property: "og:title", content: "Mika — Seu assistente de IA pessoal no Telegram" },
      {
        property: "og:description",
        content:
          "Agentes de IA personalizados que aprendem com você e te atendem direto no Telegram. Planos a partir de R$ 69,90/mês.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:url", content: "https://mika.domco.ai" },
      { property: "og:image", content: "https://mika.domco.ai/og.svg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Mika — Seu assistente de IA pessoal no Telegram" },
      {
        name: "twitter:description",
        content: "Agentes de IA personalizados, em português, direto no Telegram.",
      },
      { name: "twitter:image", content: "https://mika.domco.ai/og.svg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "canonical", href: "https://mika.domco.ai" },
      { rel: "preconnect", href: "https://rsms.me" },
      {
        rel: "stylesheet",
        href: "https://rsms.me/inter/inter.css",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <Outlet />
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  );
}
