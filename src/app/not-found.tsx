import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="card card-p text-center">
        <div className="text-4xl text-slate-300">404</div>
        <h1 className="mt-2 text-lg font-bold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-500">The record may have been deleted or the link is incorrect.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/" className="btn btn-primary btn-sm">
            Dashboard
          </Link>
          <Link href="/orders" className="btn btn-secondary btn-sm">
            Orders
          </Link>
        </div>
      </div>
    </div>
  );
}
