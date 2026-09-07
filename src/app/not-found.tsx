import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel px-6 py-12 text-center">
      <p className="eyebrow">404</p>
      <p className="mt-2 text-[14px] font-medium text-foreground">Nothing at this address.</p>
      <Link href="/" className="mt-3 inline-block text-[12px] text-cyan hover:underline">
        Back to the Portfolio Hub
      </Link>
    </div>
  );
}
