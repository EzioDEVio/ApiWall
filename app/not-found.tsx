import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page narrow">
      <h1>That tile isn&apos;t on the map</h1>
      <p className="lede">The page you asked for doesn&apos;t exist.</p>
      <Link href="/" className="btn btn-primary">
        Back to the mosaic
      </Link>
    </div>
  );
}
