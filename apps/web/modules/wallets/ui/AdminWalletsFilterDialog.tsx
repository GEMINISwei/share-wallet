"use client"

import { FilterDialog } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import type { AdminWalletFilters } from "../types"

type AdminWalletsFilterDialogProps = {
  open: boolean
  onClose: () => void
  filters: AdminWalletFilters
}

export default function AdminWalletsFilterDialog({
  open, onClose, filters,
}: AdminWalletsFilterDialogProps) {
  const t = useT(walletsMessages)
  return (
    <FilterDialog
      title={t("filterTitle")}
      open={open}
      onClose={onClose}
      fields={[
        { name: "name", label: t("colName"), type: "text" },
        {
          name: "kind",
          label: t("kind"),
          type: "select",
          options: [
            { value: "", label: t("filterAll") },
            { value: "general", label: t("kindGeneral") },
            { value: "travel", label: t("kindTravel") },
          ],
        },
      ]}
      initialValues={{ name: filters.name, kind: filters.kind }}
    />
  )
}
