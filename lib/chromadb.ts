import { CloudClient } from "chromadb";

export const client = new CloudClient({
  apiKey: process.env.CHROMA_API_KEY || "",
  tenant: process.env.CHROMA_TENANT_ID || "",
  database: process.env.CHROMA_DATABASE_ID || "",
});
