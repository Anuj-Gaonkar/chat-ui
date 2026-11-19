import Image from "next/image";
import hdfcLogo from "@/assets/hdfc-bank-logo.svg";

// The "Ai" screen header from the design system (conversational journeys): the HDFC Bank logo on the
// left, nothing on the right. 48px tall (8px top/bottom padding around the 24px logo), 20px side
// padding, a 1px bottom border, and a translucent white fill with a background blur.
export function Header() {
  return (
    <header className="z-10 flex min-h-12 w-full shrink-0 items-center justify-between border-b border-header-border bg-header px-5 py-2 backdrop-blur-header">
      <Image
        src={hdfcLogo}
        alt="HDFC Bank"
        width={125}
        height={24}
        priority
        className="h-6 w-auto"
      />
    </header>
  );
}
