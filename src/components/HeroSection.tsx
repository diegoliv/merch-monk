const trustedLogos = ["kodelabs", "Crownbrook", "Library Street Collective", "YETI"];

export function HeroSection() {
  return (
    <section id="hero" className="hero-section" data-scene="hero">
      <div className="hero-copy">
        <h1>Exceptional Merch. Exceptionally Easy.</h1>
        <p>
          Premium branded merchandise, powered by a smarter ordering experience
          that makes creating outstanding swag feel effortless.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="#catalog">Create Merch</a>
          <a className="button button-secondary" href="#final-cta">Book a demo</a>
        </div>
        <div className="trusted-strip" aria-label="Trusted by">
          <span>Trusted by</span>
          <div className="trusted-logos">
            {trustedLogos.map((logo) => (
              <strong key={logo}>{logo}</strong>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}