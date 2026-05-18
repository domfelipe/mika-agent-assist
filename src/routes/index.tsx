import { createFileRoute } from "@tanstack/react-router";
import { LandingHeader } from "@/components/mika/LandingHeader";
import { HeroSection } from "@/components/mika/HeroSection";
import { FeaturesSection } from "@/components/mika/FeaturesSection";
import { HowItWorksSection } from "@/components/mika/HowItWorksSection";
import { PlansSection } from "@/components/mika/PlansSection";
import { FaqSection, faqs } from "@/components/mika/FaqSection";
import { LandingFooter } from "@/components/mika/LandingFooter";

const HOME_TITLE = "Mika — Assistente Pessoal IA no Telegram";
const HOME_DESCRIPTION =
  "Agentes de IA personalizados que aprendem com você e atendem direto no Telegram. Planos a partir de R$ 69,90/mês.";
const HOME_URL = "https://mika.domco.ai/";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:url", content: HOME_URL },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: HOME_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main>
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PlansSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
