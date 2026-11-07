import type { MetadataRoute } from "next";

import { appEnv } from "@/lib/env";

// A daily-use assistant benefits from being installable, so a visitor who
// wants to check it every morning can add it to their home screen instead of
// re-opening a browser tab. See docs/frontend-ui-system.md for the surfaces
// this launches into.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appEnv.appName,
    short_name: appEnv.appName,
    description: "Public data for daily life in Finland.",
    start_url: "/",
    display: "standalone",
    // Web manifests require literal colors; keep these in sync with the light
    // theme's --canvas and --blue tokens in tokens.css.
    background_color: "#fcfcfd",
    theme_color: "#6e56cf",
    icons: [
      {
        src: "/brand/logo-mark.png",
        sizes: "256x256",
        type: "image/png"
      }
    ]
  };
}
