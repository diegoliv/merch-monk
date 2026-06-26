import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { FeatureSection, FinalCtaSection, SplitStatementSection } from "./components/StorySections";
import { GlobalSceneCanvas } from "./three/GlobalSceneCanvas";
import { SceneEditor } from "./three/SceneEditor";
import { useEditorStore } from "./three/editorStore";

export default function App() {
  const editor = useEditorStore();

  return (
    <>
      <GlobalSceneCanvas />
      <div className={`site-ui ${editor.enabled ? "is-editor-open" : ""}`}>
        <Header />
        <main>
          <HeroSection />
          <SplitStatementSection
            id="ordering"
            title="Ordering amazing merch shouldn't take weeks"
            body="One place to discover, design, price, approve, and order. What used to take three weeks of emails now takes minutes."
          />
          <FeatureSection
            id="options"
            title="Too many options isn't a better experience"
            body="Scrolling through hundreds of thousands of products is painful, especially when quality, pricing, and delivery time only get clearer after you ask."
          />
          <FeatureSection
            id="pricing"
            title="Transparent Pricing + Delivery Dates = Confidence"
            body="Create your mockup, set quantities, and watch price and delivery date update in real time. No quote requests, no waiting, no surprises."
          />
          <FinalCtaSection
            id="minutes"
            title="From weeks to minutes"
            body="Everything you need to create and manage amazing merch lives in one place. From product discovery to real time order status and beyond."
          />
        </main>
      </div>
      <SceneEditor />
    </>
  );
}