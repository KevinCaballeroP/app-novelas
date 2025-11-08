// app/layout.js
export const metadata = {
  title: "Novelas App",
  description: "Lector de novelas y mangas",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
