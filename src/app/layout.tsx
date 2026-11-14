import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { themeVariables } from "@/lib/theme";
import { brand } from "@/lib/brand";
import { AppUpdateChecker } from "@/components/app-update-checker";
import "./globals.css";
import "./order-pickers.css";
import "./order-calendar.css";
import "./brand.css";
import "./menu-catalog.css";
import "./production.css";
import "./menu-manager.css";
import "./stickers.css";
export const metadata: Metadata = {
  title: "말랑콩떡 — 매장 노트",
  description: "주문부터 생산, 재고와 마감까지. 함께 쓰는 떡집 매장 노트.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "말랑콩떡" },
  icons: { icon: "/brand/malrang-logo.png", apple: "/brand/malrang-logo.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: brand.color,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" style={themeVariables() as CSSProperties}>
      <body>
        <AppUpdateChecker />
        {children}
      </body>
    </html>
  );
}
