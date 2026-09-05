import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm text-text-tertiary">
        {items.map((item, i) => (
          <Fragment key={i}>
            {/* rtl:rotate-180: under dir="rtl" the trail reads right-to-left, so the separator
                must point back toward the start (left) instead of forward (right). */}
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden="true" />}
            <li>
              {item.href ? (
                <Link href={item.href} className="hover:text-text-primary transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className="text-text-primary font-medium" aria-current="page">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
