import type { Metadata } from "next";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vercel Deployments",
  description:
    "Manage Vercel deployments — list, cancel, redeploy, filter by team/project",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
