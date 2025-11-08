import Reader from "./Reader"; // moveremos la parte cliente a otro archivo

export default async function ChapterPage({ params }) {
  const resolvedParams = await params; // ✅ aquí sí se puede await, es Server Component
  return <Reader params={resolvedParams} />;
}
