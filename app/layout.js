// app/layout.js
export const metadata = {
  title: "🌌 SPT Novelas",
  description: "Lector de novelas y mangas",
 icons: {
  icon: [
    { url: "/favicon.ico", type: "image/x-icon" },
    { url: "/favicon.png", type: "image/png" },
  ],
},


};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
