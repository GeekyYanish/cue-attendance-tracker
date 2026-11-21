import "../style.css";

export const metadata = {
  title: "CUE Attendance",
  description: "Track attendance, set subject targets, and project pending co-curricular claims.",
  icons: { icon: "/favicon.ico" },
};

export const viewport = { themeColor: "#f5f7f2" };

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
