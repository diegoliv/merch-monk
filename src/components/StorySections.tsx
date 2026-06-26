type SectionProps = {
  id: string;
  title: string;
  body: string;
};

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