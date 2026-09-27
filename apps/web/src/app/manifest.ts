import type { MetadataRoute } from "next";

import { appEnv } from "@/lib/env";

// A daily-use assistant benefits from being installable, so a visitor who
// wants to check it every morning can add it to their home screen instead of
// re-opening a browser tab. See docs/frontend-ui-system.md for the surfaces
// this launches into.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${appEnv.appName}. Public data. Practical decisions.`,
    short_name: appEnv.appName,
    description:
      "Practical daily guidance for life in Finland, grounded in transparent public data.",
    start_url: "/",
    display: "standalone",
    // Web manifests require literal colors; keep these in sync with the light
    // theme's --canvas and --blue tokens in tokens.css.
    background_color: "#f3f1ec",
    theme_color: "#2b4a52",
    icons: [
      {
        src: "/brand/logo-mark.png",
        sizes: "256x256",
        type: "image/png"
      }
    ]
  };
}
