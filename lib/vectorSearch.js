// /lib/vectorSearch.js
import ChapterEmbedding from "@/models/ChapterEmbedding";
import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Recuperar contexto para generar el próximo capítulo
export async function getRelevantChapters(novelId, queryText, limit = 4) {
  const embedRes = await client.embeddings.create({
    model: "nomic-embed-text",
    input: queryText
  });

  const queryVector = embedRes.data[0].embedding;

  const results = await ChapterEmbedding.aggregate([
    {
      $search: {
        index: "chapter_vector_index",
        knnBeta: {
          vector: queryVector,
          path: "embedding",
          k: limit,
        }
      }
    },
    { $limit: limit }
  ]);

  return results;
}
