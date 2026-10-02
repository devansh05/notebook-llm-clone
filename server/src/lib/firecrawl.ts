import { Firecrawl } from "firecrawl";
import { ValidationError } from "../types/app-error.js";
import "dotenv/config";

export const scrapeWebsite = async (url: string) => {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  const firecrawl = new Firecrawl({ apiKey: apiKey });

  if (!apiKey) {
    throw new ValidationError("Firecrawl is not configured on the server");
  }

  const client = new Firecrawl({ apiKey });
  const result = await client.scrape(url, {
    formats: ["markdown"],
  });

  const markdown = result.markdown?.trim();

  if (!markdown) {
    throw new ValidationError("Could not extract content from this URL");
  }

  return {
    markdown,
    title: result.metadata?.title,
    sourceUrl: result.metadata?.sourceURL ?? url,
  };
};
