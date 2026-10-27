export const metadata = { title: "Impressum", robots: { index: false } };

export default function Impressum() {
  const name = process.env.NEXT_PUBLIC_OPERATOR_NAME;
  const addr = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS;
  const mail = process.env.NEXT_PUBLIC_OPERATOR_EMAIL;
  return (
    <article className="legal">
      <h1>Impressum</h1>
      {name ? (
        <p>{name}<br />{addr}<br />{mail && <a href={`mailto:${mail}`}>{mail}</a>}</p>
      ) : (
        <p className="warn">Vorschau-Version — die Angaben zum Betreiber werden vor dem öffentlichen Start ergänzt.</p>
      )}
      <p>Dieser Dienst sammelt öffentlich zugängliche Angebote automatisch und verlinkt auf die Originalquelle. Für Preise, Verfügbarkeit und Bedingungen ist allein der jeweilige Anbieter massgebend.</p>
    </article>
  );
}
