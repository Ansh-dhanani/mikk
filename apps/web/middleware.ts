import { NextRequest, NextResponse } from "next/server";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";

const { rewrite } = rewritePath("/docs/*path", "/llms.mdx/*path");

export default function middleware(request: NextRequest) {
  if (isMarkdownPreferred(request)) {
    const result = rewrite(request.nextUrl.pathname);
    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/docs/:path*"],
};
