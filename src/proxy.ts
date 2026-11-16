import { NextResponse, type NextRequest } from "next/server";

/** Cheap gate for signed-in areas: no session cookie → login. getUser() verifies the signature. */
export function proxy(req: NextRequest) {
  if (!req.cookies.has("so_session")) {
    const url = req.nextUrl.clone();
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/watch/:path*", "/profiles/:path*", "/my-list"] };
