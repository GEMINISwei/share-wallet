"use client"

import { Button } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import styles from "./wallets.module.css"

type LoadMoreButtonProps = { isPending: boolean; failed: boolean; onClick: () => void }

export default function LoadMoreButton({ isPending, failed, onClick }: LoadMoreButtonProps) {
  const t = useT(walletsMessages)
  return (
    <div className={styles.loadMore}>
      {failed && <p className={styles.hint}>{t("loadMoreFailed")}</p>}
      <Button variant="outlined" disabled={isPending} onClick={onClick}>
        {isPending ? t("loadingMore") : t("loadMore")}
      </Button>
    </div>
  )
}
