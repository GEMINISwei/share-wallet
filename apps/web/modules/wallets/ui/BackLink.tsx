import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ICON_SIZE } from "@/shared/ui"
import styles from "./wallets.module.css"

export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={styles.backLink}>
      <ChevronLeft size={ICON_SIZE.sm} aria-hidden="true" />
      {label}
    </Link>
  )
}
