import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-zinc-400">That title isn’t available.</p>
      <Link href="/" className="mt-4 inline-block underline">Back to home</Link>
    </div>
  );
}
