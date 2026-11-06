import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "말랑콩떡 · 매장 노트",
    short_name: "말랑콩떡",
    description: "함께 쓰는 떡집 주문·생산·재고 노트",
    start_url: "/",
    display: "standalone",
    background_color: "#faf5e9",
    theme_color: "#895f36",
    lang: "ko",
    icons: [
      {
        src: "/brand/malrang-logo.png",
        sizes: "1200x1200",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
