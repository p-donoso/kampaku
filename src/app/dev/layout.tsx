import { Noto_Serif_JP } from "next/font/google";

const notoSerifJp = Noto_Serif_JP({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
  display: "swap",
});

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${notoSerifJp.variable} fixed inset-0 z-50 overflow-y-auto`}>
      {children}
    </div>
  );
}
