const BASE_PATH = "/rippletypegenerator";

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    if (incoming.pathname === BASE_PATH) {
      incoming.pathname += "/";
      return Response.redirect(incoming.toString(), 308);
    }

    const assetUrl = new URL(incoming);
    const assetPath = incoming.pathname.startsWith(`${BASE_PATH}/`)
      ? incoming.pathname.slice(BASE_PATH.length)
      : incoming.pathname;
    assetUrl.pathname = assetPath === "/" ? "/index.html" : assetPath;

    return env.ASSETS.fetch(new Request(assetUrl, request));
  }
};
