import { handleInternalApiRequest } from "@/lib/internalApi/handler";

export async function POST(request) {
  return handleInternalApiRequest(request, {});
}

export async function GET(request) {
  return handleInternalApiRequest(request, {});
}
