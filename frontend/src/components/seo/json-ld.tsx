/**
 * Renders one or more JSON-LD (schema.org) blocks as <script type="application/ld+json">.
 * Search engines read these to understand the organisation, the product and the
 * FAQ, which earns rich results and helps ranking. Data lives in
 * src/config/structured-data.ts so it stays accurate and in one place.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify output is data, not markup; safe to inline.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
