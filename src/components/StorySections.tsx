import type { CSSProperties } from "react";

type SectionProps = {
  id: string;
  title: string;
  body: string;
};

export type ProductCupColorKey = "orange" | "white" | "blue" | "black";

export type ProductCupColorValue = {
  color: string;
  darkColor: string;
};

export type ProductCupColor = ProductCupColorValue & {
  key: ProductCupColorKey;
  label: string;
};

export type ProductCupDecorationMethod = "print" | "engraved" | "digital";

export const productCupColors: ProductCupColor[] = [
  { key: "orange", label: "Orange", color: "#ff4a09", darkColor: "#9f3000" },
  { key: "white", label: "White", color: "#f7f7f4", darkColor: "#c9c6bd" },
  { key: "blue", label: "Blue", color: "#47a3e8", darkColor: "#176aa5" },
  { key: "black", label: "Black", color: "#111111", darkColor: "#020202" },
];

export function SplitStatementSection({ id, title, body }: SectionProps) {
  return (
    <section id={id} className="story-section story-section-split" data-scene={id}>
      <div className="story-copy story-copy-left">
        <h2>{title}</h2>
      </div>
      <div className="story-copy story-copy-right">
        <p>{body}</p>
      </div>
    </section>
  );
}

export function FeatureSection({ id, title, body }: SectionProps) {
  return (
    <section id={id} className="story-section story-section-left" data-scene={id}>
      <div className="story-copy">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </section>
  );
}

type PricingConfiguratorSectionProps = SectionProps & {
  selectedColor: ProductCupColorKey;
  onColorChange: (color: ProductCupColorKey) => void;
};

export function PricingConfiguratorSection({ id, title, body, selectedColor, onColorChange }: PricingConfiguratorSectionProps) {
  return (
    <section id={id} className="story-section pricing-config-section" data-scene={id}>
      <div className="story-copy pricing-copy">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="pricing-configurator" aria-label="Product configuration preview">
        <div className="product-preview-panel" aria-hidden="true">
          <div className="product-cup-stage" data-3d-pin="product_cup" data-3d-pin-breakpoint="mobile" />
        </div>

        <div className="config-card">
          <h3>Design your product</h3>
          <div className="config-step">
            <strong>1. Choose artwork</strong>
            <div className="upload-field">Logo.png</div>
          </div>
          <div className="config-step">
            <strong>2. Choose imprint location</strong>
            <div className="segmented-control two-columns">
              <span className="is-selected">Front panel upper center</span>
              <span>Back panel upper center</span>
            </div>
          </div>
          <div className="config-step">
            <strong>3. Choose decoration method</strong>
            <div className="segmented-control three-columns">
              <span className="is-selected">Print</span>
              <span>Laser engraving</span>
              <span>Digital print</span>
            </div>
          </div>
          <div className="pricing-summary">
            <div>
              <span>Price</span>
              <strong>$51.40</strong>
              <small>Per unit</small>
            </div>
            <div>
              <span>See pricing list</span>
              <strong>Arrives by June 15, 2026</strong>
            </div>
          </div>
          <button className="config-order-button" type="button">Order Now</button>
        </div>

        <div className="color-swatches" aria-label="Choose tumbler color">
          {productCupColors.map((option) => (
            <button
              key={option.key}
              className={`color-swatch ${selectedColor === option.key ? "is-selected" : ""}`}
              type="button"
              aria-label={option.label}
              aria-pressed={selectedColor === option.key}
              style={{ "--swatch-color": option.color } as CSSProperties}
              onClick={() => onColorChange(option.key)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection({ id, title, body }: SectionProps) {
  return (
    <section id={id} className="story-section story-section-cta" data-scene={id}>
      <div className="story-copy story-copy-center">
        <h2>{title}</h2>
        <p>{body}</p>
        <a className="button button-primary story-cta-button" href="#ordering">Create Merch</a>
      </div>
    </section>
  );
}
