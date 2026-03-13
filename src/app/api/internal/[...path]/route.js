import { handleInternalApiRequest } from "@/lib/internalApi/handler";

export async function POST(request, { params }) {
  const resolvedParams = await params;
  return handleInternalApiRequest(request, resolvedParams || {});
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  return handleInternalApiRequest(request, resolvedParams || {});
}
