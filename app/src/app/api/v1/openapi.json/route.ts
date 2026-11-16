import { apiOptions } from "@/lib/api-http";
import { openApiDocument } from "@/lib/api-openapi";
import { SITE_URL } from "@/lib/site";

// The API's OpenAPI description, public and without a token, for docs and code generators.
export function GET() {
  return Response.json(openApiDocument(SITE_URL), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = apiOptions;
