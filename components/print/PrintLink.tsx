import { Icon } from "@/components/ui/Icon";

/** Opens a printable document in a new tab, which brings up the print dialog. */
export function PrintLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="btn btn-ghost">
      <Icon name="printer" size={17} />
      {label}
    </a>
  );
}
