// The design system "Footer" (Device: Mobile): placed at the bottom of every screen. Full width, 12px
// top/bottom padding (44px tall with the 20px line), "Bg 900" navy fill, centred white copyright line
// in Inter 400 12px/20px.
export function Footer() {
  return (
    <footer className="flex w-full shrink-0 items-center justify-center bg-footer px-5 py-3">
      <p className="text-center font-[family-name:var(--font-inter)] text-[12px] font-normal leading-5 tracking-normal text-white">
        &copy; Copyright HDFC Bank Ltd.
      </p>
    </footer>
  );
}
