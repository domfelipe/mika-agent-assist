import { createFileRoute } from "@tanstack/react-router";
import { LandingHeader } from "@/components/mika/LandingHeader";
import { HeroSection } from "@/components/mika/HeroSection";
import { FeaturesSection } from "@/components/mika/FeaturesSection";
import { HowItWorksSection } from "@/components/mika/HowItWorksSection";
import { PlansSection } from "@/components/mika/PlansSection";
import { FaqSection } from "@/components/mika/FaqSection";
import { LandingFooter } from "@/components/mika/LandingFooter";

export const Route = createFileRoute("/")({
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
