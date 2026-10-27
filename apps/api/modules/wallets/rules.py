"""不碰資料庫的計算規則: 均分的零頭、結算的清償方案。

輸入與輸出都是單純的值, 測試直接呼叫, 不用準備錢包。
"""

from .model import PlannedTransfer, ShareDetail


def split_equally(
    amount: int, payer_id: str, participant_ids: list[str], member_ids: list[str]
) -> list[ShareDetail]:
    """除不盡的零頭依序一人一份: 付款人優先, 其餘照加入順序。結果依加入順序排列。

    `member_ids` 是加入錢包的順序; 分攤對象都要在裡面 (呼叫端先檢查)。
    """
    chosen = set(participant_ids)
    ordered = [user_id for user_id in member_ids if user_id in chosen]
    base, remainder = divmod(amount, len(ordered))
    # sorted 是穩定的: 付款人移到最前面, 其他人維持加入順序。
    priority = sorted(ordered, key=lambda user_id: user_id != payer_id)
    extra = set(priority[:remainder])
    return [{"user_id": user_id, "amount": base + (user_id in extra)} for user_id in ordered]


def plan_transfers(nets: list[tuple[str, int]]) -> list[PlannedTransfer]:
    """依每人淨額 (依加入順序, 加總為 0) 算出清償方案, 依付款人、收款人的加入順序排列。

    先把金額剛好相同的一對配成一筆, 剩下的每次讓應付最多的付給應收最多的, 同額照加入順序。
    每一筆至少讓一個人歸零, 所以最多是有帳的人數 − 1 筆。不追求真正最少的理由見
    docs/features/travel-wallet.md〈結算流程〉。
    """
    order = {user_id: index for index, (user_id, _) in enumerate(nets)}
    debts = {user_id: -net for user_id, net in nets if net < 0}
    credits = {user_id: net for user_id, net in nets if net > 0}
    transfers: list[PlannedTransfer] = []

    def pay(debtor: str, creditor: str, amount: int) -> None:
        transfers.append({"from_user_id": debtor, "to_user_id": creditor, "amount": amount})
        for balances, user_id in ((debts, debtor), (credits, creditor)):
            balances[user_id] -= amount
            if balances[user_id] == 0:
                del balances[user_id]

    for debtor in list(debts):
        match = next((user_id for user_id in credits if credits[user_id] == debts[debtor]), None)
        if match is not None:
            pay(debtor, match, debts[debtor])

    def largest(balances: dict[str, int]) -> str:
        return max(balances, key=lambda user_id: (balances[user_id], -order[user_id]))

    while debts:
        debtor, creditor = largest(debts), largest(credits)
        pay(debtor, creditor, min(debts[debtor], credits[creditor]))

    transfers.sort(key=lambda t: (order[t["from_user_id"]], order[t["to_user_id"]]))
    return transfers
