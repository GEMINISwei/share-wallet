"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ActionMenu, Button, ErrorState, ICON_SIZE, Notify, useActionSubmit, useNotify,
} from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { deleteCategory } from "../actions"
import { groupCategories } from "../capabilities"
import { walletsMessages } from "../i18n"
import { walletPath } from "../paths"
import type { CategoryInfo, CategoryType, WalletInfo } from "../types"
import CategoryDialog from "./CategoryDialog"
import ConfirmDialog from "./ConfirmDialog"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

type CategoriesViewProps = {
  wallet: WalletInfo
  categories: CategoryInfo[]
  errorMessage: string
}

type Editing = { category: CategoryInfo | null; type: CategoryType } | null

export default function CategoriesView({ wallet, categories, errorMessage }: CategoriesViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<CategoryInfo | null>(null)
  const { isPending, submit } = useActionSubmit()
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  const grouped = groupCategories(categories)

  function handleSaved(message: string) {
    setEditing(null)
    notifySuccess(message)
    router.refresh()
  }

  function confirmDelete() {
    if (!deleting) return
    submit(() => deleteCategory(wallet.id, deleting.id), {
      onSuccess: () => {
        setDeleting(null)
        notifySuccess(t("categoryDeleted"))
        router.refresh()
      },
      onError: (message) => {
        setDeleting(null)
        notifyError(message)
      },
      errorFallback: t("categoryFailed"),
    })
  }

  const groups: { type: CategoryType; title: string }[] = [
    { type: "expense", title: t("expense") },
    { type: "income", title: t("income") },
  ]

  return (
    <WalletShell
      title={t("categories")} subtitle={wallet.name}
      backHref={walletPath(wallet.id)} backLabel={t("backToWallet")}
    >
      {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
      {groups.map((group) => (
        <section key={group.type}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{group.title}</h2>
            {wallet.can_manage && (
              <Button
                variant="outlined" icon={<Plus size={ICON_SIZE.sm} />}
                onClick={() => setEditing({ category: null, type: group.type })}
              >
                {t("addCategory")}
              </Button>
            )}
          </div>
          {grouped[group.type].length === 0 && <p className={styles.hint}>{t("noCategories")}</p>}
          {grouped[group.type].length > 0 && (
            <ul className={styles.list}>
              {grouped[group.type].map((category) => (
                <li key={category.id} className={styles.row}>
                  <span className={styles.rowTitle}>{category.name}</span>
                  {wallet.can_manage && (
                    <ActionMenu
                      items={[
                        {
                          label: t("renameCategory"),
                          onClick: () => setEditing({ category, type: category.type }),
                        },
                        { label: t("deleteCategory"), color: "error", onClick: () => setDeleting(category) },
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <CategoryDialog
        key={editing ? `${editing.category?.id ?? "new"}-${editing.type}` : "closed"}
        walletId={wallet.id} category={editing?.category ?? null}
        defaultType={editing?.type ?? "expense"} open={editing !== null}
        onClose={() => setEditing(null)} onSuccess={handleSaved} onError={notifyError}
      />
      <ConfirmDialog
        open={deleting !== null} message={t("deleteCategoryConfirm", { name: deleting?.name ?? "" })}
        isPending={isPending} onConfirm={confirmDelete} onClose={() => setDeleting(null)}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}
