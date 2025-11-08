import Link from "next/link";
import "../style/NovelCard.css";
export default function NovelCard({ novel }) {
  return (
    <div style={{ border: "1px solid #ccc", padding: "10px" }}>
      <img
  src={novel.coverImage || "/placeholder.jpg"}
  alt={novel.title}
  width="100%"
/>
      <h2>{novel.title}</h2>
      {/* <Link href={`/novel/${novel.id}`}>Ver detalles</Link> */}
    </div>
  );
}

