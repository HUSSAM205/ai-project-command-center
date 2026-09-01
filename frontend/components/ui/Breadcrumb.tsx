import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm text-text-tertiary">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
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
