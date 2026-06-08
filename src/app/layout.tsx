// Root layout. Phase 0: minimal shell.
export const metadata = {
  title: "AI Social Marketing Platform",
  description: "Agency-grade AI social media marketing platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
