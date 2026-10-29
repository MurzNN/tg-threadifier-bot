import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://murznn.github.io",
  base: "/tg-threadifier-bot",
  integrations: [
    starlight({
      title: "Threadifier",
      description:
        "How to use Threadifier — for chat members, moderators, and operators.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/MurzNN/tg-threadifier-bot",
        },
      ],
      sidebar: [
        { label: "Overview", link: "/" },
        { label: "For members", link: "/members/" },
        { label: "For moderators", link: "/moderators/" },
        { label: "For operators", link: "/operators/" },
      ],
    }),
  ],
});
