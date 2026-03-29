import { NextRequest, NextResponse } from "next/server";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";

const { rewrite } = rewritePath("/docs/*path", "/llms.mdx/*path");

export default async function middleware(request: NextRequest) {
  if (isMarkdownPreferred(request)) {
    const result = rewrite(request.nextUrl.pathname);
    if (result) {
      const url = request.nextUrl.clone();
      url.pathname = result;
      return NextResponse.rewrite(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/docs/:path*"],
};
