type MockSectionProps = {
  id: string;
  label: string;
  title: string;
  body: string;
};

export function MockSection({ id, label, title, body }: MockSectionProps) {
  return (
    <section id={id} className="mock-section" data-scene={id}>
      <div className="mock-section-inner">
        <span>{label}</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </section>
  );
}
