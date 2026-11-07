import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TARO TEST · 나를 읽는 시간",
  description: "생일에서 찾는 성격 카드, 올해의 세운, 10년의 흐름. 웨이트 카드와 네 가지 목소리로 나를 알아가는 시간.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
